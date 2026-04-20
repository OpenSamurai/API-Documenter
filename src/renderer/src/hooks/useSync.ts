import { useQueryClient, QueryClient } from '@tanstack/react-query'
import { db } from '@/db'
import { useAppStore } from '@/stores/appStore'
import type { ProxyConnection } from '@/types'
import { getProjectLocalPath, fireAndForgetFileWrite } from '@/utils/fileSync'

export async function performSync(qc: QueryClient, proxyConnection: ProxyConnection | null, projectId: string | null, isTeam: boolean = false) {
    if (!projectId) return { success: false, error: 'No project ID' }

    console.log(`[Sync] performSync started for project: ${projectId}, isTeam: ${isTeam}`)

    // ─── Team Workspace Mode: Just Refresh UI Cache ───
    if (isTeam) {
        if (!proxyConnection?.connected) {
            console.warn('[Sync] Cannot sync team workspace: not connected to proxy.')
            return { success: false, error: 'Not connected' }
        }

        console.log('[Sync] Triggering immediate UI cache invalidation for team project...')
        await Promise.all([
            qc.invalidateQueries({ queryKey: ['projects'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['folders'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['apis'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['folder'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['api'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['environments'], refetchType: 'all' })
        ])

        console.log(`[Sync] Team refresh sync complete for project ${projectId}`)
        return { success: true, count: 0 }
    }

    // ─── Local/Direct Mode: Full Push & Pull Logic ───
    const project = await db.projects.get(projectId)
    const hasDirect = !!project?.databaseUrl
    const hasProxy = !!proxyConnection?.connected && !!proxyConnection?.proxyUrl

    if (!hasDirect && !hasProxy) {
        console.warn('[Sync] Cannot sync local project: no connection info available.')
        return { success: false, error: 'Not connected' }
    }

    const pending = await db.syncQueue
        .where('projectId')
        .equals(projectId)
        .and(item => item.status === 'pending')
        .toArray()

    console.log(`[Sync] Found ${pending.length} pending items to push`)

    try {
        let results = []

        if (hasDirect && (window as any).electronAPI?.syncDirect) {
            console.log(`[Sync] Executing direct sync for ${pending.length} items`)
            const syncRes = await (window as any).electronAPI.syncDirect(project!.databaseUrl, pending.map(e => ({
                id: e.id,
                tableName: e.tableName,
                operation: e.operation,
                data: e.data
            })))

            if (!syncRes.success) throw new Error(syncRes.error || 'Direct sync failed')
            results = syncRes.results || []
        } else if (hasProxy) {
            console.log(`[Sync] Executing proxy sync for ${pending.length} items`)
            const res = await (window as any).electronAPI.sendHttpRequest({
                url: `${proxyConnection.proxyUrl}/api/sync?projectId=${projectId}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${proxyConnection.token}`
                },
                body: JSON.stringify({
                    entries: pending.map(e => ({
                        id: e.id,
                        localId: e.localId,
                        tableName: e.tableName,
                        operation: e.operation,
                        data: e.data
                    }))
                })
            })

            if (!res.success) throw new Error(res.error || 'Proxy sync failed')
            if (res.status >= 400) throw new Error('Proxy sync failed with status: ' + res.status)

            const data = JSON.parse(res.body)
            results = data.results || []
            console.log(`[Sync] Proxy sync push complete. Received ${results.length} result statuses.`)
        } else {
            return { success: false, error: 'Sync method not available' }
        }

        // Update local status for each item
        for (const result of results) {
            const queueItem = await db.syncQueue.get(result.id)
            if (queueItem) {
                if (result.status === 'synced') {
                    if (queueItem.tableName === 'folders') {
                        await db.folders.update(queueItem.localId, { syncStatus: 'synced' })
                    } else if (queueItem.tableName === 'apiCollections') {
                        await db.apiCollections.update(queueItem.localId, { syncStatus: 'synced' })
                    } else if (queueItem.tableName === 'environments') {
                        await db.environments.update(queueItem.localId, { syncStatus: 'synced' })
                    }
                    await db.syncQueue.delete(result.id)
                } else {
                    await db.syncQueue.update(result.id, {
                        status: 'failed',
                        retries: (queueItem.retries || 0) + 1
                    })
                }
            }
        }

        // ─── PULL PHASE: Fetch remote changes ───
        const pullRemote = async () => {
            const { mapRemoteFolder, mapRemoteApi, mapRemoteEnvironment } = await import('@/utils/remoteMapper')
            let remoteFolders: any[] = []
            let remoteApis: any[] = []
            let remoteEnvs: any[] = []

            if (hasDirect && (window as any).electronAPI?.fetchRemoteData) {
                console.log(`[Sync] Pulling direct data for project ${projectId}`)
                const res = await (window as any).electronAPI.fetchRemoteData(project!.databaseUrl, projectId)
                if (res.success) {
                    remoteFolders = res.folders.map(mapRemoteFolder)
                    remoteApis = res.apis.map(mapRemoteApi)
                    if (res.environments) {
                        remoteEnvs = res.environments.map(mapRemoteEnvironment)
                    }
                }
            } else if (hasProxy) {
                console.log(`[Sync] Pulling proxy data for project ${projectId}`)
                // Folders
                const foldersRes = await (window as any).electronAPI.sendHttpRequest({
                    url: `${proxyConnection!.proxyUrl}/api/folders?projectId=${projectId}`,
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${proxyConnection!.token}` }
                })
                if (foldersRes.success) {
                    remoteFolders = JSON.parse(foldersRes.body).map(mapRemoteFolder)
                }

                // APIs
                const apisRes = await (window as any).electronAPI.sendHttpRequest({
                    url: `${proxyConnection!.proxyUrl}/api/apis?projectId=${projectId}`,
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${proxyConnection!.token}` }
                })
                if (apisRes.success) {
                    remoteApis = JSON.parse(apisRes.body).map(mapRemoteApi)
                }

                // Environments
                const envsRes = await (window as any).electronAPI.sendHttpRequest({
                    url: `${proxyConnection!.proxyUrl}/api/environments?projectId=${projectId}`,
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${proxyConnection!.token}` }
                })
                if (envsRes.success) {
                    remoteEnvs = JSON.parse(envsRes.body).map(mapRemoteEnvironment)
                }
            }

            const localFolders = await db.folders.where('projectId').equals(projectId).toArray()
            const localApis = await db.apiCollections.where('projectId').equals(projectId).toArray()

            console.log(`[Sync] Syncing ${remoteFolders.length} remote folders with ${localFolders.length} local`)

            for (const rf of remoteFolders) {
                const local = localFolders.find(l => l.id === rf.id)
                if (!local || local.syncStatus === 'synced') {
                    await db.folders.put({ ...rf, syncStatus: 'synced' })
                }
            }
            for (const lf of localFolders) {
                if (lf.syncStatus === 'synced' && !remoteFolders.find((rf: any) => rf.id === lf.id)) {
                    console.log(`[Sync] Deleting local folder ${lf.id} (not found on remote)`)
                    await db.folders.delete(lf.id)
                    await db.apiCollections.where('folderId').equals(lf.id).delete()
                }
            }
            for (const ra of remoteApis) {
                const local = localApis.find(l => l.id === ra.id)
                if (!local || local.syncStatus === 'synced') {
                    await db.apiCollections.put({ ...ra, syncStatus: 'synced' })
                }
            }
            for (const la of localApis) {
                if (la.syncStatus === 'synced' && !remoteApis.find((ra: any) => ra.id === la.id)) {
                    console.log(`[Sync] Deleting local API ${la.id} (not found on remote)`)
                    await db.apiCollections.delete(la.id)
                }
            }

            // Sync Environments
            for (const re of remoteEnvs) {
                const local = await db.environments.get(re.id)
                if (!local || (local as any).syncStatus === 'synced' || (local as any).syncStatus === undefined) {
                    await db.environments.put({ ...re, syncStatus: 'synced' })
                }
            }
            const localEnvs = await db.environments.where('projectId').equals(projectId).toArray()
            for (const le of localEnvs) {
                if ((le as any).syncStatus === 'synced' && !remoteEnvs.find((re: any) => re.id === le.id)) {
                    if (!le.isGlobal) { // Don't delete global envs
                        console.log(`[Sync] Deleting local env ${le.id} (not found on remote)`)
                        await db.environments.delete(le.id)
                    }
                }
            }
        }

        try {
            await pullRemote()

            // ─── FILE SYSTEM FLUSH: Write pulled data to disk ───
            const localPath = await getProjectLocalPath(projectId)
            if (localPath) {
                const allFolders = await db.folders.where('projectId').equals(projectId).toArray()
                const allApis = await db.apiCollections.where('projectId').equals(projectId).toArray()
                const allEnvs = await db.environments.where('projectId').equals(projectId).toArray()

                fireAndForgetFileWrite('syncFlushToDisk', async () => {
                    // Write each folder
                    for (const f of allFolders) {
                        await (window as any).electronAPI.writeFolderMeta(localPath, f)
                    }
                    // Write each API
                    for (const a of allApis) {
                        await (window as any).electronAPI.writeApiFile(localPath, a.folderId, a)
                    }
                    // Write each environment
                    for (const e of allEnvs) {
                        await (window as any).electronAPI.writeEnvironmentFile(localPath, e)
                    }
                    return { success: true }
                })
            }
        } catch (pullError) {
            console.error('[Sync] Pull phase failed:', pullError)
        }

        console.log('[Sync] Force-refreshing UI queries...')
        await Promise.all([
            qc.invalidateQueries({ queryKey: ['projects'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['folders'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['apis'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['folder'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['api'], refetchType: 'all' }),
            qc.invalidateQueries({ queryKey: ['environments'], refetchType: 'all' })
        ])

        console.log(`[Sync] performSync completed successfully for project ${projectId}`)
        return { success: true, count: results.filter((r: any) => r.status === 'synced').length }
    } catch (err) {
        console.error('Sync error:', err)
        return { success: false, error: String(err) }
    }
}

export function useSync() {
    const qc = useQueryClient()
    const { proxyConnection, currentProjectId, isTeamWorkspace, setIsSyncing } = useAppStore()

    const syncNow = async () => {
        setIsSyncing(true)
        try {
            await performSync(qc, proxyConnection, currentProjectId, isTeamWorkspace)
        } finally {
            setIsSyncing(false)
        }
    }

    return { syncNow }
}
