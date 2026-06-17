import { create } from 'zustand'
import type { EditorTab, ProxyConnection, Environment, ConflictDetail } from '@/types'

interface AppState {
    // Selection state
    currentProjectId: string | null
    currentFolderId: string | null
    currentApiId: string | null
    currentEnvironmentId: string | null

    // UI state
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
}

export const useAppStore = create<AppState>((set) => ({
    currentProjectId: null,
    currentFolderId: null,
    currentApiId: null,

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

    selectProject: (id) => set({ currentProjectId: id, currentFolderId: null, currentApiId: null, showApiDocumentation: false }),
    selectFolder: (id) => set({ currentFolderId: id }),
    selectApi: (apiId: string | null, folderId?: string) => set((s) => ({
        currentApiId: apiId,
        currentFolderId: folderId ?? s.currentFolderId
    })),
    scrollApi: (apiId: string | null, folderId?: string) => set((s) => ({
        currentApiId: apiId,
        currentFolderId: folderId ?? s.currentFolderId
    })),
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
}))
