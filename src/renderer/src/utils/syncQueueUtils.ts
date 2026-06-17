import { db } from '@/db'
import { v4 as uuid } from 'uuid'
import type { SyncTableName, SyncOperation } from '@/types'

/**
 * Upsert a sync queue item. If an existing 'uncommitted' entry for the same
 * entity (projectId + localId) already exists, update it with the latest data
 * and version instead of creating a duplicate. This prevents queue bloat when
 * the user saves the same entity multiple times before committing.
 */
export async function upsertSyncQueueItem(item: {
    localId: string
    projectId: string
    branch: string
    tableName: SyncTableName
    operation: SyncOperation
    data: string
    version?: number
    status?: 'uncommitted' | 'pending'
}): Promise<void> {
    const status = item.status || 'uncommitted'

    const existing = await db.syncQueue
        .where('[projectId+localId]')
        .equals([item.projectId, item.localId])
        .and(i => i.status === 'uncommitted')
        .first()

    if (existing) {
        // Update existing entry with latest data, version, operation, and branch
        await db.syncQueue.update(existing.id, {
            data: item.data,
            version: item.version,
            operation: item.operation,
            branch: item.branch,
            status
        })
    } else {
        await db.syncQueue.add({
            id: uuid(),
            localId: item.localId,
            projectId: item.projectId,
            branch: item.branch,
            tableName: item.tableName,
            operation: item.operation,
            data: item.data,
            version: item.version,
            status,
            retries: 0,
            createdAt: new Date().toISOString()
        })
    }
}
