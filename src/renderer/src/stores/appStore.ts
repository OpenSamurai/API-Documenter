import { create } from 'zustand'
import type { EditorTab, ProxyConnection, Environment, ConflictDetail } from '@/types'

export interface OpenTab {
    id: string
    type: 'api' | 'docs'
    apiId?: string
}

interface AppState {
    // Selection state
    currentProjectId: string | null
    currentFolderId: string | null
    currentApiId: string | null
    currentEnvironmentId: string | null

    // UI state
    openTabs: OpenTab[]
    activeTabId: string | null
    isOnline: boolean
    sidebarWidth: number
    activeEditorTab: EditorTab
    isSidebarCollapsed: boolean
    activeSidebarTab: 'explorer' | 'git'
    isSyncing: boolean
    activeBranch: string | null
    currentSyncBranch: string | null
    databaseUrl: string | null

    // Dialog state
    showCreateProject: boolean
    showCreateFolder: boolean
    showCreateApi: boolean
    showDatabaseSettings: boolean
    showRbacSettings: boolean
    showDeploySettings: boolean
    showGeneralSettings: boolean
    showTeamConnect: boolean
    showEnvironmentsDialog: boolean
    showApiDocumentation: boolean
    showCookieManager: boolean
    editingFolderId: string | null

    // Team Workspace Mode
    isTeamWorkspace: boolean
    teamConfig: { url: string; token: string; projectId: string } | null

    // Environment store
    environments: Environment[]

    // Git state
    gitStatus: any | null
    gitBranches: any | null
    gitLogs: any[]
    lastCommitHash: string | null
    syncConflicts: ConflictDetail[]

