import { contextBridge, ipcRenderer } from 'electron'

export interface HttpRequestOptions {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
}

export interface HttpResponse {
    success: boolean
    status?: number
    statusText?: string
    headers?: Record<string, string>
    body?: string
    time: number
    size?: number
    error?: string
}

export interface ElectronAPI {
    // Window controls
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    // File system
    saveFile: (filePath: string, data: string) => Promise<{ success: boolean; error?: string }>
    readFile: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>
    selectDirectory: () => Promise<string | null>
    selectFiles: () => Promise<string[] | null>
    getAppPath: () => Promise<string>
    getAppVersion: () => Promise<string>
    // HTTP requests
    sendHttpRequest: (opts: HttpRequestOptions) => Promise<HttpResponse>
    // Remote DB management
    testDbConnection: (url: string) => Promise<{ success: boolean; error?: string }>
    createRemoteTables: (url: string) => Promise<{ success: boolean; error?: string }>
    createRbacUser: (url: string, user: { id: string, email: string, token: string, allowedFolders: any, allowedEnvironments: any, projectId: string, role: string }) => Promise<{ success: boolean; error?: string }>
    syncDirect: (url: string, projectId: string, entries: any[], branchName: string, resetRemote?: boolean) => Promise<{ success: boolean; results?: any[]; error?: string }>
    deleteRemoteProject: (url: string, projectId: string) => Promise<{ success: boolean; error?: string }>
    getRbacUsers: (url: string, projectId: string) => Promise<{ success: boolean; users?: any[]; error?: string }>
    updateRbacUser: (url: string, user: { id: string, email: string, allowedFolders: any, allowedEnvironments: any, role: string }) => Promise<{ success: boolean; error?: string }>
    deleteRbacUser: (url: string, userId: string) => Promise<{ success: boolean; error?: string }>
    fetchSyncQueue: (url: string, projectId: string, branchName: string) => Promise<{ success: boolean; items?: any[]; error?: string }>
    updateSyncQueueStatus: (url: string, projectId: string, ids: string[]) => Promise<{ success: boolean; error?: string }>
    fetchRemoteData: (url: string, projectId: string, branchName?: string) => Promise<{ success: boolean; folders: any[]; apis: any[]; environments?: any[]; error?: string }>
    fetchRemoteEntity: (url: string, tableName: string, entityId: string, branchName: string) => Promise<{ success: boolean; data?: any; error?: string }>
    getRemoteProjects: (url: string) => Promise<{ success: boolean; projects?: any[]; error?: string }>
    // Deployment
    deployToVercel: (params: { databaseUrl: string, adminToken?: string, projectId: string, projectName: string }) => Promise<{ success: boolean; url?: string; error?: string }>
    deleteVercelProject: (params: { projectId: string, projectName: string }) => Promise<{ success: boolean; error?: string }>
    onDeployOutput: (callback: (data: string) => void) => () => void
    restartApp: () => Promise<void>
    // Updates
    onUpdateStatus: (callback: (status: string, version?: string) => void) => () => void
    onUpdateProgress: (callback: (percent: number) => void) => () => void
    // Platform info
    platform: string
    // Document Generation
    exportPdf: (html: string, fileName: string) => Promise<void>
    generateDocPdf: (markdown: string, fileName: string) => Promise<{ success: boolean; error?: string }>
    previewDocPdf: (markdown: string) => Promise<{ success: boolean; data?: Uint8Array; error?: string }>
    // Cookies
    getAllCookies: () => Promise<Record<string, any[]>>
    setCookieManually: (domain: string, cookie: { name: string, value: string, path?: string }) => Promise<void>
    deleteCookie: (url: string, name: string) => Promise<void>
    clearDomainCookies: (domain: string) => Promise<void>
    clearAllCookies: () => Promise<void>
    getCookieWhitelist: () => Promise<string[]>
    addToWhitelist: (domain: string) => Promise<void>
    removeFromWhitelist: (domain: string) => Promise<void>
    updateCookieRaw: (domain: string, rawString: string, oldName?: string) => Promise<void>
    // File System
    initProjectDirectory: (dirPath: string, projectData: any) => Promise<{ success: boolean; error?: string }>
    writeProjectMeta: (dirPath: string, projectData: any) => Promise<{ success: boolean; error?: string }>
    writeProjectSecrets: (dirPath: string, secrets: any) => Promise<{ success: boolean; error?: string }>
    readProjectSecrets: (dirPath: string) => Promise<{ success: boolean; secrets?: any; error?: string }>
    readSyncMeta: (dirPath: string) => Promise<{ success: boolean; data?: any; error?: string }>
    writeSyncMeta: (dirPath: string, data: any) => Promise<{ success: boolean; error?: string }>
    writeFolderMeta: (dirPath: string, folderData: any) => Promise<{ success: boolean; folderDirName?: string; error?: string }>
    renameFolderDir: (dirPath: string, folderId: string, newName: string) => Promise<{ success: boolean; newDirName?: string; error?: string }>
    deleteFolderDir: (dirPath: string, folderId: string) => Promise<{ success: boolean; error?: string }>
    writeApiFile: (dirPath: string, folderId: string, apiData: any) => Promise<{ success: boolean; fileName?: string; error?: string }>
    deleteApiFile: (dirPath: string, folderId: string, apiId: string) => Promise<{ success: boolean; error?: string }>
    writeEnvironmentFile: (dirPath: string, envData: any) => Promise<{ success: boolean; fileName?: string; error?: string }>
    deleteEnvironmentFile: (dirPath: string, envId: string) => Promise<{ success: boolean; error?: string }>
    readProjectFromDisk: (dirPath: string) => Promise<{ success: boolean; project?: any; secrets?: any; folders?: any[]; apis?: any[]; environments?: any[]; error?: string }>
    writeFullProjectToDisk: (dirPath: string, data: any) => Promise<{ success: boolean; error?: string }>
    getRecentProjects: () => Promise<any[]>
    addRecentProject: (project: { id: string; name: string; localPath: string }) => Promise<{ success: boolean }>
    removeRecentProject: (projectId: string) => Promise<{ success: boolean }>
    openInExplorer: (dirPath: string) => Promise<{ success: boolean }>
    startFileWatcher: (dirPath: string) => Promise<{ success: boolean }>
    stopFileWatcher: () => Promise<{ success: boolean }>
    onProjectFilesChanged: (callback: (data: { dirPath: string }) => void) => () => void

