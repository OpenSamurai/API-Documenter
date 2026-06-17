import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'

// Import Controllers
import { SystemController } from './controllers/SystemController'
import { ProjectController } from './controllers/ProjectController'
import { DatabaseController } from './controllers/DatabaseController'
import { SyncController } from './controllers/SyncController'
import { DeploymentController } from './controllers/DeploymentController'
import { GitController } from './controllers/GitController'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        show: false,
        frame: false,
        backgroundColor: '#0f0f17',
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    mainWindow.on('ready-to-show', () => {
        mainWindow?.show()
    })

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    // Initialize and Register Controllers
    const controllers = [
        new SystemController(mainWindow),
        new ProjectController(mainWindow),
        new DatabaseController(mainWindow),
        new SyncController(mainWindow),
        new DeploymentController(mainWindow),
        new GitController(mainWindow)
    ]

    controllers.forEach(controller => controller.registerHandlers())
}

app.whenReady().then(() => {
    if (!is.dev) {
        autoUpdater.checkForUpdatesAndNotify()
    }

    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
