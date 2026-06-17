import simpleGit, { SimpleGit } from 'simple-git'
import { fileWatcherManager } from './fileWatcher'
import fs from 'fs'
import path from 'path'
import mysql from 'mysql2/promise'
import pg from 'pg'

export class GitManager {
    private git: SimpleGit

    constructor(private dirPath: string) {
        this.git = simpleGit(dirPath)
    }

    async getStatus() {
        try {
            const status = await this.git.status()
            
            // To provide a format similar to VS code, we want to know staged vs unstaged, etc.
            // status.modified, status.not_added, status.deleted, status.staged
            return { success: true, status: JSON.parse(JSON.stringify(status)) }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    async add(filePaths: string | string[]) {
        try {
            const gitRoot = await this.git.revparse(['--show-toplevel'])
            console.log(`[GitManager] git add | Dir: ${this.dirPath} | Git Root: ${gitRoot} | Files:`, filePaths)
            
            // We cannot use fs.existsSync check here because git add is used to stage deletions as well.
            const paths = (Array.isArray(filePaths) ? filePaths : [filePaths]).map(p => p.trim())

            fileWatcherManager.pause()
            // Normalize paths to forward slashes for Git
            const normalized = paths.map(p => p.replace(/\\/g, '/'))
            
            await this.git.add(normalized)
            fileWatcherManager.resume()
            return { success: true }
        } catch (error: any) {
            console.error(`[GitManager] git add FAILED:`, error.message)
            fileWatcherManager.resume()
            return { success: false, error: error.message }
        }
    }

    async unstage(filePaths: string | string[]) {
        try {
            fileWatcherManager.pause()
            await this.git.raw(['reset', 'HEAD', '--', ...(Array.isArray(filePaths) ? filePaths : [filePaths])])
            fileWatcherManager.resume()
            return { success: true }
        } catch (error: any) {
            fileWatcherManager.resume()
            return { success: false, error: error.message }
        }
    }

    async commit(message: string, proxyUrl?: string, proxyToken?: string, branchName?: string) {
        let syncQueueQuery: any[] | null = null
        try {

            fileWatcherManager.pause()
            await this.git.commit(message)
            
            // Get the commit hash
            const commitHash = (await this.git.revparse(['HEAD'])).trim()

            // Get files that were changed in this commit
            const diffTree = await this.git.raw(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])
            const files = diffTree.split('\n').filter(Boolean)
            
            const committedIds: string[] = []
            for (const file of files) {
                try {
                    if (file.endsWith('.apidoc') || file.endsWith('.folder') || file.endsWith('.json')) {
                        const fullPath = path.join(this.dirPath, file)
                        if (fs.existsSync(fullPath)) {
                            const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
                            if (data.id) committedIds.push(data.id)
                        } else {
                            // File was deleted in this commit. Read its content from the previous commit!
                            const oldContent = await this.git.show([`HEAD^:${file.replace(/\\/g, '/')}`])
                            if (oldContent) {
                                const data = JSON.parse(oldContent)
                                if (data.id) committedIds.push(data.id)
                            }
                        }
                    }
                } catch (err) { /* ignore parse errors */ }
            }

            fileWatcherManager.resume()
            return { success: true, committedIds, commitHash, syncQueueQuery }
        } catch (error: any) {
            fileWatcherManager.resume()
            return { success: false, error: error.message }
        }
    }

    async discard(filePaths: string | string[]) {
        try {
            fileWatcherManager.pause()
            const paths = Array.isArray(filePaths) ? filePaths : [filePaths]
            try {
                await this.git.checkout(['--', ...paths])
            } catch (err) {
                for (const p of paths) {
                    try { await this.git.checkout(['--', p]) } catch (e) { /* ignore */ }
                }
            }
            try {
                await this.git.clean('f', ['--', ...paths])
            } catch (err) {
                for (const p of paths) {
                    try { await this.git.clean('f', ['--', p]) } catch (e) { /* ignore */ }
                }
            }
            fileWatcherManager.resume()
            return { success: true }
        } catch (error: any) {
            fileWatcherManager.resume()
            return { success: false, error: error.message }
        }
    }

    async getBranches() {
        try {
            const branches = await this.git.branch()
            return { success: true, branches: JSON.parse(JSON.stringify(branches)) }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }

    async checkoutBranch(branchName: string) {
        try {
            fileWatcherManager.pause()
            await this.git.checkout(branchName)
            fileWatcherManager.resume()
            return { success: true }
        } catch (error: any) {
            fileWatcherManager.resume()
            return { success: false, error: error.message }
        }
    }

    async createBranch(branchName: string) {
        try {
            fileWatcherManager.pause()
            await this.git.checkoutLocalBranch(branchName)
            fileWatcherManager.resume()
            return { success: true }
        } catch (error: any) {
            fileWatcherManager.resume()
            return { success: false, error: error.message }
        }
    }

    async getLogs() {
        try {
            const logs = await this.git.log({ maxCount: 30 })
            return { success: true, logs: JSON.parse(JSON.stringify(logs)) }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }
}
