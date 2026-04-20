import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db } from '@/db'
import type { Folder } from '@/types'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '@/stores/appStore'
import { performSync } from './useSync'
import { mapRemoteFolder } from '@/utils/remoteMapper'
import { getProjectLocalPath, fireAndForgetFileWrite } from '@/utils/fileSync'

export function useFolders(projectId: string | null) {
    const { isTeamWorkspace, teamConfig } = useAppStore()

    return useQuery<Folder[]>({
        queryKey: ['folders', projectId, isTeamWorkspace],
        queryFn: async () => {
            if (!projectId) return []

            if (isTeamWorkspace && teamConfig) {
                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/folders?projectId=${projectId}`,
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${teamConfig.token}` }
                })

                if (!res.success) throw new Error(res.error || 'Failed to fetch remote folders')
                if (res.status >= 400) {
                    let err = 'Failed to fetch: ' + res.status
                    try {
                        const body = JSON.parse(res.body)
                        if (body.error) err = body.error
                    } catch (e) { /* ignore */ }
                    throw new Error(err)
                }

                const data = JSON.parse(res.body)
                return (Array.isArray(data) ? data : []).map(mapRemoteFolder)
            }

            return db.folders.where('projectId').equals(projectId).sortBy('orderIndex')
        },
        enabled: !!projectId
    })
}

export function useFolder(id: string | null) {
    const { isTeamWorkspace, teamConfig } = useAppStore()

    return useQuery<Folder | undefined>({
        queryKey: ['folder', id, isTeamWorkspace],
        queryFn: async () => {
            if (!id) return undefined

            if (isTeamWorkspace && teamConfig) {
                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/folders/${id}?projectId=${teamConfig.projectId}`,
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${teamConfig.token}` }
                })

                if (!res.success) throw new Error(res.error || 'Failed to fetch remote folder')
                if (res.status >= 400) throw new Error('Failed to fetch: ' + res.status)

                const data = JSON.parse(res.body)
                return mapRemoteFolder(data)
            }

            return db.folders.get(id)
        },
        enabled: !!id
    })
}

