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
    syncDirect: (url: string, entries: any[]) => Promise<{ success: boolean; results?: any[]; error?: string }>
    deleteRemoteProject: (url: string, projectId: string) => Promise<{ success: boolean; error?: string }>
    getRbacUsers: (url: string, projectId: string) => Promise<{ success: boolean; users?: any[]; error?: string }>
    updateRbacUser: (url: string, user: { id: string, email: string, allowedFolders: any, allowedEnvironments: any, role: string }) => Promise<{ success: boolean; error?: string }>
    deleteRbacUser: (url: string, userId: string) => Promise<{ success: boolean; error?: string }>
    fetchRemoteData: (url: string, projectId: string) => Promise<{ success: boolean; folders: any[]; apis: any[]; error?: string }>
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
    syncDirect: (url, entries) => ipcRenderer.invoke('sync-direct', url, entries),
    deleteRemoteProject: (url, projectId) => ipcRenderer.invoke('delete-remote-project', url, projectId),
    getRbacUsers: (url, projectId) => ipcRenderer.invoke('get-rbac-users', url, projectId),
    updateRbacUser: (url, user) => ipcRenderer.invoke('update-rbac-user', url, user),
    deleteRbacUser: (url, userId) => ipcRenderer.invoke('delete-rbac-user', url, userId),
    fetchRemoteData: (url, projectId) => ipcRenderer.invoke('fetch-remote-data', url, projectId),
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
    updateCookieRaw: (domain, rawString, oldName) => ipcRenderer.invoke('update-cookie-raw', domain, rawString, oldName)
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

