import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { db } from '@/db'
import { getProjectLocalPath } from '@/utils/fileSync'
import { useAppStore } from '@/stores/appStore'
import { v4 as uuid } from 'uuid'
import { upsertSyncQueueItem } from '@/utils/syncQueueUtils'

export async function reconcileProjectFiles(projectId: string, localPath: string, qc: any, statusOverride?: 'pending' | 'uncommitted') {
    const defaultStatus = statusOverride || 'uncommitted' // Default to uncommitted for safety
    console.log(`[FileWatcher] Reconciling disk changes (Status: ${defaultStatus}) for project...`, localPath)
    try {
        const res = await (window as any).electronAPI.readProjectFromDisk(localPath)
        if (!res.success) {
            console.error('[FileWatcher] Failed to read project from disk:', res.error)
            return
        }

        const { folders = [], apis = [], environments = [], secrets = {} } = res
        console.log(`[FileWatcher] Disk data for ${localPath}:`, { 
            folderCount: folders.length, 
            apiCount: apis.length,
            folders: folders.map(f => ({ id: f.id, name: f.name }))
        })
        const { activeBranch } = useAppStore.getState()
        const branchName = activeBranch || 'main'

        let hasChanges = false

        await db.transaction('rw', [db.projects, db.folders, db.apiCollections, db.environments, db.syncQueue], async () => {
            // Get current state
            const oldFolders = await db.folders.where('projectId').equals(projectId).toArray()
            const oldApis = await db.apiCollections.where('projectId').equals(projectId).toArray()
            const oldEnvs = await db.environments.where('projectId').equals(projectId).toArray()
            
            const oldFoldersMap = new Map(oldFolders.map(f => [f.id, f]))
            const oldApisMap = new Map(oldApis.map(a => [a.id, a]))
            const oldEnvsMap = new Map(oldEnvs.map(e => [e.id, e]))
            
            const newFolderIds = new Set()
            const newApiIds = new Set()
            const newEnvIds = new Set()

            // Helper to strip IndexedDB-only fields for comparison
            const strip = (obj: any) => {
                if (!obj) return null
                // Strip fields that are ONLY in IndexedDB and NOT on disk
                const { 
                    syncStatus, lastSync, projectId: pId, 
                    id: _id, createdAt, updatedAt, ...rest 
                } = obj
                
                // Also strip id for the comparison if we are matching by ID anyway
                // Sort keys to ensure stable stringify
                const sortedRest = Object.keys(rest).sort().reduce((acc: any, key) => {
                    acc[key] = rest[key]
                    return acc
                }, {})
                return JSON.stringify(sortedRest)
            }

            // Update Folders
            for (const f of folders) {
                newFolderIds.add(f.id)
                const old = oldFoldersMap.get(f.id)
                const isNew = !old
                const sOld = strip(old)
                const sNew = strip(f)
                const isChanged = old && sOld !== sNew
                
                if (isNew || isChanged) {
                    console.log(`[FileWatcher] Folder ${isNew ? 'New' : 'Changed'}: ${f.name}`)
                    if (isChanged) {
                        console.log('  OLD:', sOld)
                        console.log('  NEW:', sNew)
                    }
                    hasChanges = true
                    await db.folders.put({ ...f, projectId, syncStatus: defaultStatus })
                    await upsertSyncQueueItem({
                        localId: f.id, projectId, branch: branchName, tableName: 'folders',
                        operation: isNew ? 'create' : 'update', data: JSON.stringify(f),
                        version: f.version, status: defaultStatus
                    })
                }
            }

            // Delete removed folders
            for (const old of oldFolders) {
                if (!newFolderIds.has(old.id)) {
                    console.log(`[FileWatcher] Folder Deleted from disk: ${old.name}`)
                    hasChanges = true
                    await db.folders.delete(old.id)
                    await db.syncQueue.add({
                        id: uuid(), localId: old.id, projectId, branch: branchName, tableName: 'folders',
                        operation: 'delete', data: JSON.stringify({ id: old.id }),
                        status: 'pending', retries: 0, createdAt: new Date().toISOString()
                    })
                }
            }

            // Update APIs
            for (const a of apis) {
                newApiIds.add(a.id)
                const old = oldApisMap.get(a.id)
                const isNew = !old
                const sOld = strip(old)
                const sNew = strip(a)
                const isChanged = old && sOld !== sNew

                if (isNew || isChanged) {
                    console.log(`[FileWatcher] API ${isNew ? 'New' : 'Changed'}: ${a.name}`)
                    if (isChanged) {
                        console.log('  OLD:', sOld)
                        console.log('  NEW:', sNew)
                    }
                    hasChanges = true
                    await db.apiCollections.put({ ...a, projectId, syncStatus: defaultStatus })
                    await upsertSyncQueueItem({
                        localId: a.id, projectId, branch: branchName, tableName: 'apiCollections',
                        operation: isNew ? 'create' : 'update', data: JSON.stringify(a),
                        version: a.version, status: defaultStatus
                    })
                }
            }

            // Delete removed APIs
            for (const old of oldApis) {
                if (!newApiIds.has(old.id)) {
                    console.log(`[FileWatcher] API Deleted from disk: ${old.name}`)
                    hasChanges = true
                    await db.apiCollections.delete(old.id)
                    await db.syncQueue.add({
                        id: uuid(), localId: old.id, projectId, branch: branchName, tableName: 'apiCollections',
                        operation: 'delete', data: JSON.stringify({ id: old.id }),
                        status: 'pending', retries: 0, createdAt: new Date().toISOString()
                    })
                }
            }

            // Update Environments
            for (const e of environments) {
                newEnvIds.add(e.id)
                const old = oldEnvsMap.get(e.id)
                const isNew = !old
                const sOld = strip(old)
                const sNew = strip(e)
                const isChanged = old && sOld !== sNew

                if (isNew || isChanged) {
                    console.log(`[FileWatcher] Env ${isNew ? 'New' : 'Changed'}: ${e.name}`)
                    if (isChanged) {
                        console.log('  OLD:', sOld)
                        console.log('  NEW:', sNew)
                    }
                    hasChanges = true
                    await db.environments.put({ ...e, projectId, syncStatus: defaultStatus })
                    await upsertSyncQueueItem({
                        localId: e.id, projectId, branch: branchName, tableName: 'environments',
                        operation: isNew ? 'create' : 'update', data: JSON.stringify(e),
                        version: e.version, status: defaultStatus
                    })
                }
            }

            // Delete removed Envs
            for (const old of oldEnvs) {
                if (!newEnvIds.has(old.id)) {
                    console.log(`[FileWatcher] Env Deleted from disk: ${old.name}`)
                    hasChanges = true
                    await db.environments.delete(old.id)
                    await db.syncQueue.add({
                        id: uuid(), localId: old.id, projectId, branch: branchName, tableName: 'environments',
                        operation: 'delete', data: JSON.stringify({ id: old.id }),
                        status: 'pending', retries: 0, createdAt: new Date().toISOString()
                    })
                }
            }
            
            // Update secrets
            if (secrets.databaseUrl !== undefined) {
                const p = await db.projects.get(projectId)
                if (p && (p.databaseUrl !== secrets.databaseUrl || p.proxyUrl !== secrets.proxyUrl || p.lastDeployedAt !== secrets.lastDeployedAt)) {
                    console.log(`[FileWatcher] Project secrets updated from disk`)
                    await db.projects.update(projectId, {
                        databaseUrl: secrets.databaseUrl,
                        proxyUrl: secrets.proxyUrl,
                        lastDeployedAt: secrets.lastDeployedAt
                    })
                    hasChanges = true
                }
            }
        })

        if (hasChanges) {
            console.log('[FileWatcher] Reconciliation complete, refreshing UI...')
            
            // Aggressive invalidation and refetching
            qc.invalidateQueries({ queryKey: ['folders'] })
            qc.invalidateQueries({ queryKey: ['apis'] })
            qc.invalidateQueries({ queryKey: ['environments'] })
            
            qc.invalidateQueries({ queryKey: ['folder'] })
            qc.invalidateQueries({ queryKey: ['api'] })
            qc.invalidateQueries({ queryKey: ['environment'] })

            // Force immediate refetch of all active queries
            setTimeout(() => {
                qc.refetchQueries({ type: 'active' })
            }, 100)
        }

    } catch (err) {
        console.error('[FileWatcher] Error during reconciliation:', err)
    }
}

export function useProjectFilesWatcher(projectId: string | null) {
    const qc = useQueryClient()
    const { proxyConnection } = useAppStore()

    useEffect(() => {
        if (!projectId) return

        let unlisten: (() => void) | null = null

        const startWatching = async () => {
            const localPath = await getProjectLocalPath(projectId)
            if (!localPath) return

            // Start backend watcher
            await (window as any).electronAPI.startFileWatcher(localPath)

            // Eagerly check for changes on mount (Consider these 'pending' as they are already on disk)
            await reconcileProjectFiles(projectId, localPath, qc, 'pending')

            // Listen for subsequent changes
            unlisten = (window as any).electronAPI.onProjectFilesChanged((data: { dirPath: string }) => {
                    reconcileProjectFiles(projectId, localPath, qc)
            })
        }

        startWatching()

        return () => {
            if (unlisten) unlisten()
            ;(window as any).electronAPI.stopFileWatcher()
        }
    }, [projectId, qc, proxyConnection])
}
