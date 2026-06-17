import { useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useProjects } from '@/hooks/useProjects'
import { useSync } from '@/hooks/useSync'
import { useProjectFilesWatcher } from '@/hooks/useFileWatcher'
import { Titlebar } from './components/Titlebar'
import { ActivityBar } from './components/ActivityBar'
import { Sidebar } from './components/Sidebar'
import { GitSidebar } from './components/GitSidebar'
import { RequestEditor } from './components/RequestEditor'
import { EmptyState } from './components/EmptyState'
import { CreateProjectDialog } from './components/CreateProjectDialog'
import { CreateFolderDialog } from './components/CreateFolderDialog'
import { CreateApiDialog } from './components/CreateApiDialog'
import { TeamConnectDialog } from './components/TeamConnectDialog'
import { DatabaseSettingsDialog } from './components/DatabaseSettingsDialog'
import { RbacSettingsDialog } from './components/RbacSettingsDialog'
import { DeployProxyDialog } from './components/DeployProxyDialog'
import { GeneralSettingsDialog } from './components/GeneralSettingsDialog'
import { EnvironmentsDialog } from './components/EnvironmentsDialog'
import { UpdaterNotifier } from './components/UpdaterNotifier'
import { StatusBar } from './components/StatusBar'
import { CookieManagerDialog } from './components/CookieManagerDialog'
import { GlobalGitManager } from './components/GlobalGitManager'
import { ApiDocumentationPage } from './components/ApiDocumentationPage'
import { ConflictResolutionDialog } from './components/ConflictResolutionDialog'

export function App() {
    const currentApiId = useAppStore(s => s.currentApiId)
    const currentProjectId = useAppStore(s => s.currentProjectId)
    const isOnline = useAppStore(s => s.isOnline)
    const setIsOnline = useAppStore(s => s.setIsOnline)
    const showCreateProject = useAppStore(s => s.showCreateProject)
    const showCreateFolder = useAppStore(s => s.showCreateFolder)
    const showCreateApi = useAppStore(s => s.showCreateApi)
    const showTeamConnect = useAppStore(s => s.showTeamConnect)
    const showDatabaseSettings = useAppStore(s => s.showDatabaseSettings)
    const showRbacSettings = useAppStore(s => s.showRbacSettings)
    const showDeploySettings = useAppStore(s => s.showDeploySettings)
    const showGeneralSettings = useAppStore(s => s.showGeneralSettings)
    const showApiDocumentation = useAppStore(s => s.showApiDocumentation)
    const showCookieManager = useAppStore(s => s.showCookieManager)
    const setShowCookieManager = useAppStore(s => s.setShowCookieManager)
    const activeSidebarTab = useAppStore(s => s.activeSidebarTab)
    const proxyConnection = useAppStore(s => s.proxyConnection)
    const isSyncing = useAppStore(s => s.isSyncing)
    const setIsSyncing = useAppStore(s => s.setIsSyncing)
    const syncConflicts = useAppStore(s => s.syncConflicts)
    const setSyncConflicts = useAppStore(s => s.setSyncConflicts)
    const { data: projects } = useProjects()

    useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
        }
    }, [setIsOnline])

    useProjectFilesWatcher(currentProjectId)

    const { syncNow } = useSync()

    const hasProject = (projects?.length ?? 0) > 0

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg-app)' }}>
            {/* Git Manager */}
            <GlobalGitManager />

            {/* Titlebar */}
            <Titlebar isOnline={isOnline} />

            {/* Main content below titlebar */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', marginTop: 'var(--topbar-h)' }}>
                {/* Activity Bar */}
                <ActivityBar />

                {/* Sidebar */}
                {activeSidebarTab === 'explorer' ? <Sidebar /> : <GitSidebar />}

                {/* Editor area */}
                <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                    {showApiDocumentation ? (
                        <ApiDocumentationPage />
                    ) : currentApiId ? (
                        <RequestEditor apiId={currentApiId} />
                    ) : (
                        <EmptyState hasProject={hasProject && !!currentProjectId} />
                    )}
                </main>
            </div>

            {/* Global Status Bar */}
            <StatusBar />

            {/* Global Cookie Manager */}
            <CookieManagerDialog isOpen={showCookieManager} onClose={() => setShowCookieManager(false)} />

            {/* Global Sync Overlay */}
            {isSyncing && (
                <div className="fade-in" style={{
                    position: 'fixed', inset: 0, zIndex: 5000,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: '#0A0A0A99', backdropFilter: 'blur(8px)', gap: '24px'
                }}>
                    <div className="border-4 border-white/10 border-t-white rounded-full animate-spin" style={{ width: '40px', height: '40px' }} />
                    <div style={{ textAlign: 'center' }}>
                        <h3 style={{ margin: 0, color: 'white', fontSize: '18px', fontWeight: 600 }}>Refreshing Workspace...</h3>
                        <p style={{ margin: '8px 0 0', color: '#666', fontSize: '13px' }}>Fetching the latest data from the team server</p>
                    </div>
                </div>
            )}

            {/* Dialogs */}
            {showCreateProject && <CreateProjectDialog />}
            {showCreateFolder && <CreateFolderDialog />}
            {showCreateApi && <CreateApiDialog />}
            {showTeamConnect && <TeamConnectDialog />}
            {showDatabaseSettings && <DatabaseSettingsDialog />}
            {showRbacSettings && <RbacSettingsDialog />}
            {showDeploySettings && <DeployProxyDialog />}
            {showGeneralSettings && <GeneralSettingsDialog />}
            <EnvironmentsDialog />

            {/* Conflict Resolution */}
            {syncConflicts.length > 0 && currentProjectId && (
                <ConflictResolutionDialog 
                    conflicts={syncConflicts} 
                    projectId={currentProjectId}
                    onResolved={async () => {
                        setSyncConflicts([])
                        // Push resolved items (now status='pending'), then pull fresh data
                        await syncNow(false)
                        await syncNow(true)
                    }}
                    onClose={() => setSyncConflicts([])}
                />
            )}

            {/* Auto-Updater Visual Layer */}
            <UpdaterNotifier />
        </div>
    )
}