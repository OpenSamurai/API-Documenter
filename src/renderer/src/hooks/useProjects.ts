import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { db } from '@/db'
import type { Project, Folder, ApiCollection } from '@/types'
import { v4 as uuid } from 'uuid'
import { performSync } from './useSync'
import { useAppStore } from '@/stores/appStore'
import { getProjectLocalPath, fireAndForgetFileWrite } from '@/utils/fileSync'

export function useProjects() {
    return useQuery<Project[]>({
        queryKey: ['projects'],
        queryFn: () => db.projects.orderBy('createdAt').reverse().toArray()
    })
}

export function useProject(id: string | null) {
    const isTeamWorkspace = useAppStore(s => s.isTeamWorkspace)
    const teamConfig = useAppStore(s => s.teamConfig)

    return useQuery<Project | null>({
        queryKey: ['project', id],
        queryFn: async () => {
            if (!id) return null
            const local = await db.projects.get(id)
            if (local) return local

            // If in Team Workspace mode and project not found locally, return a virtual project
            if (isTeamWorkspace && teamConfig && id === teamConfig.projectId) {
                return {
                    id: teamConfig.projectId,
                    name: `Team: ${teamConfig.projectId.split('-')[0]}`,
                    localPath: '',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                } as Project
            }

            return null
        },
        enabled: !!id
    })
}

export function useRemoteProjectMetadata(projectId: string | null, databaseUrl: string | null) {
    return useQuery({
        queryKey: ['remote-project-metadata', projectId, databaseUrl],
        queryFn: async () => {
            if (!projectId || !databaseUrl) return null
            const res = await (window as any).electronAPI.getRemoteProjectMetadata(databaseUrl, projectId)
            if (!res.success) throw new Error(res.error)
            
            const project = res.project
            let syncedBranches: string[] = []
            if (project?.synced_branches) {
                try {
                    syncedBranches = JSON.parse(project.synced_branches)
                } catch (e) {
                    console.error('Failed to parse synced_branches:', e)
                }
            }
            
            return {
                ...project,
                syncedBranches
            }
        },
        enabled: !!projectId && !!databaseUrl
    })
}

/**
 * Triggers a full synchronization of the project to a remote database.
 * 1. Creates remote tables if they don't exist.
 * 2. Queues the project, its folders, and its API collections for creation/update.
 */
