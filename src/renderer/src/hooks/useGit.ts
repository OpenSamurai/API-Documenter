import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getProjectLocalPath } from '@/utils/fileSync'
import { useAppStore } from '@/stores/appStore'
import { db } from '@/db'
import { useSync } from './useSync'
import { reconcileProjectFiles } from './useFileWatcher'
import type { GitStatusResult } from '@/renderer/src/types'

export function useGit(projectId: string | null) {
    const qc = useQueryClient()
    const { syncNow } = useSync()
    const { setActiveBranch, gitStatus, gitBranches, gitLogs, setGitState } = useAppStore()
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [hasUnresolvedConflicts, setHasUnresolvedConflicts] = useState(false)

    // Check for unresolved conflicts in sync_queue
    const checkConflicts = useCallback(async () => {
        if (!projectId) return
        const conflictCount = await db.syncQueue
            .where('projectId').equals(projectId)
            .and(item => item.status === 'conflict')
            .count()
        setHasUnresolvedConflicts(conflictCount > 0)
    }, [projectId])

    const fetchStatus = useCallback(async () => {
        if (!projectId) return
        setIsLoading(true)
        setError(null)
        try {
            const localPath = await getProjectLocalPath(projectId)
            if (!localPath) throw new Error('No local path found for project')
            
            const [resStatus, resBranches, resLogs, resSecrets] = await Promise.all([
                (window as any).electronAPI.gitStatus(localPath),
                (window as any).electronAPI.gitBranches(localPath),
                (window as any).electronAPI.gitLogs(localPath),
                (window as any).electronAPI.readProjectSecrets(localPath)
            ])

            if (!resStatus.success) {
                setError(resStatus.error)
            } else {
                setActiveBranch(resStatus.status.current)
                setGitState(
                    resStatus.status,
                    resBranches.success ? resBranches.branches : gitBranches,
                    resLogs.success ? (resLogs.logs?.all || []) : gitLogs
                )
            }
            
            if (resSecrets.success) {
                const { setCurrentSyncBranch, setDatabaseUrl } = useAppStore.getState()
                setCurrentSyncBranch(resSecrets.secrets.currentSyncBranch || null)
                setDatabaseUrl(resSecrets.secrets.databaseUrl || null)
            } else {
                useAppStore.getState().setDatabaseUrl(null)
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }, [projectId, setActiveBranch, setGitState]) // Removed gitStatus, gitBranches, gitLogs from deps

    useEffect(() => {
        if (!projectId) return
        fetchStatus()
        checkConflicts()
    }, [projectId, fetchStatus, checkConflicts])

    const stageFile = async (filePath: string | string[]) => {
        if (!projectId) return
        setIsLoading(true)
        try {
            const localPath = await getProjectLocalPath(projectId)
            if (localPath) {
                const res = await (window as any).electronAPI.gitAdd(localPath, filePath)
                if (!res.success) throw new Error(res.error)
            }
            await fetchStatus()
        } catch (err: any) {
            setError(err.message)
            setIsLoading(false)
        }
    }

    const unstageFile = async (filePath: string | string[]) => {
        if (!projectId) return
        setIsLoading(true)
        try {
            const localPath = await getProjectLocalPath(projectId)
            if (localPath) {
                const res = await (window as any).electronAPI.gitUnstage(localPath, filePath)
                if (!res.success) throw new Error(res.error)
            }
            await fetchStatus()
        } catch (err: any) {
            setError(err.message)
            setIsLoading(false)
        }
    }

    const commitMessage = async (msg: string) => {
        if (!projectId) return
        setIsLoading(true)
        try {
            const localPath = await getProjectLocalPath(projectId)
            if (localPath) {
                // ─── PRE-COMMIT: Check for existing unresolved conflicts ───
                const existingConflicts = await db.syncQueue
                    .where('projectId').equals(projectId)
                    .and(item => item.status === 'conflict')
                    .count()
                if (existingConflicts > 0) {
                    setError('Resolve all sync conflicts before committing. Syncing now to show the resolution UI...')
                    await syncNow(false, false, false)
                    setIsLoading(false)
                    return
                }

                // ─── PULL BEFORE COMMIT ───
                // Ensure we have the latest changes and resolve conflicts before committing our own edits
                const preSyncResult = await syncNow(true, false)
                if (preSyncResult?.conflicts && preSyncResult.conflicts.length > 0) {
                    useAppStore.getState().setSyncConflicts(preSyncResult.conflicts)
                    setHasUnresolvedConflicts(true)
                    setIsLoading(false)
                    return // Stop commit process due to conflicts
                }

                const { activeBranch } = useAppStore.getState()
                
                // Retrieve saved connection info from persistent IndexedDB to query proxy even after restart
                const savedConn = await db.teamConnections.get(projectId)
                const proxyUrl = savedConn?.url
                const proxyToken = savedConn?.token

                const res = await (window as any).electronAPI.gitCommit(localPath, msg, proxyUrl, proxyToken, activeBranch || 'main')
                if (!res.success) throw new Error(res.error)

                if (res.syncQueueQuery) {
                    console.log(`[Git] Query result for sync_queue before commit:`)
                    console.table(res.syncQueueQuery)
                }

                // ─── BLESS UNCOMMITTED CHANGES ───
                // After a successful commit, ONLY items that were actually included in the Git commit become 'pending'
                const committedIds: string[] = res.committedIds || []
                const commitHash: string = res.commitHash || ''
                await db.syncQueue
                    .where('projectId').equals(projectId)
                    .and(item => item.status === 'uncommitted' && (!activeBranch || item.branch === activeBranch))
                    .modify(item => {
                        if (committedIds.includes(item.localId)) {
                            item.status = 'pending'
                        }
                    })
                
                console.log(`[Git] Committed ${committedIds.length} entities (hash: ${commitHash}). Promoted to 'pending'.`)

                // Store commitHash in appStore so the sync engine can persist it in .sync-meta.json
                useAppStore.getState().setLastCommitHash?.(commitHash)

                // ─── AUTO-SYNC (PUSH) ───
                // Push the newly committed changes
                await syncNow(false, false)
            }
            await fetchStatus()
            await checkConflicts() // Refresh conflict state
        } catch (err: any) {
            setError(err.message)
            setIsLoading(false)
        }
    }

    const discardFile = async (filePath: string | string[]) => {
        if (!projectId) return
        setIsLoading(true)
        try {
            const localPath = await getProjectLocalPath(projectId)
            if (localPath) {
                const res = await (window as any).electronAPI.gitDiscard(localPath, filePath)
                if (!res.success) throw new Error(res.error)
            }
            await fetchStatus()
        } catch (err: any) {
            setError(err.message)
            setIsLoading(false)
        }
    }

    const switchBranch = async (branchName: string) => {
        if (!projectId) return
        setIsLoading(true)
        const localPath = await getProjectLocalPath(projectId)
        if (localPath) {
            const res = await (window as any).electronAPI.gitCheckoutBranch(localPath, branchName)
            if (!res.success) {
                setError(res.error)
                setIsLoading(true) // Keep loading while we revert or show error
                return { success: false }
            }
            
            // ─── REFRESH WORKSPACE FROM DISK ───
            // After switching branches, the files on disk have changed. 
            // We MUST reconcile them into IndexedDB immediately.
            try {
                await reconcileProjectFiles(projectId, localPath, qc, 'pending')
                console.log(`[Git] Workspace reconciled after switching to branch: ${branchName}`)
            } catch (err) {
                console.error('[Git] Failed to reconcile workspace after branch switch:', err)
            }
        }
        await fetchStatus()
        return { success: true }
    }

    const createBranch = async (branchName: string) => {
        if (!projectId) return
        setIsLoading(true)
        const localPath = await getProjectLocalPath(projectId)
        if (localPath) {
            const res = await (window as any).electronAPI.gitCreateBranch(localPath, branchName)
            if (!res.success) {
                setError(res.error)
                setIsLoading(false)
                return { success: false }
            }
        }
        await fetchStatus()
        return { success: true }
    }

    return {
        status: gitStatus,
        branches: gitBranches,
        logs: gitLogs,
        isLoading,
        error,
        hasUnresolvedConflicts,
        clearError: () => setError(null),
        fetchStatus,
        stageFile,
        unstageFile,
        commitMessage,
        discardFile,
        switchBranch,
        createBranch,
        checkConflicts
    }
}
