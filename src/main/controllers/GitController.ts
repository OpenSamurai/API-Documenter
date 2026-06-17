import { ipcMain } from 'electron'
import { BaseController } from './BaseController'
import { GitManager } from '../gitManager'

export class GitController extends BaseController {
    registerHandlers(): void {
        ipcMain.handle('git-status', async (_event, dirPath: string) => {
            const git = new GitManager(dirPath)
            return await git.getStatus()
        })
        ipcMain.handle('git-add', async (_event, dirPath: string, filePaths: string | string[]) => {
            const git = new GitManager(dirPath)
            return await git.add(filePaths)
        })
        ipcMain.handle('git-unstage', async (_event, dirPath: string, filePaths: string | string[]) => {
            const git = new GitManager(dirPath)
            return await git.unstage(filePaths)
        })
        ipcMain.handle('git-commit', async (_event, dirPath: string, message: string, proxyUrl?: string, proxyToken?: string, branchName?: string) => {
            const git = new GitManager(dirPath)
            return await git.commit(message, proxyUrl, proxyToken, branchName)
        })
        ipcMain.handle('git-discard', async (_event, dirPath: string, filePaths: string | string[]) => {
            const git = new GitManager(dirPath)
            return await git.discard(filePaths)
        })
        ipcMain.handle('git-branches', async (_event, dirPath: string) => {
            const git = new GitManager(dirPath)
            return await git.getBranches()
        })
        ipcMain.handle('git-checkout-branch', async (_event, dirPath: string, branchName: string) => {
            const git = new GitManager(dirPath)
            return await git.checkoutBranch(branchName)
        })
        ipcMain.handle('git-create-branch', async (_event, dirPath: string, branchName: string) => {
            const git = new GitManager(dirPath)
            return await git.createBranch(branchName)
        })
        ipcMain.handle('git-logs', async (_event, dirPath: string) => {
            const git = new GitManager(dirPath)
            return await git.getLogs()
        })
    }
}
