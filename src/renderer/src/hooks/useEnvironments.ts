import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db } from '@/db'
import type { Environment } from '@/types'
import { v4 as uuid } from 'uuid'
import { useAppStore } from '@/stores/appStore'
import { performSync } from './useSync'
import { getProjectLocalPath, fireAndForgetFileWrite } from '@/utils/fileSync'

export function useEnvironments(projectId: string | null) {
    const { isTeamWorkspace, teamConfig } = useAppStore()
    const qc = useQueryClient()

    return useQuery<Environment[]>({
        queryKey: ['environments', projectId, isTeamWorkspace],
        queryFn: async () => {
            if (!projectId) return []

            if (isTeamWorkspace && teamConfig) {
                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/environments?projectId=${projectId}`,
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${teamConfig.token}` }
                })
                if (!res.success) throw new Error(res.error || 'Failed to fetch remote environments')
                if (res.status >= 400) throw new Error('Failed to fetch: ' + res.status)

                const data = JSON.parse(res.body)
                return Array.isArray(data) ? data : []
            }

            const localEnvs = await db.environments.where('projectId').equals(projectId).toArray()
            const hasGlobal = localEnvs.some(e => e.isGlobal)
            if (!hasGlobal) {
                const globalEnv: Environment = {
                    id: `global-${projectId}`,
                    projectId: projectId,
                    name: 'Global',
                    baseUrl: '',
                    isGlobal: true,
                    variables: '{}',
                    lastSync: null,
                    syncStatus: 'synced',
                    createdAt: Date.now()
                }
                await db.environments.add(globalEnv)

                // Write to disk
                const localPath = await getProjectLocalPath(projectId)
                if (localPath) {
                    fireAndForgetFileWrite('writeEnvironmentFile', () =>
                        (window as any).electronAPI.writeEnvironmentFile(localPath, globalEnv)
                    )
                }

                // Queue sync to make sure it exists on remote too
                await db.syncQueue.add({
                    id: uuid(),
                    localId: globalEnv.id,
                    projectId: globalEnv.projectId,
                    tableName: 'environments',
                    operation: 'create',
                    data: JSON.stringify(globalEnv),
                    status: 'pending',
                    retries: 0,
                    createdAt: Date.now()
                })

                return [globalEnv, ...localEnvs]
            }
            return localEnvs
        },
        enabled: !!projectId
    })
}

export function useCreateEnvironment() {
    const qc = useQueryClient()
    const { isTeamWorkspace } = useAppStore()

    return useMutation({
        mutationFn: async (data: any) => {
            const id = uuid()
            const env: Environment = {
                id,
                projectId: data.projectId,
                folderId: data.folderId || null,
                name: data.name,
                baseUrl: data.baseUrl || '',
                isGlobal: data.isGlobal || false,
                variables: data.variables || '{}',
                lastSync: null,
                syncStatus: 'pending',
                createdAt: Date.now()
            }

            if (isTeamWorkspace) {
                const { teamConfig } = useAppStore.getState()
                if (!teamConfig) throw new Error('No team config')

                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/environments?projectId=${teamConfig.projectId}`,
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${teamConfig.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(env)
                })

                if (!res.success) throw new Error(res.error || 'Failed to create remote environment')
                if (res.status >= 400) throw new Error('Failed to create: ' + res.status)

                return env
            }

            await db.environments.add(env)

            // Write to disk
            const localPath = await getProjectLocalPath(env.projectId)
            if (localPath) {
                fireAndForgetFileWrite('writeEnvironmentFile', () =>
                    (window as any).electronAPI.writeEnvironmentFile(localPath, env)
                )
            }

            // Queue sync
            await db.syncQueue.add({
                id: uuid(),
                localId: env.id,
                projectId: env.projectId,
                tableName: 'environments',
                operation: 'create',
                data: JSON.stringify(env),
                status: 'pending',
                retries: 0,
                createdAt: Date.now()
            })

            return env
        },
        onSuccess: (env) => {
            qc.invalidateQueries({ queryKey: ['environments', env.projectId] })
            const { proxyConnection } = useAppStore.getState()
            performSync(qc, proxyConnection, env.projectId)
        }
    })
}

export function useUpdateEnvironment() {
    const qc = useQueryClient()
    const { isTeamWorkspace } = useAppStore()

    return useMutation({
        mutationFn: async (env: Environment) => {
            if (isTeamWorkspace) {
                const { teamConfig } = useAppStore.getState()
                if (!teamConfig) throw new Error('No team config')

                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/environments/${env.id}?projectId=${teamConfig.projectId}`,
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${teamConfig.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(env)
                })

                if (!res.success) throw new Error(res.error || 'Failed to update remote environment')
                if (res.status >= 400) throw new Error('Failed to update: ' + res.status)

                return env
            }

            const updatedEnv = { ...env, syncStatus: 'pending' as any }
            await db.environments.update(env.id, updatedEnv)

            // Write to disk
            const localPath = await getProjectLocalPath(env.projectId)
            if (localPath) {
                fireAndForgetFileWrite('writeEnvironmentFile', () =>
                    (window as any).electronAPI.writeEnvironmentFile(localPath, updatedEnv)
                )
            }

            // Queue sync
            await db.syncQueue.add({
                id: uuid(),
                localId: env.id,
                projectId: env.projectId,
                tableName: 'environments',
                operation: 'update',
                data: JSON.stringify(updatedEnv),
                status: 'pending',
                retries: 0,
                createdAt: Date.now()
            })

            return env
        },
        onSuccess: (env) => {
            qc.invalidateQueries({ queryKey: ['environments', env.projectId] })
            const { proxyConnection } = useAppStore.getState()
            performSync(qc, proxyConnection, env.projectId)
        }
    })
}

export function useDeleteEnvironment() {
    const qc = useQueryClient()
    const { isTeamWorkspace } = useAppStore()

    return useMutation({
        mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
            if (isTeamWorkspace) {
                const { teamConfig } = useAppStore.getState()
                if (!teamConfig) throw new Error('No team config')

                const res = await (window as any).electronAPI.sendHttpRequest({
                    url: `${teamConfig.url}/api/environments/${id}?projectId=${teamConfig.projectId}`,
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${teamConfig.token}` }
                })

                if (!res.success) throw new Error(res.error || 'Failed to delete remote environment')
                if (res.status >= 400) throw new Error('Failed to delete: ' + res.status)

                return { id, projectId }
            }

            const env = await db.environments.get(id)
            if (env) {
                // Delete from disk
                const localPath = await getProjectLocalPath(projectId)
                if (localPath) {
                    fireAndForgetFileWrite('deleteEnvironmentFile', () =>
                        (window as any).electronAPI.deleteEnvironmentFile(localPath, id)
                    )
                }

                await db.environments.delete(id)

                // Queue sync
                await db.syncQueue.add({
                    id: uuid(),
                    localId: id,
                    projectId: projectId,
                    tableName: 'environments',
                    operation: 'delete',
                    data: JSON.stringify({ id }),
                    status: 'pending',
                    retries: 0,
                    createdAt: Date.now()
                })
            }
            return { id, projectId }
        },
        onSuccess: ({ projectId }) => {
            qc.invalidateQueries({ queryKey: ['environments', projectId] })
            const { proxyConnection } = useAppStore.getState()
            performSync(qc, proxyConnection, projectId)
        }
    })
}
