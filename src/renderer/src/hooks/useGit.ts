import { useState, useCallback, useEffect } from 'react'
import { getProjectLocalPath } from '@/utils/fileSync'

export interface GitStatusResult {
    not_added: string[]
    conflicted: string[]
    created: string[]
    deleted: string[]
    modified: string[]
    renamed: any[]
    files: any[]
    staged: string[]
    ahead: number
    behind: number
    current: string
    tracking: string | null
}

export function useGit(projectId: string | null) {
    const [status, setStatus] = useState<GitStatusResult | null>(null)
    const [branches, setBranches] = useState<any>(null)
    const [logs, setLogs] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchStatus = useCallback(async () => {
        if (!projectId) return
        setIsLoading(true)
        setError(null)
        try {
            const localPath = await getProjectLocalPath(projectId)
            if (!localPath) throw new Error('No local path found for project')
            
            const [resStatus, resBranches, resLogs] = await Promise.all([
                (window as any).electronAPI.gitStatus(localPath),
                (window as any).electronAPI.gitBranches(localPath),
                (window as any).electronAPI.gitLogs(localPath)
            ])

            if (resStatus.success) setStatus(resStatus.status)
            else setError(resStatus.error)

            if (resBranches.success) setBranches(resBranches.branches)
            if (resLogs.success) setLogs(resLogs.logs?.all || [])
            
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }, [projectId])

    useEffect(() => {
        fetchStatus()
        
        // Listen to chokidar changes
        const unlisten = (window as any).electronAPI.onProjectFilesChanged(async () => {
            fetchStatus()
        })
        return () => {
            if (unlisten) unlisten()
        }
    }, [fetchStatus])

    const stageFile = async (filePath: string | string[]) => {
        if (!projectId) return
        const localPath = await getProjectLocalPath(projectId)
        if (localPath) await (window as any).electronAPI.gitAdd(localPath, filePath)
        await fetchStatus()
    }

    const unstageFile = async (filePath: string | string[]) => {
        if (!projectId) return
        const localPath = await getProjectLocalPath(projectId)
        if (localPath) await (window as any).electronAPI.gitUnstage(localPath, filePath)
        await fetchStatus()
    }

    const commitMessage = async (msg: string) => {
        if (!projectId) return
        const localPath = await getProjectLocalPath(projectId)
        if (localPath) await (window as any).electronAPI.gitCommit(localPath, msg)
        await fetchStatus()
    }

    const discardFile = async (filePath: string | string[]) => {
        if (!projectId) return
        const localPath = await getProjectLocalPath(projectId)
        if (localPath) await (window as any).electronAPI.gitDiscard(localPath, filePath)
        await fetchStatus()
    }

    const switchBranch = async (branchName: string) => {
        if (!projectId) return
        setIsLoading(true)
        const localPath = await getProjectLocalPath(projectId)
        if (localPath) {
            const res = await (window as any).electronAPI.gitCheckoutBranch(localPath, branchName)
            if (!res.success) {
                setError(res.error)
                setIsLoading(false)
                return { success: false }
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
        status,
        branches,
        logs,
        isLoading,
        error,
        clearError: () => setError(null),
        fetchStatus,
        stageFile,
        unstageFile,
        commitMessage,
        discardFile,
        switchBranch,
        createBranch
    }
}