    // Git
    gitStatus: (dirPath: string) => Promise<{ success: boolean; status?: any; error?: string }>
    gitAdd: (dirPath: string, filePaths: string | string[]) => Promise<{ success: boolean; error?: string }>
    gitUnstage: (dirPath: string, filePaths: string | string[]) => Promise<{ success: boolean; error?: string }>
    gitCommit: (dirPath: string, message: string, proxyUrl?: string, proxyToken?: string, branchName?: string) => Promise<{ success: boolean; committedIds?: string[]; commitHash?: string; syncQueueQuery?: any[] | null; error?: string }>
    gitDiscard: (dirPath: string, filePaths: string | string[]) => Promise<{ success: boolean; error?: string }>
    gitBranches: (dirPath: string) => Promise<{ success: boolean; branches?: any; error?: string }>
    gitCheckoutBranch: (dirPath: string, branchName: string) => Promise<{ success: boolean; error?: string }>
    gitCreateBranch: (dirPath: string, branchName: string) => Promise<{ success: boolean; error?: string }>
    gitLogs: (dirPath: string) => Promise<{ success: boolean; logs?: any; error?: string }>
}

const electronAPI: ElectronAPI = {
    minimize: () => ipcRenderer.send('window-minimize'),
    maximize: () => ipcRenderer.send('window-maximize'),
    close: () => ipcRenderer.send('window-close'),
    isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
    saveFile: (filePath, data) => ipcRenderer.invoke('save-file', filePath, data),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    selectFiles: () => ipcRenderer.invoke('select-files'),
    getAppPath: () => ipcRenderer.invoke('get-app-path'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    sendHttpRequest: (opts) => ipcRenderer.invoke('send-http-request', opts),
    testDbConnection: (url) => ipcRenderer.invoke('test-db-connection', url),
    createRemoteTables: (url) => ipcRenderer.invoke('create-remote-tables', url),
    createRbacUser: (url, user) => ipcRenderer.invoke('create-rbac-user', url, user),
    syncDirect: (url, projectId, entries, branchName, resetRemote) => ipcRenderer.invoke('sync-direct', url, projectId, entries, branchName, resetRemote),
    deleteRemoteProject: (url, projectId) => ipcRenderer.invoke('delete-remote-project', url, projectId),
    getRbacUsers: (url, projectId) => ipcRenderer.invoke('get-rbac-users', url, projectId),
    updateRbacUser: (url, user) => ipcRenderer.invoke('update-rbac-user', url, user),
    deleteRbacUser: (url, userId) => ipcRenderer.invoke('delete-rbac-user', url, userId),
    fetchSyncQueue: (url, projectId, branchName) => ipcRenderer.invoke('fetch-sync-queue', url, projectId, branchName),
    updateSyncQueueStatus: (url, projectId, ids) => ipcRenderer.invoke('update-sync-queue-status', url, projectId, ids),
    fetchRemoteData: (url, projectId, branchName) => ipcRenderer.invoke('fetch-remote-data', url, projectId, branchName),
    fetchRemoteEntity: (url, tableName, entityId, branchName) => ipcRenderer.invoke('fetch-remote-entity', url, tableName, entityId, branchName),
    getRemoteProjects: (url) => ipcRenderer.invoke('get-remote-projects', url),
    // Deployment
    deployToVercel: (params) => ipcRenderer.invoke('deploy-to-vercel', params),
    deleteVercelProject: (params) => ipcRenderer.invoke('delete-vercel-project', params),
    restartApp: () => ipcRenderer.invoke('restart-app'),
    onDeployOutput: (callback) => {
        const subscription = (_event: any, data: string) => callback(data)
        ipcRenderer.on('deploy-output', subscription)
        return () => ipcRenderer.removeListener('deploy-output', subscription)
    },
    onUpdateStatus: (callback) => {
        const subscription = (_event: any, status: string, version?: string) => callback(status, version)
        ipcRenderer.on('update-status', subscription)
        return () => ipcRenderer.removeListener('update-status', subscription)
    },
    onUpdateProgress: (callback) => {
        const subscription = (_event: any, percent: number) => callback(percent)
        ipcRenderer.on('update-progress', subscription)
        return () => ipcRenderer.removeListener('update-progress', subscription)
    },
    platform: process.platform,
    exportPdf: (html, fileName) => ipcRenderer.invoke('export-pdf', html, fileName),
    generateDocPdf: (markdown, fileName) => ipcRenderer.invoke('generate-doc-pdf', markdown, fileName),
    previewDocPdf: (markdown) => ipcRenderer.invoke('preview-doc-pdf', markdown),
    // Cookies
    getAllCookies: () => ipcRenderer.invoke('get-all-cookies'),
    setCookieManually: (domain, cookie) => ipcRenderer.invoke('set-cookie-manually', domain, cookie),
    deleteCookie: (url, name) => ipcRenderer.invoke('delete-cookie', url, name),
    clearDomainCookies: (domain) => ipcRenderer.invoke('clear-domain-cookies', domain),
    clearAllCookies: () => ipcRenderer.invoke('clear-all-cookies'),
    getCookieWhitelist: () => ipcRenderer.invoke('get-cookie-whitelist'),
    addToWhitelist: (domain) => ipcRenderer.invoke('add-to-whitelist', domain),
    removeFromWhitelist: (domain) => ipcRenderer.invoke('remove-from-whitelist', domain),
    updateCookieRaw: (domain, rawString, oldName) => ipcRenderer.invoke('update-cookie-raw', domain, rawString, oldName),
    // File System
    initProjectDirectory: (dirPath, projectData) => ipcRenderer.invoke('init-project-directory', dirPath, projectData),
    writeProjectMeta: (dirPath, projectData) => ipcRenderer.invoke('write-project-meta', dirPath, projectData),
    writeProjectSecrets: (dirPath, secrets) => ipcRenderer.invoke('write-project-secrets', dirPath, secrets),
    readProjectSecrets: (dirPath) => ipcRenderer.invoke('read-project-secrets', dirPath),
    readSyncMeta: (dirPath) => ipcRenderer.invoke('read-sync-meta', dirPath),
    writeSyncMeta: (dirPath, data) => ipcRenderer.invoke('write-sync-meta', dirPath, data),
    writeFolderMeta: (dirPath, folderData) => ipcRenderer.invoke('write-folder-meta', dirPath, folderData),
    renameFolderDir: (dirPath, folderId, newName) => ipcRenderer.invoke('rename-folder-dir', dirPath, folderId, newName),
    deleteFolderDir: (dirPath, folderId) => ipcRenderer.invoke('delete-folder-dir', dirPath, folderId),
    writeApiFile: (dirPath, folderId, apiData) => ipcRenderer.invoke('write-api-file', dirPath, folderId, apiData),
    deleteApiFile: (dirPath, folderId, apiId) => ipcRenderer.invoke('delete-api-file', dirPath, folderId, apiId),
    writeEnvironmentFile: (dirPath, envData) => ipcRenderer.invoke('write-environment-file', dirPath, envData),
    deleteEnvironmentFile: (dirPath, envId) => ipcRenderer.invoke('delete-environment-file', dirPath, envId),
    readProjectFromDisk: (dirPath) => ipcRenderer.invoke('read-project-from-disk', dirPath),
    writeFullProjectToDisk: (dirPath, data) => ipcRenderer.invoke('write-full-project-to-disk', dirPath, data),
    getRecentProjects: () => ipcRenderer.invoke('get-recent-projects'),
    addRecentProject: (project) => ipcRenderer.invoke('add-recent-project', project),
    removeRecentProject: (projectId) => ipcRenderer.invoke('remove-recent-project', projectId),
    openInExplorer: (dirPath) => ipcRenderer.invoke('open-in-explorer', dirPath),
    startFileWatcher: (dirPath) => ipcRenderer.invoke('start-file-watcher', dirPath),
    stopFileWatcher: () => ipcRenderer.invoke('stop-file-watcher'),
    onProjectFilesChanged: (callback) => {
        const handler = (_event: any, data: { dirPath: string }) => callback(data)
        ipcRenderer.on('project-files-changed', handler)
        return () => ipcRenderer.removeListener('project-files-changed', handler)
    },

    gitStatus: (dirPath) => ipcRenderer.invoke('git-status', dirPath),
    gitAdd: (dirPath, filePaths) => ipcRenderer.invoke('git-add', dirPath, filePaths),
    gitUnstage: (dirPath, filePaths) => ipcRenderer.invoke('git-unstage', dirPath, filePaths),
    gitCommit: (dirPath, message, proxyUrl, proxyToken, branchName) => ipcRenderer.invoke('git-commit', dirPath, message, proxyUrl, proxyToken, branchName),
    gitDiscard: (dirPath, filePaths) => ipcRenderer.invoke('git-discard', dirPath, filePaths),
    gitBranches: (dirPath) => ipcRenderer.invoke('git-branches', dirPath),
    gitCheckoutBranch: (dirPath, branchName) => ipcRenderer.invoke('git-checkout-branch', dirPath, branchName),
    gitCreateBranch: (dirPath, branchName) => ipcRenderer.invoke('git-create-branch', dirPath, branchName),
    gitLogs: (dirPath) => ipcRenderer.invoke('git-logs', dirPath)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