export async function triggerFullProjectSync(qc: any, project: Project, branchName: string) {
    if (!project.databaseUrl) return

    console.log(`[Sync] Starting direct full sync for project: ${project.name} | Branch: ${branchName}`)

    try {
        // 1. Create remote tables
        if (!(window as any).electronAPI?.createRemoteTables) {
            console.warn('[Sync] createRemoteTables not available yet')
            return
        }

        const tableRes = await (window as any).electronAPI.createRemoteTables(project.databaseUrl)
        if (!tableRes.success) {
            console.error('[Sync] Failed to create remote tables:', tableRes.error)
            return
        }

        // 2. Collect all items for direct sync
        const folders = await db.folders.where('projectId').equals(project.id).toArray()
        const apis = await db.apiCollections.where('projectId').equals(project.id).toArray()

        const entries = [
            { id: project.id, tableName: 'projects', operation: 'update', data: project },
            ...folders.map(f => ({ id: f.id, tableName: 'folders', operation: 'create', data: f })),
            ...apis.map(a => ({ id: a.id, tableName: 'apiCollections', operation: 'create', data: a }))
        ]

        // 3. Push data directly
        if (!(window as any).electronAPI?.syncDirect) {
            console.warn('[Sync] syncDirect not available yet. Please restart the app.')
            return
        }

        const syncRes = await (window as any).electronAPI.syncDirect(project.databaseUrl, project.id, entries, branchName)

        if (syncRes.success) {
            console.log(`[Sync] Direct sync successful: ${syncRes.results?.length} entries processed`)

            // 4. Mark items as synced locally (clean up sync queue if they were there)
            await db.transaction('rw', [db.syncQueue, db.folders, db.apiCollections, db.environments], async () => {
                for (const result of (syncRes.results || [])) {
                    if (result.status === 'synced') {
                        // Result.id is the localId we passed
                        await db.syncQueue.where('localId').equals(result.id).delete()
                        
                        const entry = entries.find(e => e.id === result.id)
                        if (entry) {
                            if (entry.tableName === 'folders') await db.folders.update(result.id, { syncStatus: 'synced' })
                            else if (entry.tableName === 'apiCollections') await db.apiCollections.update(result.id, { syncStatus: 'synced' })
                            else if (entry.tableName === 'environments') await db.environments.update(result.id, { syncStatus: 'synced' })
                        }
                    }
                }
            })

            // 5. Update local project record with the new synced branch
            const currentSynced = project.syncedBranches || []
            if (!currentSynced.includes(branchName)) {
                await db.projects.update(project.id, {
                    syncedBranches: [...currentSynced, branchName]
                })
            }

            // ─── PERSIST CONNECTED BRANCH & SYNC META ───
            if (project.localPath) {
                console.log(`[Sync] Persisting "${branchName}" as the connected currentSyncBranch...`)
                await (window as any).electronAPI.writeProjectSecrets(project.localPath, { currentSyncBranch: branchName })
                
                const syncMetaRes = await (window as any).electronAPI.readSyncMeta(project.localPath)
                const syncMeta = syncMetaRes?.data || { branch: branchName, lastSyncedAt: new Date().toISOString(), entities: { api_collections: {}, folders: {}, environments: {} } }
                syncMeta.branch = branchName
                syncMeta.lastSyncedAt = new Date().toISOString()
                if (!syncMeta.entities) syncMeta.entities = { api_collections: {}, folders: {}, environments: {} }

                const allFolders = await db.folders.where('projectId').equals(project.id).toArray()
                const allApis = await db.apiCollections.where('projectId').equals(project.id).toArray()
                const allEnvs = await db.environments.where('projectId').equals(project.id).toArray()
                
                for (const f of allFolders) syncMeta.entities.folders[f.id] = { baseVersion: f.version || 1 }
                for (const a of allApis) syncMeta.entities.api_collections[a.id] = { baseVersion: a.version || 1 }
                for (const e of allEnvs) syncMeta.entities.environments[e.id] = { baseVersion: e.version || 1 }

                await (window as any).electronAPI.writeSyncMeta(project.localPath, syncMeta)

                const { setCurrentSyncBranch } = useAppStore.getState()
                setCurrentSyncBranch(branchName)
            }

            // 6. Refresh data in UI
            qc.invalidateQueries({ queryKey: ['projects'] })
            qc.invalidateQueries({ queryKey: ['project', project.id] })
            qc.invalidateQueries({ queryKey: ['remote-project-metadata', project.id] })
            qc.invalidateQueries({ queryKey: ['folders'] })
            qc.invalidateQueries({ queryKey: ['apis'] })
        } else {
            console.error('[Sync] Direct sync failed:', syncRes.error)
        }
    } catch (err) {
        console.error('[Sync] Critical error during full sync:', err)
    }

    const { proxyConnection } = useAppStore.getState()
    if (proxyConnection?.connected) {
        await performSync(qc, proxyConnection, project.id, branchName)
    }
}

export function useCreateProject() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (data: { name: string; localPath: string; databaseUrl?: string; proxyUrl?: string }) => {
            const project: Project = {
                id: uuid(),
                name: data.name,
                localPath: data.localPath,
                databaseUrl: data.databaseUrl || '',
                proxyUrl: data.proxyUrl || '',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }

            // 1. Scaffold directory on disk
            const initRes = await (window as any).electronAPI.initProjectDirectory(data.localPath, project)
            if (!initRes.success) {
                throw new Error(`Failed to create project directory: ${initRes.error}`)
            }

            // 2. Add to IndexedDB
            await db.projects.add(project)

            // 3. Add to recent projects
            fireAndForgetFileWrite('addRecentProject', () =>
                (window as any).electronAPI.addRecentProject({ id: project.id, name: project.name, localPath: project.localPath })
            )

            // 4. Remote sync if configured
            if (project.databaseUrl) {
                const { activeBranch } = useAppStore.getState()
                await triggerFullProjectSync(qc, project, activeBranch || 'main')
            }

            return project
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] })
    })
}

