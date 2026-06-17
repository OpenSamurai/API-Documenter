import { ipcMain, app, shell } from 'electron'
import { BaseController } from './BaseController'
import { autoUpdater } from 'electron-updater'
import ElectronStore from 'electron-store'
import fs from 'fs'
import { join } from 'path'
import { fileWatcherManager } from '../fileWatcher'
import { sendHttpRequest } from '../requestHandler'
import { cookieStore } from '../cookieStore'
import { exportHtmlToPdf, generateMarkdownToPdf, previewMarkdownToPdf } from '../pdfHandler'

const store = new ElectronStore()

export class SystemController extends BaseController {
    registerHandlers(): void {
        // Window controls
        ipcMain.on('window-minimize', () => this.mainWindow?.minimize())
        ipcMain.on('window-maximize', () => {
            if (this.mainWindow?.isMaximized()) {
                this.mainWindow.unmaximize()
            } else {
                this.mainWindow?.maximize()
            }
        })
        ipcMain.on('window-close', () => this.mainWindow?.close())
        ipcMain.handle('window-is-maximized', () => this.mainWindow?.isMaximized())

        // File operations
        ipcMain.handle('save-file', async (_event, filePath: string, data: string) => {
            try {
                const dir = join(filePath, '..')
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
                fs.writeFileSync(filePath, data, 'utf-8')
                return { success: true }
            } catch (error) {
                return { success: false, error: String(error) }
            }
        })
        ipcMain.handle('read-file', async (_event, filePath: string) => {
            try {
                const data = fs.readFileSync(filePath, 'utf-8')
                return { success: true, data }
            } catch (error) {
                return { success: false, error: String(error) }
            }
        })
        ipcMain.handle('get-app-path', () => app.getPath('userData'))
        ipcMain.handle('get-app-version', () => app.getVersion())
        ipcMain.handle('open-in-explorer', async (_event, dirPath: string) => {
            shell.openPath(dirPath)
            return { success: true }
        })

        // Recent Projects
        ipcMain.handle('get-recent-projects', async () => {
            return store.get('recentProjects', []) as any[]
        })
        ipcMain.handle('add-recent-project', async (_event, project: any) => {
            const recent = (store.get('recentProjects', []) as any[])
            const filtered = recent.filter((p: any) => p.id !== project.id)
            filtered.unshift({ ...project, lastOpenedAt: Date.now() })
            store.set('recentProjects', filtered.slice(0, 20))
            return { success: true }
        })
        ipcMain.handle('remove-recent-project', async (_event, projectId: string) => {
            const recent = (store.get('recentProjects', []) as any[])
            store.set('recentProjects', recent.filter((p: any) => p.id !== projectId))
            return { success: true }
        })

        // File Watcher
        ipcMain.handle('start-file-watcher', async (_event, dirPath: string) => {
            if (this.mainWindow) fileWatcherManager.start(dirPath, this.mainWindow)
            return { success: true }
        })
        ipcMain.handle('stop-file-watcher', async () => {
            fileWatcherManager.stop()
            return { success: true }
        })

        // HTTP & Cookies
        ipcMain.handle('send-http-request', async (_event, opts: any) => sendHttpRequest(opts))
        ipcMain.handle('get-all-cookies', async () => cookieStore.getAllCookiesByDomain())
        ipcMain.handle('set-cookie-manually', async (_event, domain, cookie) => cookieStore.addCookieManually(domain, cookie))
        ipcMain.handle('update-cookie-raw', async (_event, domain, rawString, oldName) => cookieStore.updateCookieFromRaw(domain, rawString, oldName))
        ipcMain.handle('delete-cookie', async (_event, url, name) => cookieStore.deleteCookie(url, name))
        ipcMain.handle('clear-domain-cookies', async (_event, domain) => cookieStore.clearDomainCookies(domain))
        ipcMain.handle('clear-all-cookies', async () => cookieStore.clearAllCookies())
        ipcMain.handle('get-cookie-whitelist', async () => cookieStore.getWhitelist())
        ipcMain.handle('add-to-whitelist', async (_event, domain) => cookieStore.addToWhitelist(domain))
        ipcMain.handle('remove-from-whitelist', async (_event, domain) => cookieStore.removeFromWhitelist(domain))

        // PDF
        ipcMain.handle('export-pdf', async (_event, html, fileName) => exportHtmlToPdf(html, fileName))
        ipcMain.handle('preview-doc-pdf', async (_event, markdownContent) => previewMarkdownToPdf(markdownContent))
        ipcMain.handle('generate-doc-pdf', async (_event, markdownContent, fileName) => generateMarkdownToPdf(markdownContent, fileName))

        // Updates
        ipcMain.handle('restart-app', () => autoUpdater.quitAndInstall())
        
        autoUpdater.on('checking-for-update', () => this.mainWindow?.webContents.send('update-status', 'checking'))
        autoUpdater.on('update-available', (info) => this.mainWindow?.webContents.send('update-status', 'available', info.version))
        autoUpdater.on('update-not-available', () => this.mainWindow?.webContents.send('update-status', 'up-to-date'))
        autoUpdater.on('download-progress', (progressObj) => this.mainWindow?.webContents.send('update-progress', Math.round(progressObj.percent)))
        autoUpdater.on('update-downloaded', (info) => this.mainWindow?.webContents.send('update-status', 'downloaded', info.version))
        autoUpdater.on('error', (err) => this.mainWindow?.webContents.send('update-status', 'error', err.message))
    }
}
