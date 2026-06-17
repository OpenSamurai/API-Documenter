import { ipcMain, dialog } from 'electron'
import { BaseController } from './BaseController'
import * as fsManager from '../fileSystemManager'
import { fileWatcherManager } from '../fileWatcher'

export class ProjectController extends BaseController {
    registerHandlers(): void {
        ipcMain.handle('init-project-directory', async (_event, dirPath, projectData) => {
            fileWatcherManager.pause()
            const res = fsManager.initProjectDirectory(dirPath, projectData)
            fileWatcherManager.resume()
            return res
        })
        ipcMain.handle('read-sync-meta', async (_event, dirPath) => {
            return fsManager.readSyncMeta(dirPath)
        })
        ipcMain.handle('write-sync-meta', async (_event, dirPath, data) => {
            fileWatcherManager.pause()
            const res = fsManager.writeSyncMeta(dirPath, data)
            fileWatcherManager.resume()
            return res
        })
        ipcMain.handle('write-project-meta', async (_event, dirPath, projectData) => {
            fileWatcherManager.pause()
            const res = fsManager.writeProjectMeta(dirPath, projectData)
            fileWatcherManager.resume()
            return res
        })
        ipcMain.handle('write-project-secrets', async (_event, dirPath, secrets) => {
            fileWatcherManager.pause()
            const res = fsManager.writeProjectSecrets(dirPath, secrets)
            fileWatcherManager.resume()
            return res
        })
        ipcMain.handle('read-project-secrets', async (_event, dirPath) => {
            try {
                const secretsPath = require('path').join(dirPath, 'project.secrets.json')
                if (require('fs').existsSync(secretsPath)) {
                    const content = require('fs').readFileSync(secretsPath, 'utf-8')
                    return { success: true, secrets: JSON.parse(content) }
                }
                return { success: false, error: 'Secrets file not found' }
            } catch (err: any) {
                return { success: false, error: err.message }
            }
        })
        ipcMain.handle('write-folder-meta', async (_event, dirPath, folderData) => {
            fileWatcherManager.pause()
            const res = fsManager.writeFolderMeta(dirPath, folderData)
            fileWatcherManager.resume()
            return res
        })
        ipcMain.handle('rename-folder-dir', async (_event, dirPath, folderId, newName) => {
            fileWatcherManager.pause()
            const res = fsManager.renameFolderDir(dirPath, folderId, newName)
            fileWatcherManager.resume()
            return res
        })
        ipcMain.handle('delete-folder-dir', async (_event, dirPath, folderId) => {
            fileWatcherManager.pause()
            const res = fsManager.deleteFolderDir(dirPath, folderId)
            fileWatcherManager.resume()
            return res
        })
        ipcMain.handle('write-api-file', async (_event, dirPath, folderId, apiData) => {
            fileWatcherManager.pause()
            const res = fsManager.writeApiFile(dirPath, folderId, apiData)
            fileWatcherManager.resume()
            return res
        })
        ipcMain.handle('delete-api-file', async (_event, dirPath, folderId, apiId) => {
            fileWatcherManager.pause()
            const res = fsManager.deleteApiFile(dirPath, folderId, apiId)
            fileWatcherManager.resume()
            return res
        })
        ipcMain.handle('write-environment-file', async (_event, dirPath, envData) => {
            fileWatcherManager.pause()
            const res = fsManager.writeEnvironmentFile(dirPath, envData)
            fileWatcherManager.resume()
            return res
        })
        ipcMain.handle('delete-environment-file', async (_event, dirPath, envId) => {
            fileWatcherManager.pause()
            const res = fsManager.deleteEnvironmentFile(dirPath, envId)
            fileWatcherManager.resume()
            return res
        })
        ipcMain.handle('read-project-from-disk', async (_event, dirPath) => {
            return fsManager.readProjectFromDisk(dirPath)
        })
        ipcMain.handle('write-full-project-to-disk', async (_event, dirPath, data) => {
            fileWatcherManager.pause()
            const res = fsManager.writeFullProjectToDisk(dirPath, data)
            fileWatcherManager.resume()
            return res
        })
        ipcMain.handle('select-directory', async () => {
            const result = await dialog.showOpenDialog(this.mainWindow!, {
                properties: ['openDirectory']
            })
            return result.canceled ? null : result.filePaths[0]
        })
        ipcMain.handle('select-files', async () => {
            const result = await dialog.showOpenDialog(this.mainWindow!, {
                properties: ['openFile', 'multiSelections']
            })
            return result.canceled ? null : result.filePaths
        })
    }
}