export function useUpdateProject() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, ...data }: Partial<Project> & { id: string }) => {
            const oldProject = await db.projects.get(id)
            const newVersion = (oldProject?.version || 1) + 1
            await db.projects.update(id, { ...data, version: newVersion, updatedAt: new Date().toISOString() })
            const newProject = await db.projects.get(id)

            // Write updates to file system
            if (newProject?.localPath) {
                fireAndForgetFileWrite('writeProjectMeta', () =>
                    (window as any).electronAPI.writeProjectMeta(newProject.localPath, {
                        id: newProject.id,
                        name: newProject.name,
                        createdAt: newProject.createdAt
                    })
                )
                // Update secrets if DB/proxy config changed
                if (data.databaseUrl !== undefined || data.proxyUrl !== undefined || data.lastDeployedAt !== undefined) {
                    fireAndForgetFileWrite('writeProjectSecrets', () =>
                        (window as any).electronAPI.writeProjectSecrets(newProject.localPath, {
                            databaseUrl: newProject.databaseUrl,
                            proxyUrl: newProject.proxyUrl,
                            lastDeployedAt: newProject.lastDeployedAt
                        })
                    )
                }
            }

            if (newProject && newProject.databaseUrl && (!oldProject?.databaseUrl || oldProject.databaseUrl !== newProject.databaseUrl)) {
                const { activeBranch } = useAppStore.getState()
                await triggerFullProjectSync(qc, newProject, activeBranch || 'main')
            } else if (newProject && newProject.databaseUrl) {
                // Just queue a regular project update
                const { activeBranch } = useAppStore.getState()
                await db.syncQueue.add({
                    id: uuid(), localId: newProject.id, projectId: newProject.id, 
                    branch: activeBranch || 'main',
                    tableName: 'projects',
                    operation: 'update', data: JSON.stringify(newProject),
                    status: 'pending', retries: 0, createdAt: new Date().toISOString()
                })
                const { proxyConnection } = useAppStore.getState()
                await performSync(qc, proxyConnection, newProject.id, activeBranch || 'main')
            }

            return newProject
        },
        onSuccess: (data) => {
            qc.invalidateQueries({ queryKey: ['projects'] })
            if (data?.id) {
                // Force immediate update of the specific project query cache
                qc.setQueryData(['project', data.id], data)
                qc.invalidateQueries({ queryKey: ['project', data.id] })
            }
        }
    })
}

export function useDeleteProject() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, target }: { id: string, target: 'local' | 'remote' | 'both' }) => {
            const project = await db.projects.get(id)

            // 1. Remote Cleanup (Database)
            if ((target === 'remote' || target === 'both') && project?.databaseUrl) {
                const res = await (window as any).electronAPI.deleteRemoteProject(project.databaseUrl, id)
                if (!res.success) {
                    console.error('[Delete] Failed to wipe remote project:', res.error)
                }
            }

            // 1.5. Proxy Cleanup (Vercel)
            if ((target === 'remote' || target === 'both') && project?.proxyUrl) {
                console.log(`[Delete] Attempting to delete Vercel proxy for project: ${project.name}`)
                const res = await (window as any).electronAPI.deleteVercelProject({
                    projectId: project.id,
                    projectName: project.name
                })
                if (!res.success) {
                    console.error('[Delete] Failed to delete Vercel project:', res.error, res.output)
                } else {
                    console.log('[Delete] Vercel project deleted successfully')
                }
            }

            // 2. Local Cleanup/Update
            if (target === 'local' || target === 'both') {
                await db.transaction('rw', [db.projects, db.folders, db.apiCollections, db.environments, db.syncQueue, db.teamConnections], async () => {
                    await db.apiCollections.where('projectId').equals(id).delete()
                    await db.folders.where('projectId').equals(id).delete()
                    await db.environments.where('projectId').equals(id).delete()
                    await db.syncQueue.where('projectId').equals(id).delete()
                    await db.teamConnections.where('projectId').equals(id).delete()
                    await db.projects.delete(id)
                })

                // Remove from recent projects list
                try {
                    await (window as any).electronAPI.removeRecentProject(id)
                } catch (e) {
                    console.error('[Delete] Failed to remove from recent projects:', e)
                }

                // Note: We do NOT delete the project directory from disk.
                // The user can re-import it or use git.
            } else if (target === 'remote') {
                // If we only deleted remote, we MUST clear the databaseUrl locally 
                // so the project reverts to "Local" mode
                await db.projects.update(id, { databaseUrl: '', proxyUrl: '' })

                // Update secrets file
                if (project?.localPath) {
                    fireAndForgetFileWrite('clearProjectSecrets', () =>
                        (window as any).electronAPI.writeProjectSecrets(project.localPath, {
                            databaseUrl: '',
                            proxyUrl: '',
                            lastDeployedAt: null
                        })
                    )
                }
            }
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] })
    })
}

export function useSyncProject() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (project: Project) => {
            const { activeBranch } = useAppStore.getState()
            await triggerFullProjectSync(qc, project, activeBranch || 'main')
        }
    })
}

