import { useQueryClient, QueryClient } from '@tanstack/react-query'
import { db } from '@/db'
import { useAppStore } from '@/stores/appStore'
import type { ProxyConnection, ConflictDetail } from '@/types'
import { getProjectLocalPath, fireAndForgetFileWrite } from '@/utils/fileSync'

// ─── SYNC META HELPERS ───────────────────────────────────────────
interface SyncMetaEntity {
    baseVersion: number
    lastCommit: string
    tableName?: string
}

interface SyncMeta {
    branch: string
    lastSyncedCommit: string
    entities: Record<string, SyncMetaEntity>
}

function migrateSyncMeta(raw: any): SyncMeta {
    // Handle old format with grouped entities { api_collections: {}, folders: {}, environments: {} }
    if (raw?.entities?.api_collections || raw?.entities?.folders || raw?.entities?.environments) {
        const entities: Record<string, SyncMetaEntity> = {}
        const commit = raw.lastSyncedCommit || ''
        for (const [id, val] of Object.entries(raw.entities.api_collections || {})) {
            entities[id] = { baseVersion: (val as any).baseVersion || 1, lastCommit: commit, tableName: 'apiCollections' }
        }
        for (const [id, val] of Object.entries(raw.entities.folders || {})) {
            entities[id] = { baseVersion: (val as any).baseVersion || 1, lastCommit: commit, tableName: 'folders' }
        }
        for (const [id, val] of Object.entries(raw.entities.environments || {})) {
            entities[id] = { baseVersion: (val as any).baseVersion || 1, lastCommit: commit, tableName: 'environments' }
        }
        return { branch: raw.branch || 'main', lastSyncedCommit: commit, entities }
    }
    // Already new format
    return {
        branch: raw?.branch || 'main',
        lastSyncedCommit: raw?.lastSyncedCommit || '',
        entities: raw?.entities || {}
    }
}

// ─── HELPERS: Write/Delete files per entity ──────────────────────
async function writeEntityFile(localPath: string, tableName: string, entityData: any) {
    if (tableName === 'apiCollections') {
        await (window as any).electronAPI.writeApiFile(localPath, entityData.folderId, entityData)
    } else if (tableName === 'folders') {
        await (window as any).electronAPI.writeFolderMeta(localPath, entityData)
    } else if (tableName === 'environments') {
        await (window as any).electronAPI.writeEnvironmentFile(localPath, entityData)
    }
}

async function deleteEntityFile(localPath: string, tableName: string, entityData: any) {
    if (tableName === 'apiCollections') {
        await (window as any).electronAPI.deleteApiFile(localPath, entityData.folderId, entityData.id)
    } else if (tableName === 'folders') {
        await (window as any).electronAPI.deleteFolderDir(localPath, entityData.id)
    } else if (tableName === 'environments') {
        await (window as any).electronAPI.deleteEnvironmentFile(localPath, entityData.id)
    }
}

function getEntityName(tableName: string, data: any): string {
    if (!data) return 'Unknown'
    return data.name || data.id?.substring(0, 8) || 'Unknown'
}

