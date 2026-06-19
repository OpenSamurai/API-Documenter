import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAppStore } from '@/stores/appStore'
import { useSync } from '@/hooks/useSync'
import { db } from '@/db'
import { useProject, useRemoteProjectMetadata, triggerFullProjectSync } from '@/hooks/useProjects'
import { useQueryClient } from '@tanstack/react-query'

export function ActivityBar() {
    const qc = useQueryClient()
    const { 
        activeSidebarTab, setActiveSidebarTab, 
        setShowDatabaseSettings, setShowRbacSettings, setShowDeploySettings, setShowGeneralSettings, openDocsTab,
        currentProjectId, activeBranch, currentSyncBranch, isSyncing, databaseUrl,
        isTeamWorkspace
    } = useAppStore()
    const { syncNow } = useSync()
    const { data: project } = useProject(currentProjectId)
    const { data: remoteProject } = useRemoteProjectMetadata(currentProjectId, project?.databaseUrl || null)
    const isBranchSynced = remoteProject?.syncedBranches?.includes(activeBranch || '')

    // Reactive pending sync items count via useLiveQuery
    const pendingCount = useLiveQuery(
        async () => {
            if (!currentProjectId) return 0
            return db.syncQueue
                .where('projectId')
                .equals(currentProjectId)
                .and(item => item.status === 'pending' && (!activeBranch || item.branch === activeBranch))
                .count()
        },
        [currentProjectId, activeBranch],
        0
    )

    return (
        <div style={{
            width: '48px', height: '100%', background: '#050505',
            borderRight: '1px solid #1A1A1A', display: 'flex', flexDirection: 'column',
            justifyContent: 'space-between', paddingTop: '16px', paddingBottom: '16px'
        }}>
            {/* Top Navigation */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                <ActivityItem 
                    icon="folder" 
                    isActive={activeSidebarTab === 'explorer'} 
                    onClick={() => setActiveSidebarTab('explorer')} 
                    title="Explorer"
                />
                {!isTeamWorkspace && (
                    <ActivityItem 
                        icon="git" 
                        isActive={activeSidebarTab === 'git'} 
                        onClick={() => setActiveSidebarTab('git')} 
                        title="Version Control"
                    />
                )}
            </div>

            {/* Middle Project Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                {currentProjectId && !isTeamWorkspace && (
                    <>
                        <ActivityItem 
                            icon="document" 
                            isActive={false} 
                            onClick={() => openDocsTab()} 
                            title="Generate API Docs"
                        />
                        <ActivityItem 
                            icon="database" 
                            isActive={false} 
                            onClick={() => setShowDatabaseSettings(true)} 
                            title="Database Settings"
                        />
                        {activeBranch === currentSyncBranch && (
                            <ActivityItem 
                                icon="users" 
                                isActive={false} 
                                onClick={() => setShowRbacSettings(true)} 
                                title="Team & Permissions (RBAC)"
                            />
                        )}
                        <ActivityItem 
                            icon="deploy" 
                            isActive={false} 
                            onClick={() => setShowDeploySettings(true)} 
                            title="Deploy Proxy"
                        />
                        <ActivityItem 
                            icon="settings" 
                            isActive={false} 
                            onClick={() => setShowGeneralSettings(true)} 
                            title="Project Settings"
                        />
                        {project?.localPath && (
                            <ActivityItem 
                                icon="folderOpen" 
                                isActive={false} 
                                onClick={() => (window as any).electronAPI.openInExplorer(project.localPath)} 
                                title="Open in Explorer"
                            />
                        )}
                    </>
                )}
            </div>

            {/* Bottom Status Section */}
            <div style={{ 
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px',
                paddingBottom: '8px'
            }}>
                {currentProjectId && activeBranch && !isTeamWorkspace && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                        {/* Sync Branch Button (If not the connected sync branch) */}
                        {activeBranch !== currentSyncBranch && !isSyncing && databaseUrl && (
                            <div 
                                onClick={() => {
                                    console.log('[ActivityBar] Triggering Direct Sync for Branch:', activeBranch)
                                    triggerFullProjectSync(qc, project, activeBranch!)
                                }}
                                title={`This branch is not connected to the database. Click to Push & Sync "${activeBranch}".`}
                                style={{
                                    cursor: 'pointer',
                                    color: '#F97316', // Orange for Attention
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    padding: '4px', background: 'rgba(249, 115, 22, 0.1)', borderRadius: '6px'
                                }}
                                className="hover:scale-110 active:scale-95 animate-pulse"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                            </div>
                        )}

                        {/* Sync Button / Loader */}
                        {databaseUrl && (
                            <div 
                                onClick={() => syncNow(true)}
                                title={isSyncing ? "Syncing..." : pendingCount > 0 ? `${pendingCount} pending changes` : "Stay in Sync"}
                                style={{
                                    cursor: isSyncing ? 'default' : 'pointer',
                                    color: isSyncing ? '#3B82F6' : pendingCount > 0 ? '#FBBF24' : '#10B981',
                                    transition: 'all 200ms ease',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                                className={isSyncing ? 'animate-spin' : 'hover:scale-110 active:scale-95'}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                                </svg>
                            </div>
                        )}

                        {/* Branch Indicator & Name */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                             <div 
                                title={`Active Branch: ${activeBranch}`}
                                style={{
                                    width: '32px', height: '32px', borderRadius: '8px', 
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid #1A1A1A',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    position: 'relative'
                                }}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="18" cy="18" r="3"></circle>
                                    <circle cx="6" cy="6" r="3"></circle>
                                    <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
                                    <line x1="6" y1="9" x2="6" y2="21"></line>
                                </svg>
                                {/* Sync Dot Status */}
                                <div style={{
                                    position: 'absolute', bottom: '-2px', right: '-2px',
                                    width: '8px', height: '8px', borderRadius: '50%', border: '2px solid #050505',
                                    background: !isBranchSynced ? '#F97316' : (pendingCount > 0 ? '#FBBF24' : '#10B981')
                                }} />
                            </div>
                            
                            {/* Branch Name Label */}
                            <span style={{ 
                                fontSize: '9px', fontWeight: 700, color: '#4B5563', 
                                writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                                textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0'
                            }}>
                                {activeBranch}
                            </span>
                        </div>
                    </div>
                )}
                
                {/* Visual Spacer */}
                <div style={{ 
                    width: '24px', height: '1px', background: 'rgba(255,255,255,0.05)', 
                    margin: '4px 0' 
                }} />
            </div>
        </div>
    )
}

function ActivityItem({ icon, isActive, onClick, title }: { icon: string, isActive: boolean, onClick: () => void, title?: string }) {
    return (
        <div onClick={onClick} className="group relative" title={title} style={{
            width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: isActive ? '#FFFFFF' : '#6B7280', transition: '150ms ease'
        }}>
            {/* Active Indication Left Border */}
            {isActive && (
                <div style={{ position: 'absolute', left: 0, top: '4px', bottom: '4px', width: '2px', background: '#3B82F6', borderRadius: '0 2px 2px 0' }} />
            )}

            <div style={{ transition: 'color 150ms ease', color: isActive ? '#FFFFFF' : '#4B5563' }}
                onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'}
                onMouseLeave={e => e.currentTarget.style.color = isActive ? '#FFFFFF' : '#4B5563'}>
                {icon === 'folder' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                ) : icon === 'git' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="18" r="3"></circle>
                        <circle cx="6" cy="6" r="3"></circle>
                        <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
                        <line x1="6" y1="9" x2="6" y2="21"></line>
                    </svg>
                ) : icon === 'users' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                ) : icon === 'deploy' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                ) : icon === 'document' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                ) : icon === 'settings' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle>
                    </svg>
                ) : icon === 'folderOpen' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path><path d="M2 10h20"></path>
                    </svg>
                ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />
                    </svg>
                )}
            </div>
        </div>
    )
}
