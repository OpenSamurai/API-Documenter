/**
 * Utility to get the project's localPath for file system operations.
 * All hooks should use this to resolve the disk path before writing.
 */
import { db } from '@/db'

export async function getProjectLocalPath(projectId: string): Promise<string | null> {
    const project = await db.projects.get(projectId)
    return project?.localPath || null
}

/**
 * Fire-and-forget file write. Logs errors but does not throw.
 * This ensures file writes never block the UI.
 */
export function fireAndForgetFileWrite(label: string, fn: () => Promise<any>): void {
    fn().then(res => {
        if (res && !res.success) {
            console.warn(`[FileSync] ${label} failed:`, res.error)
        }
    }).catch(err => {
        console.warn(`[FileSync] ${label} error:`, err)
    })
}