export function useCreateFolder() {
    const qc = useQueryClient()
    const { isTeamWorkspace } = useAppStore()

    return useMutation({
        mutationFn: async (data: { projectId: string; name: string; description: string }) => {
            if (isTeamWorkspace) {
                const { teamConfig } = useAppStore.getState()
                if (!teamConfig) throw new Error('No team config')

                const folderId = uuid()
                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/folders?projectId=${data.projectId}`,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${teamConfig.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        id: folderId,
                        name: data.name,
                        description: data.description,
                        order_index: 0,
                        sync_status: 'synced'
                    })
                })

                if (!res.success) throw new Error(res.error || 'Failed to create remote folder')
                if (res.status >= 400) throw new Error('Failed to create: ' + res.status)

                return {
                    id: folderId,
                    projectId: data.projectId,
                    name: data.name,
                    description: data.description,
                    orderIndex: 0,
                    syncStatus: 'synced',
                    lastSync: Date.now(),
                    createdAt: Date.now()
                } as Folder
            }
            const count = await db.folders.where('projectId').equals(data.projectId).count()
            const folder: Folder = {
                id: uuid(),
                projectId: data.projectId,
                name: data.name,
                description: data.description,
                orderIndex: count,
                lastSync: null,
                syncStatus: 'offline',
                createdAt: Date.now()
            }
            await db.folders.add(folder)

            // Write folder to disk
            const localPath = await getProjectLocalPath(data.projectId)
            if (localPath) {
                fireAndForgetFileWrite('writeFolderMeta', () =>
                    (window as any).electronAPI.writeFolderMeta(localPath, folder)
                )
            }

            // Queue sync
            await db.syncQueue.add({
                id: uuid(),
                localId: folder.id,
                projectId: folder.projectId,
                tableName: 'folders',
                operation: 'create',
                data: JSON.stringify(folder),
                status: 'pending',
                retries: 0,
                createdAt: Date.now()
            })

            return folder
        },
        onSuccess: (folder: Folder) => {
            qc.invalidateQueries({ queryKey: ['folders', folder.projectId] })
            const { proxyConnection } = useAppStore.getState()
            performSync(qc, proxyConnection, folder.projectId)
        }
    })
}

export function useUpdateFolder() {
    const qc = useQueryClient()
    const { isTeamWorkspace } = useAppStore()

    return useMutation({
        mutationFn: async ({ id, ...data }: Partial<Folder> & { id: string }) => {
            if (isTeamWorkspace) {
                const { teamConfig } = useAppStore.getState()
                if (!teamConfig) throw new Error('No team config')

                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/folders/${id}?projectId=${teamConfig.projectId}`,
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${teamConfig.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: data.name,
                        description: data.description,
                        order_index: data.orderIndex,
                        sync_status: 'synced'
                    })
                })

                if (!res.success) throw new Error(res.error || 'Failed to update remote folder')
                if (res.status >= 400) throw new Error('Failed to update: ' + res.status)

                return { id, ...data } as Folder
            }

            const oldFolder = await db.folders.get(id)
            await db.folders.update(id, data)
            const folder = await db.folders.get(id)

            // Write to disk
            if (folder) {
                const localPath = await getProjectLocalPath(folder.projectId)
                if (localPath) {
                    // If name changed, rename the directory
                    if (oldFolder && data.name && oldFolder.name !== data.name) {
                        fireAndForgetFileWrite('renameFolderDir', () =>
                            (window as any).electronAPI.renameFolderDir(localPath, folder.id, data.name!)
                        )
                    }
                    // Update folder.json
                    fireAndForgetFileWrite('writeFolderMeta', () =>
                        (window as any).electronAPI.writeFolderMeta(localPath, folder)
                    )
                }
            }

            // Queue sync
            if (folder) {
                await db.syncQueue.add({
                    id: uuid(),
                    localId: folder.id,
                    projectId: folder.projectId,
                    tableName: 'folders',
                    operation: 'update',
                    data: JSON.stringify(folder),
                    status: 'pending',
                    retries: 0,
                    createdAt: Date.now()
                })
            }

            return folder
        },
        onSuccess: (folder: Folder | undefined) => {
            if (folder) {
                qc.invalidateQueries({ queryKey: ['folders', folder.projectId] })
                qc.invalidateQueries({ queryKey: ['folder', folder.id] })
                const { proxyConnection } = useAppStore.getState()
                performSync(qc, proxyConnection, folder.projectId)
            }
        }
    })
}

export function useDeleteFolder() {
    const qc = useQueryClient()
    const { isTeamWorkspace } = useAppStore()

    return useMutation({
        mutationFn: async (id: string) => {
            if (isTeamWorkspace) {
                const { teamConfig } = useAppStore.getState()
                if (!teamConfig) throw new Error('No team config')

                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/folders/${id}?projectId=${teamConfig.projectId}`,
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${teamConfig.token}` }
                })

                if (!res.success) throw new Error(res.error || 'Failed to delete remote folder')
                if (res.status >= 400) throw new Error('Failed to delete: ' + res.status)

                return teamConfig.projectId
            }
            const folder = await db.folders.get(id)
            if (!folder) return null

            // Delete folder directory from disk
            const localPath = await getProjectLocalPath(folder.projectId)
            if (localPath) {
                fireAndForgetFileWrite('deleteFolderDir', () =>
                    (window as any).electronAPI.deleteFolderDir(localPath, folder.id)
                )
            }

            await db.transaction('rw', [db.folders, db.apiCollections, db.syncQueue], async () => {
                await db.apiCollections.where('folderId').equals(id).delete()
                await db.folders.delete(id)

                // Queue sync
                await db.syncQueue.add({
                    id: uuid(),
                    localId: id,
                    projectId: folder.projectId,
                    tableName: 'folders',
                    operation: 'delete',
                    data: JSON.stringify({ id }),
                    status: 'pending',
                    retries: 0,
                    createdAt: Date.now()
                })
            })

            return folder.projectId
        },
        onSuccess: (projectId: string | null) => {
            if (projectId) {
                qc.invalidateQueries({ queryKey: ['folders', projectId] })
                const { proxyConnection } = useAppStore.getState()
                performSync(qc, proxyConnection, projectId)
            }
            qc.invalidateQueries({ queryKey: ['apis'] })
        }
    })
}
