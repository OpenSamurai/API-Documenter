import { db } from './db'

export async function diagnoseSyncQueue(projectId: string, branch: string) {
    const all = await db.syncQueue.where('projectId').equals(projectId).toArray()
    console.log(`[Diagnostic] Total items for project ${projectId}:`, all.length)
    
    const forBranch = all.filter(item => item.branch === branch)
    console.log(`[Diagnostic] Items for branch ${branch}:`, forBranch.length)
    
    const pending = forBranch.filter(item => item.status === 'pending')
    console.log(`[Diagnostic] Pending for branch ${branch}:`, pending.length)
    
    if (pending.length > 0) {
        console.table(pending.map(p => ({
            id: p.id,
            table: p.tableName,
            op: p.operation,
            branch: p.branch,
            localId: p.localId
        })))
    }
}