// ─── PERFORM SYNC ────────────────────────────────────────────────
export async function performSync(qc: QueryClient, proxyConnection: ProxyConnection | null, projectId: string | null, activeBranch: string | null, isTeam: boolean = false, forcePull: boolean = false, forcePushAll: boolean = false, resetRemote: boolean = false) {
    if (!projectId) return { success: false, error: 'No project ID' }

    if (!activeBranch || activeBranch === 'undefined') {
        console.warn('[Sync] Cannot sync: activeBranch is missing or invalid.')
        return { success: false, error: 'Branch context missing' }
    }

    const branchName = activeBranch
    let effectiveForcePushAll = forcePushAll || resetRemote

    const project = await db.projects.get(projectId)

    console.log(`[Sync] performSync started for project: ${projectId}, branch: ${branchName}, forcePull: ${forcePull}, forcePushAll: ${effectiveForcePushAll}`)

    // ─── Team Workspace Mode: Just Refresh UI Cache ───
    if (isTeam) {
        if (!proxyConnection?.connected) return { success: false, error: 'Not connected' }
        await Promise.all([
            qc.invalidateQueries({ queryKey: ['projects'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['folders'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['apis'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['folder'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['api'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['environments'], refetchType: 'all' })
        ])
        return { success: true, count: 0 }
    }

    // ─── Local/Direct Mode: Full Push & Pull Logic ───
    const hasDirect = !!project?.databaseUrl
    const hasProxy = !!proxyConnection?.connected && !!proxyConnection?.proxyUrl

    if (!hasDirect && !hasProxy) {
        console.warn('[Sync] Cannot sync: no connection info available.')
        return { success: false, error: 'Not connected' }
    }

    // ─── READ SYNC META (for baseVersion injection) ───
    let syncMeta: SyncMeta = { branch: branchName, lastSyncedCommit: '', entities: {} }
    const localPath = await getProjectLocalPath(projectId)
    if (localPath) {
        const syncMetaRes = await (window as any).electronAPI.readSyncMeta(localPath)
        if (syncMetaRes?.data) {
            syncMeta = migrateSyncMeta(syncMetaRes.data)
        }
    }

    let pending: any[] = []
    if (effectiveForcePushAll) {
        console.log(`[Sync] FORCE-PUSH-ALL: Starting global scan for project ${projectId} on branch ${branchName}...`)
        
        const [allFolders, allApis, allEnvs] = await Promise.all([
            db.folders.toArray(),
            db.apiCollections.toArray(),
            db.environments.toArray()
        ])

        const projectFolders = allFolders.filter(f => f.projectId === projectId)
        const folderIds = new Set(projectFolders.map(f => f.id))
        const projectApis = allApis.filter(a => a.projectId === projectId || (a.folderId && folderIds.has(a.folderId)))
        const projectEnvs = allEnvs.filter(e => e.projectId === projectId)

        pending = [
            ...projectFolders.map(f => ({ id: `fp:folders:${f.id}`, localId: f.id, tableName: 'folders', operation: 'update', data: JSON.stringify(f) })),
            ...projectApis.map(a => ({ id: `fp:apiCollections:${a.id}`, localId: a.id, tableName: 'apiCollections', operation: 'update', data: JSON.stringify(a) })),
            ...projectEnvs.map(e => ({ id: `fp:environments:${e.id}`, localId: e.id, tableName: 'environments', operation: 'update', data: JSON.stringify(e) }))
        ]
    } else {
        pending = await db.syncQueue
            .where('projectId')
            .equals(projectId)
            .and(item => (item.status === 'pending' || item.status === 'conflict') && (!branchName || item.branch === branchName))
            .toArray()
    }

    // ─── INJECT baseVersion into each entry's payload ───
    for (const entry of pending) {
        const entityMeta = syncMeta.entities[entry.localId]
        if (entityMeta) {
            const payload = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data
            payload.baseVersion = entityMeta.baseVersion
            entry.data = JSON.stringify(payload)
        }
    }

    // ─── Mark pending items as 'syncing' ───
    if (!effectiveForcePushAll) {
        for (const entry of pending) {
            if (!entry.id.startsWith('fp:')) {
                await db.syncQueue.update(entry.id, { status: 'syncing' })
            }
        }
    }

    console.log(`[Sync] Found ${pending.length} items to push for branch ${branchName}`)

    try {
        let results: any[] = []

        if (hasDirect && (window as any).electronAPI?.syncDirect) {
            const syncRes = await (window as any).electronAPI.syncDirect(project!.databaseUrl, projectId, pending.map(e => ({
                id: e.id,
                tableName: e.tableName,
                operation: e.operation,
                data: e.data
            })), branchName, resetRemote)

            if (!syncRes.success) throw new Error(syncRes.error || 'Direct sync failed')
            results = syncRes.results || []

            if (project && !project.syncedBranches?.includes(branchName)) {
                const updatedBranches = [...(project.syncedBranches || []), branchName]
                await db.projects.update(projectId, { syncedBranches: updatedBranches })
            }

            if (effectiveForcePushAll) {
                const legacies = await db.syncQueue
                    .where('projectId').equals(projectId)
                    .and(item => (item.branch === branchName || !item.branch) && (item.status === 'pending' || item.status === 'syncing'))
                    .toArray()
                if (legacies.length > 0) {
                    for (const leg of legacies) await db.syncQueue.delete(leg.id)
                }
            }
        } else if (hasProxy) {
            const res = await (window as any).electronAPI.sendHttpRequest({
                url: `${proxyConnection.proxyUrl}/api/sync?projectId=${projectId}&branch=${branchName}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${proxyConnection.token}`
                },
                body: JSON.stringify({
                    entries: pending.map(e => ({
                        id: e.id, localId: e.localId, tableName: e.tableName,
                        operation: e.operation, data: e.data
                    }))
                })
            })

            if (!res.success) throw new Error(res.error || 'Proxy sync failed')
            if (res.status >= 400) throw new Error('Proxy sync failed with status: ' + res.status)
            const data = JSON.parse(res.body)
            results = data.results || []
        } else {
            return { success: false, error: 'Sync method not available' }
        }

        // Persist currentSyncBranch to secrets if resetRemote was true
        if (resetRemote && project?.localPath) {
            await (window as any).electronAPI.writeProjectSecrets(project.localPath, { currentSyncBranch: branchName })
            const { setCurrentSyncBranch } = useAppStore.getState()
            setCurrentSyncBranch(branchName)
        }

        // ─── PROCESS RESULTS: synced, conflict, failed ───
        const conflictItems: ConflictDetail[] = []

        for (const result of results) {
            let localId = ''
            let tableName = ''

            const queueItem = await db.syncQueue.get(result.id)
            if (queueItem) {
                localId = queueItem.localId
                tableName = queueItem.tableName
            } else if (result.id.startsWith('fp:')) {
                const parts = result.id.split(':')
                if (parts.length >= 3) {
                    tableName = parts[1]
                    localId = parts.slice(2).join(':')
                }
            }

            if (result.status === 'synced' && localId && tableName) {
                if (tableName === 'folders') await db.folders.update(localId, { syncStatus: 'synced' })
                else if (tableName === 'apiCollections') await db.apiCollections.update(localId, { syncStatus: 'synced' })
                else if (tableName === 'environments') await db.environments.update(localId, { syncStatus: 'synced' })
                if (queueItem) await db.syncQueue.delete(result.id)
            } else if (result.status === 'conflict') {
                // ─── CONFLICT HANDLING (Push conflict) ───
                console.warn(`[Sync] CONFLICT for ${tableName} ${localId}: local=${result.localVersion}, db=${result.dbVersion}, base=${result.baseVersion}`)
                if (queueItem) await db.syncQueue.update(result.id, { status: 'conflict' })
                if (tableName === 'folders') await db.folders.update(localId, { syncStatus: 'conflict' })
                else if (tableName === 'apiCollections') await db.apiCollections.update(localId, { syncStatus: 'conflict' })
                else if (tableName === 'environments') await db.environments.update(localId, { syncStatus: 'conflict' })

                // Fetch local and remote data for full conflict detail
                const localEntity = tableName === 'folders' ? await db.folders.get(localId)
                    : tableName === 'apiCollections' ? await db.apiCollections.get(localId)
                    : await db.environments.get(localId)

                conflictItems.push({
                    localId,
                    tableName: tableName as any,
                    conflictType: 'update-update',
                    baseVersion: result.baseVersion || 0,
                    localVersion: result.localVersion || 0,
                    remoteVersion: result.dbVersion || 0,
                    localData: localEntity || null,
                    remoteData: null, // Will be fetched by the dialog on demand
                    entityName: getEntityName(tableName, localEntity)
                })
            } else if (queueItem) {
                await db.syncQueue.update(result.id, {
                    status: 'failed',
                    retries: (queueItem.retries || 0) + 1
                })
            }
        }

        // ─── PULL PHASE ───
        if (forcePull) {
            const pullConflicts = await pullRemoteChanges(
                projectId, branchName, project, proxyConnection, hasDirect, hasProxy, syncMeta, localPath
            )
            for (const pc of pullConflicts) {
                if (!conflictItems.some(c => c.localId === pc.localId)) {
                    conflictItems.push(pc)
                }
            }

            await Promise.all([
                qc.invalidateQueries({ queryKey: ['projects'], refetchType: 'all' }),
                qc.invalidateQueries({ queryKey: ['folders'], refetchType: 'all' }),
                qc.invalidateQueries({ queryKey: ['apis'], refetchType: 'all' }),
                qc.invalidateQueries({ queryKey: ['folder'], refetchType: 'all' }),
                qc.invalidateQueries({ queryKey: ['api'], refetchType: 'all' }),
                qc.invalidateQueries({ queryKey: ['environments'], refetchType: 'all' })
            ])
        } else {
            qc.invalidateQueries({ queryKey: ['remote-project-metadata', projectId] })
        }

        // ─── SYNC META UPDATE (new flat format) ───
        const syncedResults = results.filter((r: any) => r.status === 'synced')
        if (syncedResults.length > 0 || forcePull || effectiveForcePushAll) {
            if (localPath) {
                const { lastCommitHash } = useAppStore.getState()
                const commitHash = lastCommitHash || syncMeta.lastSyncedCommit || ''

                // Only update entities that were actually synced in this cycle
                const syncedLocalIds = new Set<string>()
                for (const result of syncedResults) {
                    let localId = ''
                    const queueItem = pending.find(p => p.id === result.id)
                    if (queueItem) localId = queueItem.localId
                    else if (result.id.startsWith('fp:')) {
                        const parts = result.id.split(':')
                        if (parts.length >= 3) localId = parts.slice(2).join(':')
                    }
                    if (localId) syncedLocalIds.add(localId)
                }

                // Update only the entities that were synced
                for (const localId of syncedLocalIds) {
                    const entry = pending.find(p => p.localId === localId)
                    if (entry) {
                        const payload = typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data
                        syncMeta.entities[localId] = {
                            baseVersion: payload.version || 1,
                            lastCommit: commitHash,
                            tableName: entry.tableName
                        }
                    }
                }

                // For force push or force pull, rebuild from DB for completeness so that newly pulled items get their baseVersion updated
                if (effectiveForcePushAll || forcePull) {
                    const allFolders = await db.folders.where('projectId').equals(projectId).toArray()
                    const allApis = await db.apiCollections.where('projectId').equals(projectId).toArray()
                    const allEnvs = await db.environments.where('projectId').equals(projectId).toArray()
                    for (const f of allFolders) {
                        if (f.syncStatus === 'synced') syncMeta.entities[f.id] = { baseVersion: f.version || 1, lastCommit: commitHash, tableName: 'folders' }
                    }
                    for (const a of allApis) {
                        if (a.syncStatus === 'synced') syncMeta.entities[a.id] = { baseVersion: a.version || 1, lastCommit: commitHash, tableName: 'apiCollections' }
                    }
                    for (const e of allEnvs) {
                        if ((e as any).syncStatus === 'synced') syncMeta.entities[e.id] = { baseVersion: e.version || 1, lastCommit: commitHash, tableName: 'environments' }
                    }
                }

                syncMeta.branch = branchName
                syncMeta.lastSyncedCommit = commitHash

                fireAndForgetFileWrite('writeSyncMeta', () =>
                    (window as any).electronAPI.writeSyncMeta(localPath, syncMeta)
                )
            }
        }

        const conflictCount = conflictItems.length
        if (conflictCount > 0) {
            console.warn(`[Sync] ${conflictCount} conflicts detected. Items marked as 'conflict' in queue.`)
        }

        return {
            success: true,
            count: results.filter((r: any) => r.status === 'synced').length,
            conflicts: conflictItems
        }
    } catch (err) {
        // ─── Revert syncing → pending on failure ───
        if (!effectiveForcePushAll) {
            for (const entry of pending) {
                if (!entry.id.startsWith('fp:')) {
                    const item = await db.syncQueue.get(entry.id)
                    if (item?.status === 'syncing') {
                        await db.syncQueue.update(entry.id, { status: 'pending' })
                    }
                }
            }
        }
        console.error('Sync error:', err)
        return { success: false, error: String(err) }
    }
}

// ─── PULL REMOTE CHANGES ─────────────────────────────────────────
async function pullRemoteChanges(
    projectId: string,
    branchName: string,
    project: any,
    proxyConnection: ProxyConnection | null,
    hasDirect: boolean,
    hasProxy: boolean,
    syncMeta: SyncMeta,
    localPath: string | null
): Promise<ConflictDetail[]> {
    const { mapRemoteFolder, mapRemoteApi, mapRemoteEnvironment } = await import('@/utils/remoteMapper')
    const conflictItems: ConflictDetail[] = []
    let syncQueueItems: any[] = []

    if (hasDirect && (window as any).electronAPI?.fetchSyncQueue) {
        const res = await (window as any).electronAPI.fetchSyncQueue(project!.databaseUrl, projectId, branchName)
        console.log('[Sync] fetchSyncQueue result:', res)
        if (res.success) syncQueueItems = res.items
    }
    
    if (syncQueueItems.length === 0 && hasProxy) {
        console.log('[Sync] Falling back to proxy for fetchSyncQueue...')
        const res = await (window as any).electronAPI.sendHttpRequest({
            url: `${proxyConnection!.proxyUrl}/api/sync_queue?projectId=${projectId}&branch=${branchName}`,
            method: 'GET', headers: { 'Authorization': `Bearer ${proxyConnection!.token}` }
        })
        if (res.success) syncQueueItems = JSON.parse(res.body)
    }

    if (syncQueueItems.length > 0) {
        console.log(`[Sync] Pulled ${syncQueueItems.length} items from sync_queue:`)
        console.table(syncQueueItems.map(item => ({
            id: item.id,
            project_id: item.project_id,
            branch: item.branch,
            table_name: item.table_name || item.tableName,
            operation: item.operation,
            local_id: item.local_id || item.localId,
            status: item.status,
            created_at: item.created_at
        })))
    }

    const processedIds: string[] = []
    const seenLocalIds = new Set<string>()

    for (const item of syncQueueItems) {
        const tableName = item.table_name || item.tableName
        const operation = item.operation
        const localId = item.local_id || item.localId

        // Mark all fetched items as processed
        processedIds.push(item.id)

        // Skip older duplicates for the same entity (latest first since ORDER BY DESC)
        const itemKey = `${tableName}:${localId}`
        if (seenLocalIds.has(itemKey)) continue
        seenLocalIds.add(itemKey)

        const remoteData = typeof item.data === 'string' ? JSON.parse(item.data) : item.data

        let dbTable: any
        let mapFn: any

        if (tableName === 'apiCollections') {
            dbTable = db.apiCollections
            mapFn = mapRemoteApi
        } else if (tableName === 'folders') {
            dbTable = db.folders
            mapFn = mapRemoteFolder
        } else if (tableName === 'environments') {
            dbTable = db.environments
            mapFn = mapRemoteEnvironment
        } else {
            continue // Unknown table
        }

        const local = await dbTable.get(localId)

        if (typeof remoteData === 'object' && remoteData !== null) {
            remoteData.id = remoteData.id || localId
            remoteData.project_id = remoteData.project_id || remoteData.projectId || projectId
            if (local && tableName === 'apiCollections') {
                remoteData.folder_id = remoteData.folder_id || remoteData.folderId || local.folderId
            }
        }

        const remote = mapFn(remoteData)
        const remoteVersion = remote.version || remoteData.version || 1

        if (operation === 'create') {
            // ─── AUTO-CREATE: No conflict possible ───
            if (!local) {
                try {
                    await dbTable.put({ ...remote, projectId, syncStatus: 'synced' })
                } catch (err: any) {
                    console.error('[Sync] put error on create:', { remote, remoteData, item })
                    throw err
                }
                // Write file to disk
                if (localPath) {
                    try {
                        await writeEntityFile(localPath, tableName, { ...remote, projectId })
                    } catch (err) {
                        console.warn(`[Sync] Failed to write created entity file: ${tableName}/${localId}`, err)
                    }
                }
                // Update syncMeta
                syncMeta.entities[localId] = {
                    baseVersion: remoteVersion,
                    lastCommit: syncMeta.lastSyncedCommit || '',
                    tableName
                }
                console.log(`[Sync] Auto-created ${tableName}: ${remote.name || localId}`)
            }
        } else if (operation === 'update') {
            if (!local) {
                // Entity doesn't exist locally — treat like create
                try {
                    await dbTable.put({ ...remote, projectId, syncStatus: 'synced' })
                } catch (err: any) {
                    console.error('[Sync] put error on update (!local):', { remote, remoteData, item })
                    throw err
                }
                if (localPath) {
                    try {
                        await writeEntityFile(localPath, tableName, { ...remote, projectId })
                    } catch (err) {
                        console.warn(`[Sync] Failed to write entity file: ${tableName}/${localId}`, err)
                    }
                }
                syncMeta.entities[localId] = { baseVersion: remoteVersion, lastCommit: syncMeta.lastSyncedCommit || '', tableName }
            } else {
                const baseVersion = syncMeta.entities[local.id]?.baseVersion || 1
                const localVersion = local.version || 1

                const localChanged = localVersion > baseVersion
                const remoteChanged = remoteVersion > baseVersion

                if (remoteChanged && !localChanged) {
                    // ─── SAFE PULL: Apply remote change locally ───
                    try {
                        await dbTable.put({ ...remote, projectId, syncStatus: 'synced' })
                    } catch (err: any) {
                        console.error('[Sync] put error on update (remoteChanged):', { remote, remoteData, item, baseVersion, localVersion, remoteVersion })
                        throw err
                    }
                    if (localPath) {
                        try {
                            await writeEntityFile(localPath, tableName, { ...remote, projectId })
                        } catch (err) {
                            console.warn(`[Sync] Failed to write pulled entity file: ${tableName}/${localId}`, err)
                        }
                    }
                    syncMeta.entities[localId] = { baseVersion: remoteVersion, lastCommit: syncMeta.lastSyncedCommit || '', tableName }
                    console.log(`[Sync] Safe-pulled ${tableName}: ${remote.name || localId} (base=${baseVersion} → remote=${remoteVersion})`)
                } else if (localChanged && !remoteChanged) {
                    // ─── SAFE PUSH: No action needed, local wins ───
                    // Do nothing, the local version will be pushed on next sync
                } else if (localChanged && remoteChanged) {
                    // ─── UPDATE vs UPDATE CONFLICT ───
                    console.warn(`[Sync] UPDATE-UPDATE conflict: ${tableName}/${localId} base=${baseVersion} local=${localVersion} remote=${remoteVersion}`)
                    const queueItems = await db.syncQueue.where('[projectId+localId]').equals([projectId, local.id]).toArray()
                    for (const q of queueItems) await db.syncQueue.update(q.id, { status: 'conflict' })
                    await dbTable.update(local.id, { syncStatus: 'conflict' })

                    conflictItems.push({
                        localId: local.id,
                        tableName: tableName as any,
                        conflictType: 'update-update',
                        baseVersion,
                        localVersion,
                        remoteVersion,
                        localData: local,
                        remoteData: { ...remote, projectId },
                        entityName: getEntityName(tableName, local),
                        remoteQueueId: item.id
                    })
                } else if (remoteVersion === baseVersion && localVersion === baseVersion && local.syncStatus !== 'synced') {
                    await dbTable.update(local.id, { syncStatus: 'synced' })
                }
            }
        } else if (operation === 'delete') {
            if (local) {
                const baseVersion = syncMeta.entities[local.id]?.baseVersion || 1
                const localVersion = local.version || 1
                const localChanged = localVersion > baseVersion

                if (!localChanged) {
                    // ─── SAFE DELETE: Auto-delete locally ───
                    if (!(tableName === 'environments' && local.isGlobal)) {
                        // Delete file from disk
                        if (localPath) {
                            try {
                                await deleteEntityFile(localPath, tableName, local)
                            } catch (err) {
                                console.warn(`[Sync] Failed to delete entity file: ${tableName}/${localId}`, err)
                            }
                        }
                        await dbTable.delete(local.id)
                        if (tableName === 'folders') {
                            // Delete child APIs from IndexedDB and disk
                            const childApis = await db.apiCollections.where('folderId').equals(local.id).toArray()
                            for (const api of childApis) {
                                if (localPath) {
                                    try { await deleteEntityFile(localPath, 'apiCollections', api) } catch { /* ignore */ }
                                }
                            }
                            await db.apiCollections.where('folderId').equals(local.id).delete()
                        }
                        // Remove from syncMeta
                        delete syncMeta.entities[localId]
                        console.log(`[Sync] Safe-deleted ${tableName}: ${local.name || localId}`)
                    }
                } else {
                    // ─── DELETE vs UPDATE CONFLICT: Remote deleted, local changed ───
                    console.warn(`[Sync] DELETE-UPDATE conflict: ${tableName}/${localId} base=${baseVersion} local=${localVersion}`)
                    const queueItems = await db.syncQueue.where('[projectId+localId]').equals([projectId, local.id]).toArray()
                    for (const q of queueItems) await db.syncQueue.update(q.id, { status: 'conflict' })
                    await dbTable.update(local.id, { syncStatus: 'conflict' })

                    conflictItems.push({
                        localId: local.id,
                        tableName: tableName as any,
                        conflictType: 'delete-update',
                        baseVersion,
                        localVersion,
                        remoteVersion: remoteData.version || remoteVersion,
                        localData: local,
                        remoteData: null, // Remote is deleted
                        entityName: getEntityName(tableName, local),
                        remoteQueueId: item.id
                    })
                }
            }
        }
    }

    // ─── Check for UPDATE vs DELETE conflicts (local deleted, remote updated) ───
    // These won't appear in sync_queue because the remote side has UPDATES, not deletes.
    // We detect them by checking if any entity in our local syncMeta is missing from IndexedDB
    // but has a remote version > baseVersion.
    // This case is handled during PUSH when the local sync_queue has operation='delete' and
    // the remote DB version > baseVersion → SyncController returns conflict result.
    // So we don't need additional detection here.

    // Mark processed remote queue items as synced
    if (processedIds.length > 0) {
        try {
            let updated = false
            if (hasDirect && (window as any).electronAPI?.updateSyncQueueStatus) {
                const res = await (window as any).electronAPI.updateSyncQueueStatus(project!.databaseUrl, projectId, processedIds)
                if (res?.success) updated = true
            }
            if (!updated && hasProxy) {
                console.log('[Sync] Falling back to proxy for updateSyncQueueStatus...')
                await (window as any).electronAPI.sendHttpRequest({
                    url: `${proxyConnection!.proxyUrl}/api/sync_queue`,
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${proxyConnection!.token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ projectId, ids: processedIds })
                })
            }
        } catch (err) {
            console.error('[Sync] Failed to mark remote queue items as synced:', err)
        }
    }

    // Write syncMeta after pull
    if (localPath) {
        fireAndForgetFileWrite('writeSyncMeta', () =>
            (window as any).electronAPI.writeSyncMeta(localPath, syncMeta)
        )
    }

    return conflictItems
}

export function useSync() {
    const qc = useQueryClient()
    const { proxyConnection, currentProjectId, activeBranch, isTeamWorkspace, setIsSyncing } = useAppStore()

    const syncNow = async (forcePull: boolean = false, forcePushAll: boolean = false, resetRemote: boolean = false) => {
        setIsSyncing(true)
        try {
            const res = await performSync(qc, proxyConnection, currentProjectId, activeBranch, isTeamWorkspace, forcePull, forcePushAll, resetRemote)
            if (res?.conflicts && res.conflicts.length > 0) {
                useAppStore.getState().setSyncConflicts(res.conflicts)
            }
            return res
        } finally {
            setIsSyncing(false)
        }
    }

    return { syncNow }
}
