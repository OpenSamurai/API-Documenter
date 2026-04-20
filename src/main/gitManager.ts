import simpleGit, { SimpleGit } from 'simple-git'
import { fileWatcherManager } from './fileWatcher'

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
            fileWatcherManager.pause()
            await this.git.add(filePaths)
            fileWatcherManager.resume()
            return { success: true }
        } catch (error: any) {
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

    async commit(message: string) {
        try {
            fileWatcherManager.pause()
            await this.git.commit(message)
            fileWatcherManager.resume()
            return { success: true }
        } catch (error: any) {
            fileWatcherManager.resume()
            return { success: false, error: error.message }
        }
    }

    async discard(filePaths: string | string[]) {
        try {
            fileWatcherManager.pause()
            // Checks out the file from HEAD (reverting it to last committed state)
            await this.git.checkout(['--', ...(Array.isArray(filePaths) ? filePaths : [filePaths])])
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
