import Dexie, { type EntityTable } from 'dexie'
import type { Project, Folder, ApiCollection, SyncQueueItem, SavedTeamConnection, Environment } from '@/types'

class ApiDocumenterDB extends Dexie {
    projects!: EntityTable<Project, 'id'>
    folders!: EntityTable<Folder, 'id'>
    apiCollections!: EntityTable<ApiCollection, 'id'>
    syncQueue!: EntityTable<SyncQueueItem, 'id'>
    teamConnections!: EntityTable<SavedTeamConnection, 'id'>
    environments!: EntityTable<Environment, 'id'>

    constructor() {
        super('ApiDocumenterDB')

        this.version(1).stores({
            projects: 'id, name, createdAt',
            folders: 'id, projectId, name, orderIndex, syncStatus, createdAt',
            apiCollections: 'id, projectId, folderId, name, method, syncStatus, createdAt',
            syncQueue: 'id, localId, tableName, status, createdAt'
        })

        this.version(2).stores({
            projects: 'id, name, createdAt',
            folders: 'id, projectId, name, orderIndex, syncStatus, createdAt',
            apiCollections: 'id, projectId, folderId, name, method, syncStatus, createdAt',
            syncQueue: 'id, localId, projectId, tableName, status, createdAt'
        })

        this.version(4).stores({
            projects: 'id, name, createdAt',
            folders: 'id, projectId, name, orderIndex, syncStatus, createdAt',
            apiCollections: 'id, projectId, folderId, name, method, syncStatus, createdAt',
            syncQueue: 'id, localId, projectId, tableName, status, createdAt',
            teamConnections: 'id, name, url, projectId, lastUsedAt',
            environments: 'id, projectId, folderId, name, isGlobal, syncStatus, createdAt'
        })

        this.version(7).stores({
            projects: 'id, name, localPath, createdAt, updatedAt',
            folders: 'id, projectId, name, orderIndex, syncStatus, createdAt, updatedAt',
            apiCollections: 'id, projectId, folderId, name, method, syncStatus, createdAt, updatedAt',
            syncQueue: 'id, localId, projectId, branch, tableName, status, createdAt',
            teamConnections: 'id, name, url, projectId, lastUsedAt',
            environments: 'id, projectId, folderId, name, isGlobal, syncStatus, createdAt, updatedAt'
        })

        // Version 8: Add compound index for syncQueue upsert behavior
        this.version(8).stores({
            projects: 'id, name, localPath, createdAt, updatedAt',
            folders: 'id, projectId, name, orderIndex, syncStatus, createdAt, updatedAt',
            apiCollections: 'id, projectId, folderId, name, method, syncStatus, createdAt, updatedAt',
            syncQueue: 'id, localId, [projectId+localId], projectId, branch, tableName, status, createdAt',
            teamConnections: 'id, name, url, projectId, lastUsedAt',
            environments: 'id, projectId, folderId, name, isGlobal, syncStatus, createdAt, updatedAt'
        })

    }
}

export const db = new ApiDocumenterDB()
