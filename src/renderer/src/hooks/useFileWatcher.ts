import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { db } from '@/db'
import { getProjectLocalPath } from '@/utils/fileSync'
import { useAppStore } from '@/stores/appStore'
import { performSync } from './useSync'
import { v4 as uuid } from 'uuid'

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

            const reconcileDiskChanges = async () => {
                console.log('[FileWatcher] Reconciling disk changes for project...', localPath)
                try {
                    const res = await (window as any).electronAPI.readProjectFromDisk(localPath)
                    if (!res.success) {
                        console.error('[FileWatcher] Failed to read project from disk:', res.error)
                        return
                    }

                    const { folders = [], apis = [], environments = [], secrets = {} } = res

                    let hasChanges = false

                    await db.transaction('rw', [db.projects, db.folders, db.apiCollections, db.environments, db.syncQueue], async () => {
                        // We will blindly overwrite local data with disk data, EXCEPT we only queue items that actually changed for remote sync.
                        // Actually, to make sure deleted files are removed from IDB, we should track what we process.

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

                        // Update Folders
                        for (const f of folders) {
                            newFolderIds.add(f.id)
                            const old = oldFoldersMap.get(f.id)
                            const isNew = !old
                            const isChanged = old && JSON.stringify(old) !== JSON.stringify(f)
                            
                            if (isNew || isChanged) {
                                hasChanges = true
                                await db.folders.put({ ...f, syncStatus: 'pending' })
                                await db.syncQueue.add({
                                    id: uuid(), localId: f.id, projectId, tableName: 'folders',
                                    operation: isNew ? 'create' : 'update', data: JSON.stringify(f),
                                    status: 'pending', retries: 0, createdAt: Date.now()
                                })
                            }
                        }

                        // Delete removed folders
                        for (const old of oldFolders) {
                            if (!newFolderIds.has(old.id)) {
                                hasChanges = true
                                await db.folders.delete(old.id)
                                await db.syncQueue.add({
                                    id: uuid(), localId: old.id, projectId, tableName: 'folders',
                                    operation: 'delete', data: JSON.stringify({ id: old.id }),
                                    status: 'pending', retries: 0, createdAt: Date.now()
                                })
                            }
                        }

                        // Update APIs
                        for (const a of apis) {
                            newApiIds.add(a.id)
                            const old = oldApisMap.get(a.id)
                            // A quick comparison check is to remove lastSync/syncStatus/createdAt out if that drifts, 
                            // but JSON.stringify might fail on nested arrays. Let's do a simple full replace but set status properly.
                            const strippedOld = { ...old, syncStatus: undefined, lastSync: undefined }
                            const strippedNew = { ...a, syncStatus: undefined, lastSync: undefined }
                            const isNew = !old
                            const isChanged = old && JSON.stringify(strippedOld) !== JSON.stringify(strippedNew)

                            if (isNew || isChanged) {
                                hasChanges = true
                                await db.apiCollections.put({ ...a, syncStatus: 'pending' })
                                await db.syncQueue.add({
                                    id: uuid(), localId: a.id, projectId, tableName: 'apiCollections',
                                    operation: isNew ? 'create' : 'update', data: JSON.stringify(a),
                                    status: 'pending', retries: 0, createdAt: Date.now()
                                })
                            }
                        }

                        // Delete removed APIs
                        for (const old of oldApis) {
                            if (!newApiIds.has(old.id)) {
                                hasChanges = true
                                await db.apiCollections.delete(old.id)
                                await db.syncQueue.add({
                                    id: uuid(), localId: old.id, projectId, tableName: 'apiCollections',
                                    operation: 'delete', data: JSON.stringify({ id: old.id }),
                                    status: 'pending', retries: 0, createdAt: Date.now()
                                })
                            }
                        }

                        // Update Environments
                        for (const e of environments) {
                            newEnvIds.add(e.id)
                            const old = oldEnvsMap.get(e.id)
                            const strippedOld = { ...old, syncStatus: undefined, lastSync: undefined }
                            const strippedNew = { ...e, syncStatus: undefined, lastSync: undefined }
                            
                            const isNew = !old
                            const isChanged = old && JSON.stringify(strippedOld) !== JSON.stringify(strippedNew)

                            if (isNew || isChanged) {
                                hasChanges = true
                                await db.environments.put({ ...e, syncStatus: 'pending' })
                                await db.syncQueue.add({
                                    id: uuid(), localId: e.id, projectId, tableName: 'environments',
                                    operation: isNew ? 'create' : 'update', data: JSON.stringify(e),
                                    status: 'pending', retries: 0, createdAt: Date.now()
                                })
                            }
                        }

                        // Delete removed Envs
                        for (const old of oldEnvs) {
                            if (!newEnvIds.has(old.id)) {
                                hasChanges = true
                                await db.environments.delete(old.id)
                                await db.syncQueue.add({
                                    id: uuid(), localId: old.id, projectId, tableName: 'environments',
                                    operation: 'delete', data: JSON.stringify({ id: old.id }),
                                    status: 'pending', retries: 0, createdAt: Date.now()
                                })
                            }
                        }
                        
                        // Update secrets (project databaseUrl etc)
                        if (secrets.databaseUrl !== undefined) {
                            const p = await db.projects.get(projectId)
                            if (p && (p.databaseUrl !== secrets.databaseUrl || p.proxyUrl !== secrets.proxyUrl || p.lastDeployedAt !== secrets.lastDeployedAt)) {
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
                        qc.invalidateQueries({ queryKey: ['folders'] })
                        qc.invalidateQueries({ queryKey: ['apis'] })
                        qc.invalidateQueries({ queryKey: ['environments'] })
                        // Trigger remote sync
                        performSync(qc, proxyConnection, projectId)
                    }

                } catch (err) {
                    console.error('[FileWatcher] Error during reconciliation:', err)
                }
            }

            // Eagerly check for changes on mount (cold start)
            await reconcileDiskChanges()

            // Listen for subsequent changes
            unlisten = (window as any).electronAPI.onProjectFilesChanged((data: { dirPath: string }) => {
                if (data.dirPath === localPath) {
                    reconcileDiskChanges()
                }
            })
        }

        startWatching()

        return () => {
            if (unlisten) unlisten()
            ;(window as any).electronAPI.stopFileWatcher()
        }
    }, [projectId, qc, proxyConnection])
}
