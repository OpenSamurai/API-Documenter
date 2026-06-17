import { BrowserWindow, ipcMain } from 'electron'

export abstract class BaseController {
    protected mainWindow: BrowserWindow | null

    constructor(mainWindow: BrowserWindow | null) {
        this.mainWindow = mainWindow
    }

    /**
     * Helper to register IPC handlers
     */
    abstract registerHandlers(): void
}
