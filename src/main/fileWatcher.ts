import chokidar from 'chokidar'
import { BrowserWindow } from 'electron'
import path from 'path'

class FileWatcherManager {
    private watcher: chokidar.FSWatcher | null = null
    private currentDirPath: string | null = null
    private debounceTimer: NodeJS.Timeout | null = null
    private isPaused = false

    start(dirPath: string, window: BrowserWindow) {
        if (this.currentDirPath === dirPath) return // Already watching

        this.stop() // Stop any existing watcher

        this.currentDirPath = dirPath
        this.watcher = chokidar.watch([
            path.join(dirPath, '*.apidoc'),
            path.join(dirPath, '*.json'),
            path.join(dirPath, 'folders', '**', '*.json'),
            path.join(dirPath, 'folders', '**', '*.apidoc'),
            path.join(dirPath, 'environments', '*.json')
        ], {
            ignored: [/(^|[\/\\])\../, '**/project.secrets.json'], // Ignore dotfiles and secrets
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 300,
                pollInterval: 100
            }
        })

        const handleChange = (eventName: string, filePath: string) => {
            if (this.isPaused) return

            console.log(`[FileWatcher] Detected ${eventName} on ${filePath}`)

            // Debounce the notification to the renderer
            if (this.debounceTimer) clearTimeout(this.debounceTimer)
            this.debounceTimer = setTimeout(() => {
                if (!this.isPaused && window && !window.isDestroyed()) {
                    window.webContents.send('project-files-changed', { dirPath: this.currentDirPath })
                }
            }, 500)
        }

        this.watcher.on('add', (path) => handleChange('add', path))
        this.watcher.on('change', (path) => handleChange('change', path))
        this.watcher.on('unlink', (path) => handleChange('unlink', path))
    }

    stop() {
        if (this.watcher) {
            this.watcher.close()
            this.watcher = null
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
            this.debounceTimer = null
        }
        this.currentDirPath = null
    }

    pause() {
        this.isPaused = true
    }

    resume() {
        this.isPaused = false
    }
}

export const fileWatcherManager = new FileWatcherManager()
