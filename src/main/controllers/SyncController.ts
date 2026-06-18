import { ipcMain } from 'electron'
import { BaseController } from './BaseController'
import mysql from 'mysql2/promise'
import pg from 'pg'


function parseMysqlUrl(url: string, extraOptions: any = {}) {
    const parsed = new URL(url);
    return {
        host: parsed.hostname,
        port: Number(parsed.port) || 3306,
        user: parsed.username,
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.slice(1),
        ...extraOptions
    };
}

export class SyncController extends BaseController {
    registerHandlers(): void {
        ipcMain.handle('sync-direct', this.syncDirect.bind(this))
        ipcMain.handle('fetch-remote-data', this.fetchRemoteData.bind(this))
        ipcMain.handle('get-remote-projects', this.getRemoteProjects.bind(this))
        ipcMain.handle('get-remote-project-metadata', this.getRemoteProjectMetadata.bind(this))
        ipcMain.handle('delete-remote-project', this.deleteRemoteProject.bind(this))
        ipcMain.handle('fetch-sync-queue', this.fetchSyncQueue.bind(this))
        ipcMain.handle('update-sync-queue-status', this.updateSyncQueueStatus.bind(this))
        ipcMain.handle('fetch-remote-entity', this.fetchRemoteEntity.bind(this))
    }

