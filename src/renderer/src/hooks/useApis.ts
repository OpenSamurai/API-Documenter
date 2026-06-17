import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db } from '@/db'
import type { ApiCollection, HttpMethod } from '@/types'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '@/stores/appStore'
import { performSync } from './useSync'
import { mapRemoteApi } from '@/utils/remoteMapper'
import { getProjectLocalPath, fireAndForgetFileWrite } from '@/utils/fileSync'
import { upsertSyncQueueItem } from '@/utils/syncQueueUtils'

export function useApis(folderId: string | null) {
    const { isTeamWorkspace, teamConfig } = useAppStore()

    return useQuery<ApiCollection[]>({
        queryKey: ['apis', folderId, isTeamWorkspace],
        queryFn: async () => {
            if (!folderId) return []

            if (isTeamWorkspace && teamConfig) {
                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/apis?projectId=${teamConfig.projectId}&folderId=${folderId}`,
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${teamConfig.token}` }
                })

                if (!res.success) throw new Error(res.error || 'Failed to fetch remote apis')
                if (res.status >= 400) throw new Error('Failed to fetch: ' + res.status)

                const data = JSON.parse(res.body)
                return (Array.isArray(data) ? data : []).map(mapRemoteApi)
            }

            return db.apiCollections.where('folderId').equals(folderId).toArray()
        },
        enabled: !!folderId
    })
}

export function useAllProjectApis(projectId: string | null) {
    const { isTeamWorkspace, teamConfig } = useAppStore()

    return useQuery<ApiCollection[]>({
        queryKey: ['apis', 'project', projectId, isTeamWorkspace],
        queryFn: async () => {
            if (!projectId) return []

            if (isTeamWorkspace && teamConfig) {
                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/apis?projectId=${projectId}`,
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${teamConfig.token}` }
                })
                if (!res.success) throw new Error(res.error || 'Failed to fetch remote apis')
                if (res.status >= 400) throw new Error('Failed to fetch: ' + res.status)

                const data = JSON.parse(res.body)
                return (Array.isArray(data) ? data : []).map(mapRemoteApi)
            }

            return db.apiCollections.where('projectId').equals(projectId).toArray()
        },
        enabled: !!projectId
    })
}

export function useApi(id: string | null) {
    const { isTeamWorkspace, teamConfig } = useAppStore()

    return useQuery<ApiCollection | null>({
        queryKey: ['api', id, isTeamWorkspace],
        queryFn: async () => {
            if (!id) return null

            if (isTeamWorkspace && teamConfig) {
                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/apis/${id}?projectId=${teamConfig.projectId}`,
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${teamConfig.token}` }
                })
                if (!res.success) throw new Error(res.error || 'Failed to fetch remote api')
                if (res.status >= 400) throw new Error('Failed to fetch: ' + res.status)

                const data = JSON.parse(res.body)
                return mapRemoteApi(data)
            }

            return (await db.apiCollections.get(id)) || null
        },
        enabled: !!id
    })
}

