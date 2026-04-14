import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import fs from 'fs'
import mysql from 'mysql2/promise'
import pg from 'pg'
import { spawn } from 'child_process'
import { autoUpdater } from 'electron-updater'
import { sendHttpRequest } from './requestHandler'
import { cookieStore } from './cookieStore'
import { exportHtmlToPdf ,generateMarkdownToPdf,previewMarkdownToPdf} from './pdfHandler'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        show: false,
        frame: false,
        backgroundColor: '#0f0f17',
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show()
    })

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
        console.error(`[Main Window] Failed to load URL: ${validatedURL}`)
        console.error(`Error Code: ${errorCode} (${errorDescription})`)
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }
}

// Window controls IPC
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize()
    } else {
        mainWindow?.maximize()
    }
})
ipcMain.on('window-close', () => mainWindow?.close())
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized())

// File system IPC handlers
ipcMain.handle('save-file', async (_event, filePath: string, data: string) => {
    try {
        const dir = join(filePath, '..')
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
        }
        fs.writeFileSync(filePath, data, 'utf-8')
        return { success: true }
    } catch (error) {
        return { success: false, error: String(error) }
    }
})

ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
        const data = fs.readFileSync(filePath, 'utf-8')
        return { success: true, data }
    } catch (error) {
        return { success: false, error: String(error) }
    }
})

ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('select-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
        properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? null : result.filePaths
})

ipcMain.handle('get-app-path', () => app.getPath('userData'))
ipcMain.handle('get-app-version', () => app.getVersion())

// PDF generation IPC handlers
ipcMain.handle('export-pdf', async (_event, html, fileName) => {
    return await exportHtmlToPdf(html, fileName)
})

ipcMain.handle('preview-doc-pdf', async (_event, markdownContent) => {
    return await previewMarkdownToPdf(markdownContent)
})

ipcMain.handle('generate-doc-pdf', async (_event, markdownContent, fileName) => {
    return await generateMarkdownToPdf(markdownContent, fileName)
})

// HTTP Request Handler
ipcMain.handle('send-http-request', async (_event, opts: any) => {
    return await sendHttpRequest(opts)
})

// Cookie Management
ipcMain.handle('get-all-cookies', async () => {
    return await cookieStore.getAllCookiesByDomain()
})

ipcMain.handle('set-cookie-manually', async (_event, domain: string, cookie: any) => {
    return await cookieStore.addCookieManually(domain, cookie)
})

ipcMain.handle('update-cookie-raw', async (_event, domain: string, rawString: string, oldName?: string) => {
    return await cookieStore.updateCookieFromRaw(domain, rawString, oldName)
})

ipcMain.handle('delete-cookie', async (_event, url: string, name: string) => {
    return await cookieStore.deleteCookie(url, name)
})

ipcMain.handle('clear-domain-cookies', async (_event, domain: string) => {
    return await cookieStore.clearDomainCookies(domain)
})

ipcMain.handle('clear-all-cookies', async () => {
    return await cookieStore.clearAllCookies()
})

ipcMain.handle('get-cookie-whitelist', async () => {
    return cookieStore.getWhitelist()
})

ipcMain.handle('add-to-whitelist', async (_event, domain: string) => {
    return cookieStore.addToWhitelist(domain)
})

ipcMain.handle('remove-from-whitelist', async (_event, domain: string) => {
    return cookieStore.removeFromWhitelist(domain)
})

// Remote DB Management

ipcMain.handle('test-db-connection', async (_event, url: string) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            await conn.ping()
            await conn.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            await client.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol (mysql:// or postgres://)' }
})

