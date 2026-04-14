import { useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useProjects } from '@/hooks/useProjects'
import { useSync } from '@/hooks/useSync'
import { Titlebar } from './components/Titlebar'
import { Sidebar } from './components/Sidebar'
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
import { ApiDocumentationPage } from '@/components/ApiDocumentationPage'

export function App() {
    const {
        currentApiId, currentProjectId,
        isOnline, setIsOnline,
        showCreateProject, showCreateFolder, showCreateApi, showTeamConnect,
        showDatabaseSettings, showRbacSettings, showDeploySettings, showGeneralSettings,
        showApiDocumentation, showCookieManager, setShowCookieManager
    } = useAppStore()
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

    const { syncNow } = useSync()
    const { proxyConnection, isSyncing, setIsSyncing } = useAppStore()

    // ─── Blocking Initial Sync ───
    useEffect(() => {
        if (!currentProjectId || !isOnline) return
        const p = projects?.find(x => x.id === currentProjectId)
        const hasDirect = !!p?.databaseUrl
        const hasProxy = !!proxyConnection?.connected

        if (!hasDirect && !hasProxy) return

        const doInitialSync = async () => {
            console.log('[App] Starting initial blocking sync...')
            try {
                await syncNow()
            } catch (err) {
                console.error('[App] Initial sync failed:', err)
            } finally {
                console.log('[App] Initial blocking sync complete.')
            }
        }

        doInitialSync()
    }, [currentProjectId, isOnline, proxyConnection?.connected, !!projects])

    const hasProject = (projects?.length ?? 0) > 0

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', background: 'var(--bg-app)' }}>
            {/* Titlebar */}
            <Titlebar isOnline={isOnline} />

            {/* Main content below titlebar */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', marginTop: 'var(--topbar-h)' }}>
                {/* Sidebar */}
                <Sidebar />

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

            {/* Auto-Updater Visual Layer */}
            <UpdaterNotifier />
        </div>
    )
}