    // Actions
    scrollApi: (apiId: string | null, folderId?: string) => void
    selectProject: (id: string | null) => void
    selectFolder: (id: string | null) => void
    selectApi: (apiId: string | null, folderId?: string) => void
    openDocsTab: () => void
    closeTab: (tabId: string) => void
    setActiveTab: (tabId: string) => void
    validateTabs: (validApiIds: string[]) => void
    selectEnvironment: (id: string | null) => void
    setEnvironments: (envs: Environment[]) => void
    setIsOnline: (online: boolean) => void
    setSidebarWidth: (width: number) => void
    setShowEnvironmentsDialog: (show: boolean) => void
    setActiveEditorTab: (tab: EditorTab) => void
    toggleSidebar: () => void
    setActiveSidebarTab: (tab: 'explorer' | 'git') => void
    setActiveBranch: (branch: string | null) => void
    setCurrentSyncBranch: (branch: string | null) => void
    setDatabaseUrl: (url: string | null) => void
    setShowCreateProject: (show: boolean) => void
    setShowCreateFolder: (show: boolean) => void
    setShowCreateApi: (show: boolean) => void
    setShowDatabaseSettings: (show: boolean) => void
    setShowRbacSettings: (show: boolean) => void
    setShowDeploySettings: (show: boolean) => void
    setShowGeneralSettings: (show: boolean) => void
    setShowTeamConnect: (show: boolean) => void
    setShowApiDocumentation: (show: boolean) => void
    setShowCookieManager: (show: boolean) => void
    setEditingFolderId: (id: string | null) => void
    setProxyConnection: (conn: ProxyConnection | null) => void
    setIsSyncing: (isSyncing: boolean) => void
    setTeamWorkspace: (isTeam: boolean, config?: { url: string; token: string; projectId: string } | null) => void
    setGitState: (status: any, branches: any, logs: any[]) => void
    setLastCommitHash: (hash: string) => void
    setSyncConflicts: (conflicts: ConflictDetail[]) => void
    setApiDraft: (apiId: string, draft: any) => void
    clearApiDraft: (apiId: string) => void
    setActiveApiUnsaved: (unsaved: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
    currentProjectId: null,
    currentFolderId: null,
    currentApiId: null,

    openTabs: [],
    activeTabId: null,

    isOnline: navigator.onLine,
    sidebarWidth: 300,
    activeEditorTab: 'params',
    isSidebarCollapsed: false,
    activeSidebarTab: 'explorer',
    activeBranch: null,
    currentSyncBranch: null,
    databaseUrl: null,

    showCreateProject: false,
    showCreateFolder: false,
    showCreateApi: false,
    showDatabaseSettings: false,
    showRbacSettings: false,
    showDeploySettings: false,
    showGeneralSettings: false,
    showTeamConnect: false,
    showEnvironmentsDialog: false,
    showApiDocumentation: false,
    showCookieManager: false,
    editingFolderId: null,
    isSyncing: false,
    proxyConnection: null,
    isTeamWorkspace: false,
    teamConfig: null,

    environments: [],
    currentEnvironmentId: null,

    gitStatus: null,
    gitBranches: null,
    gitLogs: [],
    lastCommitHash: null,
    syncConflicts: [],
    apiDrafts: {},
    activeApiUnsaved: false,

    selectProject: (id) => set({ currentProjectId: id, currentFolderId: null, currentApiId: null, showApiDocumentation: false, openTabs: [], activeTabId: null }),
    selectFolder: (id) => set({ currentFolderId: id }),
    selectApi: (apiId: string | null, folderId?: string) => set((s) => {
        if (!apiId) return { currentApiId: null, currentFolderId: folderId ?? s.currentFolderId, activeApiUnsaved: false }
        const existingTab = s.openTabs.find(t => t.id === `api-${apiId}`)
        const newTabs = existingTab ? s.openTabs : [...s.openTabs, { id: `api-${apiId}`, type: 'api', apiId }]
        return {
            currentApiId: apiId,
            currentFolderId: folderId ?? s.currentFolderId,
            activeApiUnsaved: false,
            openTabs: newTabs,
            activeTabId: `api-${apiId}`,
            showApiDocumentation: false
        }
    }),
    scrollApi: (apiId: string | null, folderId?: string) => set((s) => ({
        currentApiId: apiId,
        currentFolderId: folderId ?? s.currentFolderId
    })),
    openDocsTab: () => set((s) => {
        const existingTab = s.openTabs.find(t => t.id === 'docs')
        const newTabs = existingTab ? s.openTabs : [...s.openTabs, { id: 'docs', type: 'docs' }]
        return { openTabs: newTabs, activeTabId: 'docs', showApiDocumentation: true }
    }),
    closeTab: (tabId) => set((s) => {
        const newTabs = s.openTabs.filter(t => t.id !== tabId)
        if (s.activeTabId === tabId) {
            const index = s.openTabs.findIndex(t => t.id === tabId)
            const nextTab = newTabs[Math.min(index, newTabs.length - 1)]
            if (nextTab) {
                if (nextTab.type === 'docs') return { openTabs: newTabs, activeTabId: nextTab.id, showApiDocumentation: true }
                return { openTabs: newTabs, activeTabId: nextTab.id, currentApiId: nextTab.apiId || null, showApiDocumentation: false }
            } else {
                return { openTabs: [], activeTabId: null, currentApiId: null, showApiDocumentation: false }
            }
        }
        return { openTabs: newTabs }
    }),
    setActiveTab: (tabId) => set((s) => {
        const tab = s.openTabs.find(t => t.id === tabId)
        if (!tab) return s
        if (tab.type === 'docs') return { activeTabId: tabId, showApiDocumentation: true }
        return { activeTabId: tabId, currentApiId: tab.apiId || null, showApiDocumentation: false }
    }),
    validateTabs: (validApiIds) => set((s) => {
        const invalidTabs = s.openTabs.filter(t => t.type === 'api' && t.apiId && !validApiIds.includes(t.apiId))
        if (invalidTabs.length === 0) return s
        
        const newTabs = s.openTabs.filter(t => t.type === 'docs' || (t.type === 'api' && t.apiId && validApiIds.includes(t.apiId)))
        let newState: Partial<AppState> = { openTabs: newTabs }
        
        if (invalidTabs.some(t => t.id === s.activeTabId)) {
            const nextTab = newTabs[newTabs.length - 1]
            if (nextTab) {
                newState.activeTabId = nextTab.id
                if (nextTab.type === 'docs') {
                    newState.showApiDocumentation = true
                } else {
                    newState.currentApiId = nextTab.apiId
                    newState.showApiDocumentation = false
                }
            } else {
                newState.activeTabId = null
                newState.currentApiId = null
                newState.showApiDocumentation = false
            }
        }
        return newState
    }),
    selectEnvironment: (id) => set({ currentEnvironmentId: id }),
    setEnvironments: (envs) => set({ environments: envs }),

    setIsOnline: (online) => set({ isOnline: online }),
    setSidebarWidth: (width) => set({ sidebarWidth: width }),
    setShowEnvironmentsDialog: (show) => set({ showEnvironmentsDialog: show }),
    setActiveEditorTab: (tab) => set({ activeEditorTab: tab }),
    toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
    setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),
    setActiveBranch: (branch) => set({ activeBranch: branch }),
    setCurrentSyncBranch: (branch) => set({ currentSyncBranch: branch }),
    setDatabaseUrl: (url) => set({ databaseUrl: url }),
    setShowCreateProject: (show) => set({ showCreateProject: show }),
    setShowCreateFolder: (show) => set({ showCreateFolder: show }),
    setShowCreateApi: (show) => set({ showCreateApi: show }),
    setShowDatabaseSettings: (show) => set({ showDatabaseSettings: show }),
    setShowRbacSettings: (show) => set({ showRbacSettings: show }),
    setShowDeploySettings: (show) => set({ showDeploySettings: show }),
    setShowGeneralSettings: (show) => set({ showGeneralSettings: show }),
    setShowTeamConnect: (show) => set({ showTeamConnect: show }),
    setShowApiDocumentation: (show) => set({ showApiDocumentation: show }),
    setShowCookieManager: (show) => set({ showCookieManager: show }),
    setEditingFolderId: (id) => set({ editingFolderId: id }),
    setProxyConnection: (conn) => set({ proxyConnection: conn }),
    setIsSyncing: (isSyncing) => set({ isSyncing }),
    setTeamWorkspace: (isTeam, config) => set({
        isTeamWorkspace: isTeam,
        teamConfig: config || null,
        currentProjectId: config?.projectId || null,
        currentFolderId: null,
        currentApiId: null,
        showApiDocumentation: false
    }),
    setGitState: (status, branches, logs) => set({ gitStatus: status, gitBranches: branches, gitLogs: logs }),
    setLastCommitHash: (hash) => set({ lastCommitHash: hash }),
    setSyncConflicts: (conflicts) => set({ syncConflicts: conflicts }),
    setApiDraft: (apiId, draft) => set((s) => ({ apiDrafts: { ...s.apiDrafts, [apiId]: draft } })),
    clearApiDraft: (apiId) => set((s) => {
        const { [apiId]: _, ...rest } = s.apiDrafts
        return { apiDrafts: rest }
    }),
    setActiveApiUnsaved: (unsaved) => set({ activeApiUnsaved: unsaved }),
}))