export function useImportProject() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ url, projectId, name, localPath, branchName = 'main' }: { url: string; projectId: string; name: string; localPath: string, branchName?: string }) => {
            // 1. Fetch remote data (folders and apis)
            const res = await (window as any).electronAPI.fetchRemoteData(url, projectId, branchName)
            if (!res.success) throw new Error(res.error || 'Failed to fetch remote data')

            const { folders, apis, environments } = res

            // 2. Save locally
            await db.transaction('rw', [db.projects, db.folders, db.apiCollections, db.environments, db.syncQueue], async () => {
                // Ensure project exists locally
                await db.projects.put({
                    id: projectId,
                    name: name,
                    localPath: localPath,
                    databaseUrl: url, // Mark it as synced
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                })

                // Clear any existing data for this project ID (if it was somehow dirty)
                await db.folders.where('projectId').equals(projectId).delete()
                await db.apiCollections.where('projectId').equals(projectId).delete()

                // Save folders
                for (const f of folders) {
                    await db.folders.add({
                        id: f.id,
                        projectId: projectId,
                        name: f.name,
                        description: f.description,
                        orderIndex: f.order_index || 0,
                        lastSync: new Date().toISOString(),
                        syncStatus: 'synced',
                        createdAt: f.created_at ? new Date(f.created_at).toISOString() : new Date().toISOString(),
                        updatedAt: f.created_at ? new Date(f.created_at).toISOString() : new Date().toISOString()
                    })
                }

                // Save APIs
                for (const a of apis) {
                    console.log('[Import] Saving API:', a.id, a.name, {
                        url_params: a.url_params,
                        headers: a.headers,
                        request_body: a.request_body,
                        response_examples: a.response_examples
                    })
                    const safeParse = (val: any, fallback: any = null) => {
                        if (val === null || val === undefined || val === '') return fallback
                        if (typeof val !== 'string') return val
                        try { return JSON.parse(val) } catch (e) {
                            console.error('[Import] JSON.parse failed for API', a.id, a.name, '| value:', val, '| error:', e)
                            return fallback
                        }
                    }
                    await db.apiCollections.add({
                        id: a.id,
                        projectId: projectId,
                        folderId: a.folder_id,
                        name: a.name,
                        description: a.description,
                        method: a.method,
                        path: a.path,
                        urlParams: safeParse(a.url_params, []),
                        headers: safeParse(a.headers, []),
                        bodyType: a.body_type,
                        requestBody: safeParse(a.request_body, ''),
                        responseExamples: safeParse(a.response_examples, []),
                        version: a.version || 1,
                        lastSync: new Date().toISOString(),
                        syncStatus: 'synced',
                        createdAt: a.created_at ? new Date(a.created_at).toISOString() : new Date().toISOString(),
                        updatedAt: a.created_at ? new Date(a.created_at).toISOString() : new Date().toISOString()
                    })
                }

                // Save Environments
                await db.environments.where('projectId').equals(projectId).delete()
                for (const e of (environments || [])) {
                    await db.environments.add({
                        id: e.id,
                        projectId: projectId,
                        folderId: e.folder_id || null,
                        name: e.name,
                        baseUrl: e.base_url || '',
                        isGlobal: [1, true, 'true', '1'].includes(e.is_global),
                        variables: typeof e.variables === 'string' ? e.variables : JSON.stringify(e.variables || {}),
                        lastSync: new Date().toISOString(),
                        syncStatus: 'synced',
                        createdAt: e.created_at ? new Date(e.created_at).toISOString() : new Date().toISOString(),
                        updatedAt: e.created_at ? new Date(e.created_at).toISOString() : new Date().toISOString()
                    })
                }
            })

            // 3. Write everything to disk
            const allFolders = await db.folders.where('projectId').equals(projectId).toArray()
            const allApis = await db.apiCollections.where('projectId').equals(projectId).toArray()
            const allEnvs = await db.environments.where('projectId').equals(projectId).toArray()

            const syncMeta: any = {
                branch: branchName,
                lastSyncedCommit: '',
                entities: {}
            }
            for (const f of allFolders) syncMeta.entities[f.id] = { baseVersion: f.version || 1, lastCommit: '', tableName: 'folders' }
            for (const a of allApis) syncMeta.entities[a.id] = { baseVersion: a.version || 1, lastCommit: '', tableName: 'apiCollections' }
            for (const e of allEnvs) syncMeta.entities[e.id] = { baseVersion: e.version || 1, lastCommit: '', tableName: 'environments' }

            fireAndForgetFileWrite('writeFullProjectToDisk', async () => {
                await (window as any).electronAPI.writeFullProjectToDisk(localPath, {
                    project: { id: projectId, name, databaseUrl: url, localPath, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
                    folders: allFolders,
                    apis: allApis,
                    environments: allEnvs
                })
                await (window as any).electronAPI.writeSyncMeta(localPath, syncMeta)
            })

            // 4. Add to recent projects
            fireAndForgetFileWrite('addRecentProject', () =>
                (window as any).electronAPI.addRecentProject({ id: projectId, name, localPath })
            )

            return { id: projectId }
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['projects'] })
            qc.invalidateQueries({ queryKey: ['folders'] })
            qc.invalidateQueries({ queryKey: ['apis'] })
            qc.invalidateQueries({ queryKey: ['environments'] })
        }
    })
}