export function useCreateApi() {
    const qc = useQueryClient()
    const { isTeamWorkspace } = useAppStore()

    return useMutation({
        mutationFn: async (data: {
            projectId: string
            folderId: string
            name: string
            method: HttpMethod
            path: string
        }) => {
            if (isTeamWorkspace) {
                const { teamConfig } = useAppStore.getState()
                if (!teamConfig) throw new Error('No team config')

                const apiId = uuid()
                const headerId = uuid()

                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/apis?projectId=${teamConfig.projectId}`,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${teamConfig.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        id: apiId,
                        folder_id: data.folderId,
                        name: data.name,
                        method: data.method,
                        path: data.path,
                        url_params: [],
                        headers: [{ id: headerId, key: 'Content-Type', value: 'application/json', enabled: true }],
                        body_type: 'none',
                        raw_type: 'json',
                        form_data: [],
                        urlencoded: [],
                        request_body: '',
                        response_examples: [],
                        version: 1
                    })
                })

                if (!res.success) throw new Error(res.error || 'Failed to create remote api')
                if (res.status >= 400) throw new Error('Failed to create: ' + res.status)

                // Return constructed object since server only returns {success: true}
                return {
                    id: apiId,
                    projectId: data.projectId,
                    folderId: data.folderId,
                    name: data.name,
                    description: '',
                    method: data.method,
                    path: data.path,
                    urlParams: [],
                    headers: [{ id: headerId, key: 'Content-Type', value: 'application/json', enabled: true }],
                    bodyType: 'none',
                    rawType: 'json',
                    formData: [],
                    urlencoded: [],
                    requestBody: '',
                    responseExamples: [],
                    version: 1,
                    syncStatus: 'synced',
                    lastSync: new Date().toISOString(), // Assuming successful creation means it's synced now
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                } as ApiCollection
            }

            const api: ApiCollection = {
                id: uuid(),
                projectId: data.projectId,
                folderId: data.folderId,
                name: data.name,
                description: '',
                method: data.method,
                path: data.path,
                urlParams: [],
                headers: [
                    { id: uuid(), key: 'Content-Type', value: 'application/json', enabled: true }
                ],
                bodyType: 'none',
                rawType: 'json',
                formData: [],
                urlencoded: [],
                requestBody: '',
                responseExamples: [],
                version: 1,
                lastSync: null,
                syncStatus: 'offline',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
            await db.apiCollections.add(api)

            // Write .apidoc file to disk
            const localPath = await getProjectLocalPath(data.projectId)
            if (localPath) {
                fireAndForgetFileWrite('writeApiFile', () =>
                    (window as any).electronAPI.writeApiFile(localPath, api.folderId, api)
                )
            }

            // Queue sync
            const { activeBranch } = useAppStore.getState()
            await db.syncQueue.add({
                id: uuid(),
                localId: api.id,
                projectId: api.projectId,
                branch: activeBranch || 'main',
                tableName: 'apiCollections',
                operation: 'create',
                data: JSON.stringify(api),
                status: 'uncommitted',
                retries: 0,
                createdAt: new Date().toISOString()
            })

            return api
        },
        onSuccess: (api: ApiCollection) => {
            qc.invalidateQueries({ queryKey: ['apis', api.folderId] })
            qc.invalidateQueries({ queryKey: ['apis', 'project', api.projectId] })
        }
    })
}

export function useUpdateApi() {
    const qc = useQueryClient()
    const { isTeamWorkspace } = useAppStore()

    return useMutation({
        mutationFn: async ({ id, ...data }: Partial<ApiCollection> & { id: string }) => {
            if (isTeamWorkspace) {
                const { teamConfig } = useAppStore.getState()
                if (!teamConfig) throw new Error('No team config')

                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/apis/${id}?projectId=${teamConfig.projectId}`,
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${teamConfig.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: data.name,
                        description: data.description,
                        method: data.method,
                        path: data.path,
                        url_params: data.urlParams,
                        headers: data.headers,
                        body_type: data.bodyType,
                        raw_type: data.rawType,
                        form_data: data.formData,
                        urlencoded: data.urlencoded,
                        request_body: data.requestBody,
                        response_examples: data.responseExamples,
                        version: data.version,
                        sync_status: 'synced'
                    })
                })

                if (!res.success) throw new Error(res.error || 'Failed to update remote api')
                if (res.status >= 400) throw new Error('Failed to update: ' + res.status)

                return { id, ...data } as ApiCollection
            }

            const oldApi = await db.apiCollections.get(id)
            const newVersion = (oldApi?.version || 1) + 1
            await db.apiCollections.update(id, { ...data, version: newVersion, syncStatus: 'uncommitted', updatedAt: new Date().toISOString() })
            const api = await db.apiCollections.get(id)

            // Write updated .apidoc file to disk
            if (api) {
                const localPath = await getProjectLocalPath(api.projectId)
                if (localPath) {
                    fireAndForgetFileWrite('writeApiFile', () =>
                        (window as any).electronAPI.writeApiFile(localPath, api.folderId, api)
                    )
                }
            }

            // Queue sync (upsert: update existing uncommitted entry if present)
            if (api) {
                const { activeBranch } = useAppStore.getState()
                await upsertSyncQueueItem({
                    localId: api.id,
                    projectId: api.projectId,
                    branch: activeBranch || 'main',
                    tableName: 'apiCollections',
                    operation: 'update',
                    data: JSON.stringify(api),
                    version: newVersion
                })
            }

            return api
        },
        onSuccess: (api: ApiCollection | undefined) => {
            if (api) {
                qc.invalidateQueries({ queryKey: ['api', api.id] })
                qc.invalidateQueries({ queryKey: ['apis', api.folderId] })
                qc.invalidateQueries({ queryKey: ['apis', 'project', api.projectId] })
                qc.invalidateQueries({ queryKey: ['api', api.id] })
            }
        }
    })
}

export function useDeleteApi() {
    const qc = useQueryClient()
    const { isTeamWorkspace } = useAppStore()

    return useMutation({
        mutationFn: async ({ id, folderId, projectId }: { id: string; folderId: string; projectId: string }) => {
            if (isTeamWorkspace) {
                const { teamConfig } = useAppStore.getState()
                if (!teamConfig) throw new Error('No team config')

                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/apis/${id}?projectId=${teamConfig.projectId}`,
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${teamConfig.token}` }
                })

                if (!res.success) throw new Error(res.error || 'Failed to delete remote api')
                if (res.status >= 400) throw new Error('Failed to delete: ' + res.status)

                return { id, folderId, projectId } as any
            }

            const api = await db.apiCollections.get(id)
            if (!api) return null

            // Delete .apidoc file from disk
            const localPath = await getProjectLocalPath(api.projectId)
            if (localPath) {
                fireAndForgetFileWrite('deleteApiFile', () =>
                    (window as any).electronAPI.deleteApiFile(localPath, api.folderId, api.id)
                )
            }

            await db.transaction('rw', [db.apiCollections, db.syncQueue], async () => {
                await db.apiCollections.delete(id)

                // Queue sync (upsert: change operation to delete)
                const { activeBranch } = useAppStore.getState()
                await upsertSyncQueueItem({
                    localId: id,
                    projectId: api.projectId,
                    branch: activeBranch || 'main',
                    tableName: 'apiCollections',
                    operation: 'delete',
                    data: JSON.stringify({ id }),
                    version: api.version
                })
            })

            return api
        },
        onSuccess: (api: ApiCollection | null) => {
            if (api) {
                qc.invalidateQueries({ queryKey: ['apis', api.folderId] })
                qc.invalidateQueries({ queryKey: ['apis', 'project', api.projectId] })
            }
        }
    })
}