    async syncDirect(_event: any, url: string, projectId: string, entries: any[], branchName: string, resetRemote: boolean = false) {
        console.log(`[SyncController] sync-direct | Project: ${projectId} | Branch: ${branchName} | Reset: ${resetRemote}`)
        
        if (!branchName || branchName === 'undefined') {
            return { success: false, error: 'Valid branch context required' }
        }

        const isMysql = url.startsWith('mysql')
        const results: any[] = []

        try {
            if (isMysql) {
                const conn = await mysql.createConnection(parseMysqlUrl(url, { multipleStatements: true, connectTimeout: 30000, timezone: 'Z' }))
                
                // 1. Ensure project exists
                await conn.execute('INSERT INTO projects (id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE id=id', [projectId, 'New Project'])

                // Ensure synced_branches column exists
                try {
                    await conn.execute('ALTER TABLE projects ADD COLUMN synced_branches TEXT');
                } catch(e) { /* ignore if already exists */ }

                // 2. Handle Branch Synchronization Logic (One branch at a time)
                const [rows]: any = await conn.execute('SELECT synced_branches FROM projects WHERE id = ?', [projectId])
                let syncedBranches: string[] = []
                if (rows.length > 0 && rows[0].synced_branches) {
                    try { 
                        const parsed = typeof rows[0].synced_branches === 'string' ? JSON.parse(rows[0].synced_branches) : rows[0].synced_branches
                        syncedBranches = Array.isArray(parsed) ? parsed : []
                    } catch(e) { /* ignore */ }
                }

                if (resetRemote) {
                    console.log(`[SyncController] Resetting remote data for project ${projectId} before pushing branch ${branchName}`)
                    await conn.execute('DELETE FROM api_collections WHERE project_id = ?', [projectId])
                    await conn.execute('DELETE FROM folders WHERE project_id = ?', [projectId])
                    await conn.execute('DELETE FROM environments WHERE project_id = ?', [projectId])
                    await conn.execute('UPDATE projects SET synced_branches = ? WHERE id = ?', [JSON.stringify([branchName.trim()]), projectId])
                } else if (syncedBranches.length > 0 && !syncedBranches.includes(branchName.trim())) {
                    // Strictly enforce one branch: if another branch is already synced, require reset
                    await conn.end()
                    return { 
                        success: false, 
                        error: `Branch "${branchName}" is not connected to this remote database. Another branch ("${syncedBranches[0]}") is currently connected. Please click "CONNECT" to switch the remote sync to this branch (this will wipe existing remote data).`
                    }
                } else if (syncedBranches.length === 0) {
                    // First time sync: allow automatic connection
                    await conn.execute('UPDATE projects SET synced_branches = ? WHERE id = ?', [JSON.stringify([branchName.trim()]), projectId])
                }

                // 3. Process Entries with conflict detection
                for (const entry of entries) {
                    const { tableName, operation, data } = entry
                    const payload = typeof data === 'string' ? JSON.parse(data) : data
                    const baseVersion = payload.baseVersion || 0
                    try {
                        if (tableName === 'projects') {
                            await conn.execute(
                                'INSERT INTO projects (id, name, database_url, proxy_url, last_deployed_at, version, is_deleted, deleted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, database_url = ?, proxy_url = ?, last_deployed_at = ?, version = ?, is_deleted = ?, deleted_at = ?, updated_at = ?',
                                [
                                    payload.id, payload.name, payload.databaseUrl || '', payload.proxyUrl || '', payload.lastDeployedAt ? new Date(payload.lastDeployedAt) : null, payload.version || 1, payload.isDeleted ? 1 : 0, payload.deletedAt ? new Date(payload.deletedAt) : null, payload.updatedAt ? new Date(payload.updatedAt) : null,
                                    payload.name, payload.databaseUrl || '', payload.proxyUrl || '', payload.lastDeployedAt ? new Date(payload.lastDeployedAt) : null, payload.version || 1, payload.isDeleted ? 1 : 0, payload.deletedAt ? new Date(payload.deletedAt) : null, payload.updatedAt ? new Date(payload.updatedAt) : null
                                ]
                            )
                        } else if (tableName === 'folders') {
                            if (operation === 'create' || operation === 'update') {
                                const [existing]: any = await conn.execute('SELECT version, is_deleted FROM folders WHERE id = ? AND branch = ?', [payload.id, branchName])
                                if (existing.length > 0 && baseVersion > 0 && (existing[0].version || 1) > baseVersion) {
                                    results.push({ id: entry.id, status: 'conflict', dbVersion: existing[0].version, localVersion: payload.version, baseVersion, isDeleted: existing[0].is_deleted ? true : false })
                                    continue
                                }
                                await conn.execute(
                                    'INSERT INTO folders (id, project_id, branch, name, description, order_index, version, is_deleted, deleted_at, sync_status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, description = ?, order_index = ?, version = ?, is_deleted = ?, deleted_at = ?, sync_status = ?, updated_at = ?',
                                    [payload.id, payload.projectId, branchName, payload.name, payload.description || '', payload.orderIndex || 0, payload.version || 1, payload.isDeleted ? 1 : 0, payload.deletedAt ? new Date(payload.deletedAt) : null, 'synced', payload.updatedAt ? new Date(payload.updatedAt) : null, payload.name, payload.description || '', payload.orderIndex || 0, payload.version || 1, payload.isDeleted ? 1 : 0, payload.deletedAt ? new Date(payload.deletedAt) : null, 'synced', payload.updatedAt ? new Date(payload.updatedAt) : null]
                                )
                            } else if (operation === 'delete') {
                                const [existing]: any = await conn.execute('SELECT version, is_deleted FROM folders WHERE id = ? AND branch = ?', [payload.id, branchName])
                                if (existing.length > 0 && baseVersion > 0 && (existing[0].version || 1) > baseVersion) {
                                    results.push({ id: entry.id, status: 'conflict', dbVersion: existing[0].version, localVersion: payload.version, baseVersion, isDeleted: existing[0].is_deleted ? true : false })
                                    continue
                                }
                                // Soft delete: mark child APIs and folder as deleted
                                await conn.execute('UPDATE api_collections SET is_deleted = 1, deleted_at = NOW(), version = version + 1 WHERE folder_id = ? AND branch = ?', [payload.id, branchName])
                                await conn.execute('UPDATE folders SET is_deleted = 1, deleted_at = NOW(), version = version + 1 WHERE id = ? AND branch = ?', [payload.id, branchName])
                            }
                        } else if (tableName === 'apiCollections') {
                            if (operation === 'create' || operation === 'update') {
                                const [existing]: any = await conn.execute('SELECT version, is_deleted FROM api_collections WHERE id = ? AND branch = ?', [payload.id, branchName])
                                if (existing.length > 0 && baseVersion > 0 && (existing[0].version || 1) > baseVersion) {
                                    results.push({ id: entry.id, status: 'conflict', dbVersion: existing[0].version, localVersion: payload.version, baseVersion, isDeleted: existing[0].is_deleted ? true : false })
                                    continue
                                }
                                await conn.execute(
                                    `INSERT INTO api_collections (
                                        id, project_id, folder_id, branch, name, description, method, path, 
                                        url_params, headers, body_type, raw_type, form_data, urlencoded,
                                        request_body, response_examples, version, is_deleted, deleted_at, sync_status, updated_at
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                                    ON DUPLICATE KEY UPDATE 
                                        name=?, description=?, method=?, path=?, url_params=?, headers=?, 
                                        body_type=?, raw_type=?, form_data=?, urlencoded=?,
                                        request_body=?, response_examples=?, version=?, is_deleted=?, deleted_at=?, sync_status=?, updated_at=?`,
                                    [
                                        payload.id, payload.projectId, payload.folderId || null, branchName, payload.name, payload.description || '', payload.method, payload.path,
                                        JSON.stringify(payload.urlParams || []), JSON.stringify(payload.headers || []),
                                        payload.bodyType || 'none', payload.rawType || 'json',
                                        JSON.stringify(payload.formData || []), JSON.stringify(payload.urlencoded || []),
                                        payload.requestBody || '',
                                        JSON.stringify(payload.responseExamples || []), payload.version || 1, payload.isDeleted ? 1 : 0, payload.deletedAt ? new Date(payload.deletedAt) : null, 'synced', payload.updatedAt ? new Date(payload.updatedAt) : null,
                                        payload.name, payload.description || '', payload.method, payload.path,
                                        JSON.stringify(payload.urlParams || []), JSON.stringify(payload.headers || []),
                                        payload.bodyType || 'none', payload.rawType || 'json',
                                        JSON.stringify(payload.formData || []), JSON.stringify(payload.urlencoded || []),
                                        payload.requestBody || '',
                                        JSON.stringify(payload.responseExamples || []), payload.version || 1, payload.isDeleted ? 1 : 0, payload.deletedAt ? new Date(payload.deletedAt) : null, 'synced', payload.updatedAt ? new Date(payload.updatedAt) : null
                                    ]
                                )
                            } else if (operation === 'delete') {
                                const [existing]: any = await conn.execute('SELECT version, is_deleted FROM api_collections WHERE id = ? AND branch = ?', [payload.id, branchName])
                                if (existing.length > 0 && baseVersion > 0 && (existing[0].version || 1) > baseVersion) {
                                    results.push({ id: entry.id, status: 'conflict', dbVersion: existing[0].version, localVersion: payload.version, baseVersion, isDeleted: existing[0].is_deleted ? true : false })
                                    continue
                                }
                                // Soft delete
                                await conn.execute('UPDATE api_collections SET is_deleted = 1, deleted_at = NOW(), version = version + 1 WHERE id = ? AND branch = ?', [payload.id, branchName])
                            }
                        } else if (tableName === 'environments') {
                            if (operation === 'create' || operation === 'update') {
                                const [existing]: any = await conn.execute('SELECT version, is_deleted FROM environments WHERE id = ? AND branch = ?', [payload.id, branchName])
                                if (existing.length > 0 && baseVersion > 0 && (existing[0].version || 1) > baseVersion) {
                                    results.push({ id: entry.id, status: 'conflict', dbVersion: existing[0].version, localVersion: payload.version, baseVersion, isDeleted: existing[0].is_deleted ? true : false })
                                    continue
                                }
                                await conn.execute(
                                    'INSERT INTO environments (id, project_id, folder_id, branch, name, base_url, is_global, variables, version, is_deleted, deleted_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE project_id=?, folder_id=?, name=?, base_url=?, is_global=?, variables=?, version=?, is_deleted=?, deleted_at=?, updated_at=?',
                                    [
                                        payload.id, payload.projectId, payload.folderId || null, branchName, payload.name, payload.baseUrl || '', payload.isGlobal ? 1 : 0, payload.variables || '{}', payload.version || 1, payload.isDeleted ? 1 : 0, payload.deletedAt ? new Date(payload.deletedAt) : null, payload.updatedAt ? new Date(payload.updatedAt) : null,
                                        payload.projectId, payload.folderId || null, payload.name, payload.baseUrl || '', payload.isGlobal ? 1 : 0, payload.variables || '{}', payload.version || 1, payload.isDeleted ? 1 : 0, payload.deletedAt ? new Date(payload.deletedAt) : null, payload.updatedAt ? new Date(payload.updatedAt) : null
                                    ]
                                )
                            } else if (operation === 'delete') {
                                const [existing]: any = await conn.execute('SELECT version, is_deleted FROM environments WHERE id = ? AND branch = ?', [payload.id, branchName])
                                if (existing.length > 0 && baseVersion > 0 && (existing[0].version || 1) > baseVersion) {
                                    results.push({ id: entry.id, status: 'conflict', dbVersion: existing[0].version, localVersion: payload.version, baseVersion, isDeleted: existing[0].is_deleted ? true : false })
                                    continue
                                }
                                // Soft delete
                                await conn.execute('UPDATE environments SET is_deleted = 1, deleted_at = NOW(), version = version + 1 WHERE id = ? AND branch = ?', [payload.id, branchName])
                            }
                        }
                        results.push({ id: entry.id, status: 'synced' })
                    } catch (err: any) {
                        results.push({ id: entry.id, status: 'failed', error: err.message })
                    }
                }
                await conn.end()
                return { success: true, results }
            } else {
                // Postgres logic
                const client = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })
                
                // 1. Ensure project exists
                await client.query("SET timezone = 'UTC'")
                await client.query('INSERT INTO projects (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [projectId, 'New Project'])

                // Ensure synced_branches column exists
                try {
                    await client.query('ALTER TABLE projects ADD COLUMN synced_branches TEXT');
                } catch(e) { /* ignore if already exists */ }

                // 2. Handle Reset / Branch Enforcement
                const { rows: pgRows } = await client.query('SELECT synced_branches FROM projects WHERE id = $1', [projectId])
                let pgSyncedBranches: string[] = []
                if (pgRows.length > 0 && pgRows[0].synced_branches) {
                    try {
                        const parsed = typeof pgRows[0].synced_branches === 'string' ? JSON.parse(pgRows[0].synced_branches) : pgRows[0].synced_branches
                        pgSyncedBranches = Array.isArray(parsed) ? parsed : []
                    } catch (e) { /* ignore */ }
                }

                if (resetRemote) {
                    await client.query('DELETE FROM api_collections WHERE project_id = $1', [projectId])
                    await client.query('DELETE FROM folders WHERE project_id = $1', [projectId])
                    await client.query('DELETE FROM environments WHERE project_id = $1', [projectId])
                    await client.query('UPDATE projects SET synced_branches = $1 WHERE id = $2', [JSON.stringify([branchName.trim()]), projectId])
                } else if (pgSyncedBranches.length > 0 && !pgSyncedBranches.includes(branchName.trim())) {
                    await client.end()
                    return { 
                        success: false, 
                        error: `Branch "${branchName}" is not connected to this remote database. Another branch ("${pgSyncedBranches[0]}") is currently connected. Please click "CONNECT" to switch the remote sync to this branch (this will wipe existing remote data).`
                    }
                } else if (pgSyncedBranches.length === 0) {
                    await client.query('UPDATE projects SET synced_branches = $1 WHERE id = $2', [JSON.stringify([branchName.trim()]), projectId])
                }

                for (const entry of entries) {
                    const { tableName, operation, data } = entry
                    const payload = typeof data === 'string' ? JSON.parse(data) : data
                    const baseVersion = payload.baseVersion || 0
                    try {
                        if (tableName === 'projects') {
                            await client.query(
                                'INSERT INTO projects (id, name, database_url, proxy_url, last_deployed_at, version, is_deleted, deleted_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO UPDATE SET name = $2, database_url = $3, proxy_url = $4, last_deployed_at = $5, version = $6, is_deleted = $7, deleted_at = $8, updated_at = $9',
                                [payload.id, payload.name, payload.databaseUrl || '', payload.proxyUrl || '', payload.lastDeployedAt ? new Date(payload.lastDeployedAt) : null, payload.version || 1, payload.isDeleted || false, payload.deletedAt ? new Date(payload.deletedAt) : null, payload.updatedAt ? new Date(payload.updatedAt) : null]
                            )
                        } else if (tableName === 'folders') {
                            if (operation === 'create' || operation === 'update') {
                                const { rows: existing } = await client.query('SELECT version, is_deleted FROM folders WHERE id = $1 AND branch = $2', [payload.id, branchName])
                                if (existing.length > 0 && baseVersion > 0 && (existing[0].version || 1) > baseVersion) {
                                    results.push({ id: entry.id, status: 'conflict', dbVersion: existing[0].version, localVersion: payload.version, baseVersion, isDeleted: existing[0].is_deleted ? true : false })
                                    continue
                                }
                                await client.query(
                                    'INSERT INTO folders (id, project_id, branch, name, description, order_index, version, is_deleted, deleted_at, sync_status, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id, branch) DO UPDATE SET name=$4, description=$5, order_index=$6, version=$7, is_deleted=$8, deleted_at=$9, sync_status=$10, updated_at=$11',
                                    [payload.id, payload.projectId, branchName, payload.name, payload.description || '', payload.orderIndex || 0, payload.version || 1, payload.isDeleted || false, payload.deletedAt ? new Date(payload.deletedAt) : null, 'synced', payload.updatedAt ? new Date(payload.updatedAt) : null]
                                )
                            } else if (operation === 'delete') {
                                const { rows: existing } = await client.query('SELECT version, is_deleted FROM folders WHERE id = $1 AND branch = $2', [payload.id, branchName])
                                if (existing.length > 0 && existing[0].is_deleted) {
                                    // Already deleted remotely, no conflict
                                } else if (existing.length > 0 && baseVersion > 0 && (existing[0].version || 1) > baseVersion) {
                                    results.push({ id: entry.id, status: 'conflict', dbVersion: existing[0].version, localVersion: payload.version, baseVersion, isDeleted: existing[0].is_deleted ? true : false })
                                    continue
                                }
                                // Soft delete
                                await client.query('UPDATE api_collections SET is_deleted = true, deleted_at = NOW(), version = version + 1 WHERE folder_id = $1 AND branch = $2', [payload.id, branchName])
                                await client.query('UPDATE folders SET is_deleted = true, deleted_at = NOW(), version = version + 1 WHERE id = $1 AND branch = $2', [payload.id, branchName])
                            }
                        } else if (tableName === 'apiCollections') {
                            if (operation === 'create' || operation === 'update') {
                                const { rows: existing } = await client.query('SELECT version, is_deleted FROM api_collections WHERE id = $1 AND branch = $2', [payload.id, branchName])
                                if (existing.length > 0 && baseVersion > 0 && (existing[0].version || 1) > baseVersion) {
                                    results.push({ id: entry.id, status: 'conflict', dbVersion: existing[0].version, localVersion: payload.version, baseVersion, isDeleted: existing[0].is_deleted ? true : false })
                                    continue
                                }
                                await client.query(
                                    `INSERT INTO api_collections (
                                        id, project_id, folder_id, branch, name, description, method, path, 
                                        url_params, headers, body_type, raw_type, form_data, urlencoded,
                                        request_body, response_examples, version, is_deleted, deleted_at, sync_status, updated_at
                                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21) 
                                    ON CONFLICT (id, branch) DO UPDATE SET 
                                        name=$5, description=$6, method=$7, path=$8, url_params=$9, headers=$10, 
                                        body_type=$11, raw_type=$12, form_data=$13, urlencoded=$14,
                                        request_body=$15, response_examples=$16, version=$17, is_deleted=$18, deleted_at=$19, sync_status=$20, updated_at=$21`,
                                    [
                                        payload.id, payload.projectId, payload.folderId || null, branchName, payload.name, payload.description || '', payload.method, payload.path,
                                        JSON.stringify(payload.urlParams || []), JSON.stringify(payload.headers || []),
                                        payload.bodyType || 'none', payload.rawType || 'json',
                                        JSON.stringify(payload.formData || []), JSON.stringify(payload.urlencoded || []),
                                        payload.requestBody || '',
                                        JSON.stringify(payload.responseExamples || []), payload.version || 1, payload.isDeleted || false, payload.deletedAt ? new Date(payload.deletedAt) : null, 'synced', payload.updatedAt ? new Date(payload.updatedAt) : null
                                    ]
                                )
                            } else if (operation === 'delete') {
                                const { rows: existing } = await client.query('SELECT version, is_deleted FROM api_collections WHERE id = $1 AND branch = $2', [payload.id, branchName])
                                if (existing.length > 0 && existing[0].is_deleted) {
                                    // Already deleted remotely, no conflict
                                } else if (existing.length > 0 && baseVersion > 0 && (existing[0].version || 1) > baseVersion) {
                                    results.push({ id: entry.id, status: 'conflict', dbVersion: existing[0].version, localVersion: payload.version, baseVersion, isDeleted: existing[0].is_deleted ? true : false })
                                    continue
                                }
                                // Soft delete
                                await client.query('UPDATE api_collections SET is_deleted = true, deleted_at = NOW(), version = version + 1 WHERE id = $1 AND branch = $2', [payload.id, branchName])
                            }
                        } else if (tableName === 'environments') {
                            if (operation === 'create' || operation === 'update') {
                                const { rows: existing } = await client.query('SELECT version, is_deleted FROM environments WHERE id = $1 AND branch = $2', [payload.id, branchName])
                                if (existing.length > 0 && baseVersion > 0 && (existing[0].version || 1) > baseVersion) {
                                    results.push({ id: entry.id, status: 'conflict', dbVersion: existing[0].version, localVersion: payload.version, baseVersion, isDeleted: existing[0].is_deleted ? true : false })
                                    continue
                                }
                                await client.query(
                                    'INSERT INTO environments (id, project_id, folder_id, branch, name, base_url, is_global, variables, version, is_deleted, deleted_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id, branch) DO UPDATE SET project_id=$2, folder_id=$3, name=$5, base_url=$6, is_global=$7, variables=$8, version=$9, is_deleted=$10, deleted_at=$11, updated_at=$12',
                                    [
                                        payload.id, payload.projectId, payload.folderId || null, branchName, payload.name, payload.baseUrl || '', payload.isGlobal ? 1 : 0, payload.variables || '{}', payload.version || 1, payload.isDeleted || false, payload.deletedAt ? new Date(payload.deletedAt) : null, payload.updatedAt ? new Date(payload.updatedAt) : null
                                    ]
                                )
                            } else if (operation === 'delete') {
                                const { rows: existing } = await client.query('SELECT version, is_deleted FROM environments WHERE id = $1 AND branch = $2', [payload.id, branchName])
                                if (existing.length > 0 && existing[0].is_deleted) {
                                    // Already deleted remotely, no conflict
                                } else if (existing.length > 0 && baseVersion > 0 && (existing[0].version || 1) > baseVersion) {
                                    results.push({ id: entry.id, status: 'conflict', dbVersion: existing[0].version, localVersion: payload.version, baseVersion, isDeleted: existing[0].is_deleted ? true : false })
                                    continue
                                }
                                // Soft delete
                                await client.query('UPDATE environments SET is_deleted = true, deleted_at = NOW(), version = version + 1 WHERE id = $1 AND branch = $2', [payload.id, branchName])
                            }
                        }
                        results.push({ id: entry.id, status: 'synced' })
                    } catch (err: any) {
                        results.push({ id: entry.id, status: 'failed', error: err.message })
                    }
                }
                await client.end()
                return { success: true, results }
            }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async fetchRemoteData(_event: any, url: string, projectId: string, branchName: string = 'main') {
        const isMysql = url.startsWith('mysql://')
        try {
            if (isMysql) {
                const conn = await mysql.createConnection(parseMysqlUrl(url, { connectTimeout: 10000, timezone: 'Z' }))
                const [folders]: any = await conn.execute('SELECT * FROM folders WHERE project_id = ? AND branch = ?', [projectId, branchName])
                const [apis]: any = await conn.execute('SELECT * FROM api_collections WHERE project_id = ? AND branch = ?', [projectId, branchName])
                const [environments]: any = await conn.execute('SELECT * FROM environments WHERE project_id = ? AND branch = ?', [projectId, branchName])
                await conn.end()
                return { success: true, folders, apis, environments }
            } else {
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } })
                await client.connect()
                await client.query("SET timezone = 'UTC'")
                const foldersRes = await client.query('SELECT * FROM folders WHERE project_id = $1 AND branch = $2', [projectId, branchName])
                const apisRes = await client.query('SELECT * FROM api_collections WHERE project_id = $1 AND branch = $2', [projectId, branchName])
                const environmentsRes = await client.query('SELECT * FROM environments WHERE project_id = $1 AND branch = $2', [projectId, branchName])
                await client.end()
                return { success: true, folders: foldersRes.rows, apis: apisRes.rows, environments: environmentsRes.rows }
            }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async getRemoteProjects(_event: any, url: string) {
        const isMysql = url.startsWith('mysql://')
        try {
            if (isMysql) {
                const conn = await mysql.createConnection(parseMysqlUrl(url, { connectTimeout: 30000, timezone: 'Z' }))
                const [rows]: any = await conn.execute('SELECT id, name, synced_branches, created_at FROM projects ORDER BY created_at DESC')
                await conn.end()
                return { success: true, projects: rows }
            } else {
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } })
                await client.connect()
                await client.query("SET timezone = 'UTC'")
                const res = await client.query('SELECT id, name, synced_branches, created_at FROM projects ORDER BY created_at DESC')
                await client.end()
                return { success: true, projects: res.rows }
            }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async getRemoteProjectMetadata(_event: any, url: string, projectId: string) {
        const isMysql = url.startsWith('mysql://')
        try {
            if (isMysql) {
                const conn = await mysql.createConnection(parseMysqlUrl(url, { connectTimeout: 30000, timezone: 'Z' }))
                const [rows]: any = await conn.execute('SELECT id, name, synced_branches, created_at FROM projects WHERE id = ?', [projectId])
                await conn.end()
                return { success: true, project: rows[0] }
            } else {
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } })
                await client.connect()
                await client.query("SET timezone = 'UTC'")
                const res = await client.query('SELECT id, name, synced_branches, created_at FROM projects WHERE id = $1', [projectId])
                await client.end()
                return { success: true, project: res.rows[0] }
            }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async deleteRemoteProject(_event: any, url: string, projectId: string) {
        const isMysql = url.startsWith('mysql://')
        try {
            if (isMysql) {
                const conn = await mysql.createConnection(parseMysqlUrl(url, { connectTimeout: 10000, timezone: 'Z' }))
                await conn.execute('DELETE FROM api_collections WHERE project_id = ?', [projectId])
                await conn.execute('DELETE FROM folders WHERE project_id = ?', [projectId])
                await conn.execute('DELETE FROM rbac_users WHERE project_id = ?', [projectId])
                await conn.execute('DELETE FROM projects WHERE id = ?', [projectId])
                await conn.end()
                return { success: true }
            } else {
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
                await client.connect()
                await client.query("SET timezone = 'UTC'")
                await client.query('DELETE FROM api_collections WHERE project_id = $1', [projectId])
                await client.query('DELETE FROM folders WHERE project_id = $1', [projectId])
                await client.query('DELETE FROM rbac_users WHERE project_id = $1', [projectId])
                await client.query('DELETE FROM projects WHERE id = $1', [projectId])
                await client.end()
                return { success: true }
            }
        } catch (err: any) {
            console.error('[SyncController] fetchRemoteData error:', err.message)
            return { success: false, error: err.message }
        }
    }

    async fetchSyncQueue(_event: any, url: string, projectId: string, branchName: string = 'main') {
        const isMysql = url.startsWith('mysql://')
        try {
            if (isMysql) {
                const conn = await mysql.createConnection(parseMysqlUrl(url, { connectTimeout: 30000, timezone: 'Z' }))
                const [items]: any = await conn.execute('SELECT * FROM sync_queue WHERE project_id = ? AND branch = ? AND status = ? ORDER BY created_at DESC', [projectId, branchName, 'pending'])
                await conn.end()
                if (items && items.length > 0) {
                    console.log(`[SyncController] Fetched ${items.length} sync_queue items (MySQL). Columns:`, Object.keys(items[0]))
                    console.table(items.map((i: any) => ({ id: i.id, table_name: i.table_name, operation: i.operation, local_id: i.local_id, status: i.status })))
                }
                return { success: true, items }
            } else {
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } })
                await client.connect()
                await client.query("SET timezone = 'UTC'")
                const res = await client.query('SELECT * FROM sync_queue WHERE project_id = $1 AND branch = $2 AND status = $3 ORDER BY created_at DESC', [projectId, branchName, 'pending'])
                await client.end()
                if (res.rows && res.rows.length > 0) {
                    console.log(`[SyncController] Fetched ${res.rows.length} sync_queue items (Postgres). Columns:`, Object.keys(res.rows[0]))
                    console.table(res.rows.map((i: any) => ({ id: i.id, table_name: i.table_name, operation: i.operation, local_id: i.local_id, status: i.status })))
                }
                return { success: true, items: res.rows }
            }
        } catch (err: any) {
            console.error('[SyncController] fetchSyncQueue error:', err)
            return { success: false, error: err.message }
        }
    }

    async updateSyncQueueStatus(_event: any, url: string, projectId: string, ids: string[]) {
        if (!ids || ids.length === 0) return { success: true };
        const isMysql = url.startsWith('mysql')
        try {
            if (isMysql) {
                const conn = await mysql.createConnection(parseMysqlUrl(url, { connectTimeout: 10000, timezone: 'Z' }))
                const placeholders = ids.map(() => '?').join(',')
                await conn.execute(`UPDATE sync_queue SET status = 'synced' WHERE project_id = ? AND id IN (${placeholders})`, [projectId, ...ids])
                await conn.end()
                return { success: true }
            } else {
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 30000, ssl: { rejectUnauthorized: false } })
                await client.connect()
                const placeholders = ids.map((_, i) => `$${i + 2}`).join(',')
                await client.query(`UPDATE sync_queue SET status = 'synced' WHERE project_id = $1 AND id IN (${placeholders})`, [projectId, ...ids])
                await client.end()
                return { success: true }
            }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async fetchRemoteEntity(_event: any, url: string, tableName: string, entityId: string, branchName: string = 'main') {
        const dbTableName = tableName === 'apiCollections' ? 'api_collections' : tableName
        const isMysql = url.startsWith('mysql')
        try {
            if (isMysql) {
                const conn = await mysql.createConnection(parseMysqlUrl(url, { connectTimeout: 10000, timezone: 'Z' }))
                const [rows]: any = await conn.execute(`SELECT * FROM ${dbTableName} WHERE id = ?`, [entityId])
                await conn.end()
                return { success: true, data: rows.length > 0 ? rows[0] : null }
            } else {
                const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
                await client.connect()
                await client.query("SET timezone = 'UTC'")
                const res = await client.query(`SELECT * FROM ${dbTableName} WHERE id = $1`, [entityId])
                await client.end()
                return { success: true, data: res.rows.length > 0 ? res.rows[0] : null }
            }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
}