ipcMain.handle('create-remote-tables', async (_event, url: string) => {
    const schema = `
        CREATE TABLE IF NOT EXISTS projects (id VARCHAR(50) PRIMARY KEY, name VARCHAR(100) NOT NULL, database_url VARCHAR(500), proxy_url VARCHAR(500), last_deployed_at TIMESTAMP NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS folders (id VARCHAR(50) PRIMARY KEY, project_id VARCHAR(50), name VARCHAR(100) NOT NULL, description TEXT, order_index INT DEFAULT 0, last_sync TIMESTAMP NULL, sync_status VARCHAR(20) DEFAULT 'synced', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS api_collections (
            id VARCHAR(50) PRIMARY KEY, 
            project_id VARCHAR(50), 
            folder_id VARCHAR(50), 
            name VARCHAR(100) NOT NULL, 
            description TEXT, 
            method VARCHAR(10) NOT NULL, 
            path TEXT NOT NULL, 
            url_params TEXT, 
            headers TEXT,   
            body_type VARCHAR(20) DEFAULT 'none', 
            raw_type VARCHAR(20) DEFAULT 'json',
            form_data TEXT,
            urlencoded TEXT,
            request_body TEXT, 
            response_examples TEXT, 
            version INT DEFAULT 1, 
            last_sync TIMESTAMP NULL, 
            sync_status VARCHAR(20) DEFAULT 'synced', 
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS rbac_users (id VARCHAR(50) PRIMARY KEY, email VARCHAR(100), token VARCHAR(100) UNIQUE NOT NULL, allowed_folders TEXT NOT NULL, project_id VARCHAR(50), role VARCHAR(20) DEFAULT 'viewer', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS environments (id VARCHAR(50) PRIMARY KEY, project_id VARCHAR(50), folder_id VARCHAR(50), name VARCHAR(100) NOT NULL, base_url TEXT, is_global BOOLEAN DEFAULT FALSE, variables TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS sync_queue (id VARCHAR(50) PRIMARY KEY, local_id VARCHAR(50), table_name VARCHAR(50), operation VARCHAR(20), data TEXT NOT NULL, status VARCHAR(20) DEFAULT 'pending', retries INT DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    `
    const migrations = [
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS last_deployed_at TIMESTAMP NULL;`,
        `ALTER TABLE projects ADD COLUMN IF NOT EXISTS proxy_url VARCHAR(500);`,
        `ALTER TABLE rbac_users ADD COLUMN IF NOT EXISTS allowed_environments TEXT;`,
        `ALTER TABLE api_collections ADD COLUMN IF NOT EXISTS raw_type VARCHAR(20) DEFAULT 'json';`,
        `ALTER TABLE api_collections ADD COLUMN IF NOT EXISTS form_data TEXT;`,
        `ALTER TABLE api_collections ADD COLUMN IF NOT EXISTS urlencoded TEXT;`
    ]
    const statements = schema.trim().split(';').map(s => s.trim()).filter(Boolean)

    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, multipleStatements: true, connectTimeout: 10000 })
            for (const s of statements) await conn.execute(s)
            // Run migrations (ignoring errors if columns exist but ADD COLUMN IF NOT EXISTS isn't supported)
            for (const m of migrations) {
                try {
                    await conn.execute(m.replace('IF NOT EXISTS', '')) // MySQL 8.0.19+ doesn't support IF NOT EXISTS in ALTER TABLE well in all envs, so we catch
                } catch (e) { /* ignore */ }
            }
            await conn.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            for (const s of statements) await client.query(s)
            // Run migrations
            for (const m of migrations) {
                try {
                    await client.query(m)
                } catch (e) { /* ignore */ }
            }
            await client.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('create-rbac-user', async (_event, url: string, user: { id: string, email: string, token: string, allowedFolders: any, allowedEnvironments: any, projectId: string, role: string }) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            await conn.execute(
                'INSERT INTO rbac_users (id, email, token, allowed_folders, allowed_environments, project_id, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [user.id, user.email, user.token, JSON.stringify(user.allowedFolders), JSON.stringify(user.allowedEnvironments || []), user.projectId, user.role]
            )
            await conn.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            await client.query(
                'INSERT INTO rbac_users (id, email, token, allowed_folders, allowed_environments, project_id, role) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [user.id, user.email, user.token, JSON.stringify(user.allowedFolders), JSON.stringify(user.allowedEnvironments || []), user.projectId, user.role]
            )
            await client.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('get-rbac-users', async (_event, url: string, projectId: string) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            const [rows]: any = await conn.execute('SELECT * FROM rbac_users WHERE project_id = ?', [projectId])
            await conn.end()
            return { success: true, users: rows }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            const res = await client.query('SELECT * FROM rbac_users WHERE project_id = $1', [projectId])
            await client.end()
            return { success: true, users: res.rows }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('update-rbac-user', async (_event, url: string, user: { id: string, email: string, allowedFolders: any, allowedEnvironments: any, role: string }) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            await conn.execute(
                'UPDATE rbac_users SET email = ?, allowed_folders = ?, allowed_environments = ?, role = ? WHERE id = ?',
                [user.email, JSON.stringify(user.allowedFolders), JSON.stringify(user.allowedEnvironments || []), user.role, user.id]
            )
            await conn.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            await client.query(
                'UPDATE rbac_users SET email = $1, allowed_folders = $2, allowed_environments = $3, role = $4 WHERE id = $5',
                [user.email, JSON.stringify(user.allowedFolders), JSON.stringify(user.allowedEnvironments || []), user.role, user.id]
            )
            await client.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('delete-rbac-user', async (_event, url: string, userId: string) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            await conn.execute('DELETE FROM rbac_users WHERE id = ?', [userId])
            await conn.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            await client.query('DELETE FROM rbac_users WHERE id = $1', [userId])
            await client.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('sync-direct', async (_event, url: string, entries: any[]) => {
    const results: any[] = []

    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, multipleStatements: true, connectTimeout: 10000 })
            for (const entry of entries) {
                const { tableName, operation, data } = entry
                const payload = typeof data === 'string' ? JSON.parse(data) : data
                try {
                    if (tableName === 'projects') {
                        if (operation === 'update' || operation === 'create') {
                            await conn.execute(
                                'INSERT INTO projects (id, name, database_url, proxy_url, last_deployed_at) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, database_url = ?, proxy_url = ?, last_deployed_at = ?',
                                [
                                    payload.id, payload.name, payload.databaseUrl || '', payload.proxyUrl || '', payload.lastDeployedAt ? new Date(payload.lastDeployedAt) : null,
                                    payload.name, payload.databaseUrl || '', payload.proxyUrl || '', payload.lastDeployedAt ? new Date(payload.lastDeployedAt) : null
                                ]
                            )
                        }
                    } else if (tableName === 'folders') {
                        if (operation === 'create' || operation === 'update') {
                            await conn.execute(
                                'INSERT INTO folders (id, project_id, name, description, order_index, sync_status) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, description = ?, order_index = ?, sync_status = ?',
                                [payload.id, payload.projectId, payload.name, payload.description || '', payload.orderIndex || 0, 'synced', payload.name, payload.description || '', payload.orderIndex || 0, 'synced']
                            )
                        } else if (operation === 'delete') {
                            await conn.execute('DELETE FROM api_collections WHERE folder_id = ?', [payload.id])
                            await conn.execute('DELETE FROM folders WHERE id = ?', [payload.id])
                        }
                    } else if (tableName === 'apiCollections') {
                        if (operation === 'create' || operation === 'update') {
                            await conn.execute(
                                `INSERT INTO api_collections (
                                    id, project_id, folder_id, name, description, method, path, 
                                    url_params, headers, body_type, raw_type, form_data, urlencoded,
                                    request_body, response_examples, version, sync_status
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
                                ON DUPLICATE KEY UPDATE 
                                    name=?, description=?, method=?, path=?, url_params=?, headers=?, 
                                    body_type=?, raw_type=?, form_data=?, urlencoded=?,
                                    request_body=?, response_examples=?, version=?, sync_status=?`,
                                [
                                    payload.id, payload.projectId, payload.folderId, payload.name, payload.description || '', payload.method, payload.path,
                                    JSON.stringify(payload.urlParams || []), JSON.stringify(payload.headers || []),
                                    payload.bodyType || 'none', payload.rawType || 'json',
                                    JSON.stringify(payload.formData || []), JSON.stringify(payload.urlencoded || []),
                                    payload.requestBody || '',
                                    JSON.stringify(payload.responseExamples || []), payload.version || 1, 'synced',
                                    payload.name, payload.description || '', payload.method, payload.path,
                                    JSON.stringify(payload.urlParams || []), JSON.stringify(payload.headers || []),
                                    payload.bodyType || 'none', payload.rawType || 'json',
                                    JSON.stringify(payload.formData || []), JSON.stringify(payload.urlencoded || []),
                                    payload.requestBody || '',
                                    JSON.stringify(payload.responseExamples || []), payload.version || 1, 'synced'
                                ]
                            )
                        } else if (operation === 'delete') {
                            await conn.execute('DELETE FROM api_collections WHERE id = ?', [payload.id])
                        }
                    } else if (tableName === 'environments') {
                        if (operation === 'create' || operation === 'update') {
                            await conn.execute(
                                'INSERT INTO environments (id, project_id, folder_id, name, base_url, is_global, variables) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE project_id=?, folder_id=?, name=?, base_url=?, is_global=?, variables=?',
                                [payload.id, payload.projectId, payload.folderId || null, payload.name, payload.baseUrl || '', payload.isGlobal ? 1 : 0, payload.variables, payload.projectId, payload.folderId || null, payload.name, payload.baseUrl || '', payload.isGlobal ? 1 : 0, payload.variables]
                            )
                        } else if (operation === 'delete') {
                            await conn.execute('DELETE FROM environments WHERE id = ?', [payload.id])
                        }
                    }
                    results.push({ id: entry.id, status: 'synced' })
                } catch (err: any) {
                    results.push({ id: entry.id, status: 'failed', error: err.message })
                }
            }
            await conn.end()
            return { success: true, results }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            for (const entry of entries) {
                const { tableName, operation, data } = entry
                const payload = typeof data === 'string' ? JSON.parse(data) : data
                const table = tableName === 'apiCollections' ? 'api_collections' : tableName
                try {
                    if (tableName === 'projects') {
                        await client.query(
                            'INSERT INTO projects (id, name, database_url, proxy_url, last_deployed_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO UPDATE SET name = $2, database_url = $3, proxy_url = $4, last_deployed_at = $5',
                            [payload.id, payload.name, payload.databaseUrl || '', payload.proxyUrl || '', payload.lastDeployedAt ? new Date(payload.lastDeployedAt) : null]
                        )
                    } else if (tableName === 'folders') {
                        if (operation === 'create' || operation === 'update') {
                            await client.query(
                                'INSERT INTO folders (id, project_id, name, description, order_index, sync_status) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET name=$3, description=$4, order_index=$5, sync_status=$6',
                                [payload.id, payload.projectId, payload.name, payload.description || '', payload.orderIndex || 0, 'synced']
                            )
                        } else if (operation === 'delete') {
                            await client.query('DELETE FROM api_collections WHERE folder_id = $1', [payload.id])
                            await client.query('DELETE FROM folders WHERE id = $1', [payload.id])
                        }
                    } else if (tableName === 'apiCollections') {
                        if (operation === 'create' || operation === 'update') {
                            await client.query(
                                `INSERT INTO api_collections (
                                    id, project_id, folder_id, name, description, method, path, 
                                    url_params, headers, body_type, raw_type, form_data, urlencoded,
                                    request_body, response_examples, version, sync_status
                                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
                                ON CONFLICT (id) DO UPDATE SET 
                                    name=$4, description=$5, method=$6, path=$7, url_params=$8, headers=$9, 
                                    body_type=$10, raw_type=$11, form_data=$12, urlencoded=$13,
                                    request_body=$14, response_examples=$15, version=$16, sync_status=$17`,
                                [
                                    payload.id, payload.projectId, payload.folderId, payload.name, payload.description || '', payload.method, payload.path,
                                    JSON.stringify(payload.urlParams || []), JSON.stringify(payload.headers || []),
                                    payload.bodyType || 'none', payload.rawType || 'json',
                                    JSON.stringify(payload.formData || []), JSON.stringify(payload.urlencoded || []),
                                    payload.requestBody || '',
                                    JSON.stringify(payload.responseExamples || []), payload.version || 1, 'synced'
                                ]
                            )
                        } else if (operation === 'delete') {
                            await client.query('DELETE FROM api_collections WHERE id = $1', [payload.id])
                        }
                    } else if (tableName === 'environments') {
                        if (operation === 'create' || operation === 'update') {
                            await client.query(
                                'INSERT INTO environments (id, project_id, folder_id, name, base_url, is_global, variables) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET project_id=$2, folder_id=$3, name=$4, base_url=$5, is_global=$6, variables=$7',
                                [payload.id, payload.projectId, payload.folderId || null, payload.name, payload.baseUrl || '', payload.isGlobal ? 1 : 0, payload.variables]
                            )
                        } else if (operation === 'delete') {
                            await client.query('DELETE FROM environments WHERE id = $1', [payload.id])
                        }
                    }
                    results.push({ id: entry.id, status: 'synced' })
                } catch (err: any) {
                    results.push({ id: entry.id, status: 'failed', error: err.message })
                }
            }
            await client.end()
            return { success: true, results }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('fetch-remote-data', async (_event, url: string, projectId: string) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            const [folders]: any = await conn.execute('SELECT * FROM folders WHERE project_id = ?', [projectId])
            const [apis]: any = await conn.execute('SELECT * FROM api_collections WHERE project_id = ?', [projectId])
            const [environments]: any = await conn.execute('SELECT * FROM environments WHERE project_id = ?', [projectId])
            await conn.end()
            return { success: true, folders, apis, environments }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            const foldersRes = await client.query('SELECT * FROM folders WHERE project_id = $1', [projectId])
            const apisRes = await client.query('SELECT * FROM api_collections WHERE project_id = $1', [projectId])
            const environmentsRes = await client.query('SELECT * FROM environments WHERE project_id = $1', [projectId])
            await client.end()
            return { success: true, folders: foldersRes.rows, apis: apisRes.rows, environments: environmentsRes.rows }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('get-remote-projects', async (_event, url: string) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            const [rows]: any = await conn.execute('SELECT id, name, created_at FROM projects ORDER BY created_at DESC')
            await conn.end()
            return { success: true, projects: rows }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            const res = await client.query('SELECT id, name, created_at FROM projects ORDER BY created_at DESC')
            await client.end()
            return { success: true, projects: res.rows }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('delete-remote-project', async (_event, url: string, projectId: string) => {
    if (url.startsWith('mysql://')) {
        try {
            const conn = await mysql.createConnection({ uri: url, connectTimeout: 10000 })
            await conn.execute('DELETE FROM api_collections WHERE project_id = ?', [projectId])
            await conn.execute('DELETE FROM folders WHERE project_id = ?', [projectId])
            await conn.execute('DELETE FROM rbac_users WHERE project_id = ?', [projectId])
            await conn.execute('DELETE FROM projects WHERE id = ?', [projectId])
            await conn.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    } else if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
        try {
            const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
            await client.connect()
            await client.query('DELETE FROM api_collections WHERE project_id = $1', [projectId])
            await client.query('DELETE FROM folders WHERE project_id = $1', [projectId])
            await client.query('DELETE FROM rbac_users WHERE project_id = $1', [projectId])
            await client.query('DELETE FROM projects WHERE id = $1', [projectId])
            await client.end()
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }
    return { success: false, error: 'Unsupported protocol' }
})

ipcMain.handle('deploy-to-vercel', async (_event, params: { databaseUrl: string, adminToken?: string, projectId: string, projectName: string }) => {
    const projectRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
    const serverPath = join(projectRoot, 'server')

    if (!fs.existsSync(serverPath)) {
        console.error('[Deploy] Server path not found:', serverPath)
        return {
            success: false,
            error: `Deployment folder not found. If you are using the packaged app, please ensure the 'server' folder exists in the resources directory.`
        }
    }

    // Sanitize project name for Vercel (lowercase, alphanumeric and hyphens only)
    const sanitizedName = params.projectName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

    // Create a unique project name: api-doc-[name]-[short-id]
    const shortId = params.projectId.split('-')[0]
    const vercelProjectName = `api-doc-${sanitizedName || 'project'}-${shortId}`

    const runVercelCommand = (command: string, stdinValue?: string) => {
        return new Promise<{ success: boolean; error?: string; output?: string }>((resolve) => {
            mainWindow?.webContents.send('deploy-output', `\n> Executing: ${command}\n`)

            const shell = process.platform === 'win32' ? 'cmd' : 'sh'
            const args = process.platform === 'win32' ? ['/c', command] : ['-c', command]

            const child = spawn(shell, args, { cwd: serverPath })
            let fullOutput = ''

            if (stdinValue) {
                child.stdin.write(stdinValue + '\n')
                child.stdin.end()
            }

            child.stdout.on('data', (data) => {
                const s = data.toString()
                fullOutput += s
                mainWindow?.webContents.send('deploy-output', s)
            })

            child.stderr.on('data', (data) => {
                const s = data.toString()
                fullOutput += s
                mainWindow?.webContents.send('deploy-output', s)
            })

            child.on('close', (code) => {
                if (code === 0) resolve({ success: true, output: fullOutput })
                else resolve({ success: false, error: `Exited with code ${code}`, output: fullOutput })
            })

            child.on('error', (err: any) => {
                let errorMessage = err.message
                if (err.code === 'ENOENT') {
                    errorMessage = `Deployment failed: System command not found. Please ensure Node.js and NPX are installed on this computer.`
                }
                resolve({ success: false, error: errorMessage, output: fullOutput })
            })
        })
    }

    try {
        // 0. Ensure linked to a UNIQUE project name
        // This creates/links the Vercel project with a name unique to THIS local project
        await runVercelCommand(`npx vercel@latest link --project ${vercelProjectName} --yes`)

        // 1. Set DATABASE_URL
        const resDb = await runVercelCommand(`npx vercel@latest env add DATABASE_URL production`, params.databaseUrl)
        if (!resDb.success) {
            mainWindow?.webContents.send('deploy-output', `Note: Proceeding even if env var exists or failed to set.\n`)
        }

        // 2. Set ADMIN_TOKEN if provided
        if (params.adminToken) {
            const resAdmin = await runVercelCommand(`npx vercel@latest env add ADMIN_TOKEN production`, params.adminToken)
            if (!resAdmin.success) {
                mainWindow?.webContents.send('deploy-output', `Note: Proceeding even if env var exists or failed to set.\n`)
            }
        }

        // 3. Final Production Deployment
        const resDeploy = await runVercelCommand(`npx vercel@latest --prod --yes`)

        if (resDeploy.success && resDeploy.output) {
            const lines = resDeploy.output.split('\n')
            let url = ''

            for (const line of lines) {
                // Look for Aliased URL (preferred clean domain)
                const aliasMatch = line.match(/Aliased:\s*(https:\/\/\S+)/i)
                if (aliasMatch) {
                    url = aliasMatch[1]
                    continue
                }

                // Look for Production URL (backup if alias not found yet)
                const prodMatch = line.match(/Production:\s*(https:\/\/\S+)/i)
                if (prodMatch && !url) {
                    url = prodMatch[1]
                }
            }

            if (url) {
                return { success: true, url }
            }
        }

        return resDeploy
    } catch (err: any) {
        return { success: false, error: err.message }
    }
})

ipcMain.handle('delete-vercel-project', async (_event, params: { projectId: string, projectName: string }) => {
    const projectRoot = app.isPackaged ? process.resourcesPath : app.getAppPath()
    const serverPath = join(projectRoot, 'server')

    const sanitizedName = params.projectName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

    const shortId = params.projectId.split('-')[0]
    const vercelProjectName = `api-doc-${sanitizedName || 'project'}-${shortId}`

    return new Promise((resolve) => {
        const shell = process.platform === 'win32' ? 'cmd' : 'sh'
        const command = `npx vercel@latest project rm ${vercelProjectName}`
        const args = process.platform === 'win32' ? ['/c', command] : ['-c', command]

        const child = spawn(shell, args, { cwd: serverPath })
        let output = ''

        // Send 'y' to confirm the deletion if prompted
        child.stdin.write('y\n')
        child.stdin.end()

        child.stdout.on('data', (data) => { output += data.toString() })
        child.stderr.on('data', (data) => { output += data.toString() })

        child.on('close', (code) => {
            if (code === 0) resolve({ success: true, output })
            else resolve({ success: false, error: `Exited with code ${code}`, output })
        })

        child.on('error', (err) => resolve({ success: false, error: err.message, output }))
    })
})

// Auto-Updater Configuration
autoUpdater.on('checking-for-update', () => {
    mainWindow?.webContents.send('update-status', 'checking')
})

autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version)
    mainWindow?.webContents.send('update-status', 'available', info.version)
})

autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents.send('update-status', 'up-to-date')
})

autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('update-progress', Math.round(progressObj.percent))
})

autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version)
    mainWindow?.webContents.send('update-status', 'downloaded', info.version)
})

autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err)
    mainWindow?.webContents.send('update-status', 'error', err.message)
})

ipcMain.handle('restart-app', () => {
    autoUpdater.quitAndInstall()
})

app.whenReady().then(() => {
    // Check for updates on startup
    if (!is.dev) {
        autoUpdater.checkForUpdatesAndNotify()
    }

    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
