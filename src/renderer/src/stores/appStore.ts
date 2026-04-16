import { create } from 'zustand'
import type { EditorTab, ProxyConnection, Environment } from '@/types'

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
    isSyncing: boolean

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

    // Proxy state
    proxyConnection: ProxyConnection | null

    // Environment store
    environments: Environment[]

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
}

export const useAppStore = create<AppState>((set) => ({
    currentProjectId: null,
    currentFolderId: null,
    currentApiId: null,

    isOnline: navigator.onLine,
    sidebarWidth: 300,
    activeEditorTab: 'params',
    isSidebarCollapsed: false,

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
}))
