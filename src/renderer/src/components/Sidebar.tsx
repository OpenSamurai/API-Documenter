import { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useProjects, useSyncProject } from '@/hooks/useProjects'
import { useFolders, useDeleteFolder } from '@/hooks/useFolders'
import { useApis, useDeleteApi } from '@/hooks/useApis'
import { useSync } from '@/hooks/useSync'
import { METHOD_COLORS } from '@/types'
import type { Project, Folder, ApiCollection } from '@/types'
import { useQueryClient } from '@tanstack/react-query'

import { ConfirmModal } from './ConfirmModal'
import { EnvironmentSelector } from './EnvironmentSelector'

export function Sidebar() {
    const qc = useQueryClient()
    const {
        currentProjectId, currentFolderId, currentApiId,
        selectProject, selectFolder, selectApi,
        setShowCreateProject, setShowCreateFolder, setShowCreateApi,
        setShowDatabaseSettings, setShowRbacSettings, setShowDeploySettings, setShowGeneralSettings,
        setShowTeamConnect, setShowApiDocumentation,
        setEditingFolderId, isSidebarCollapsed, toggleSidebar,
        isTeamWorkspace, teamConfig, setTeamWorkspace,
        isSyncing
    } = useAppStore()

    const { data: projects } = useProjects()
    const { data: folders, isLoading: isFoldersLoading, error: foldersError } = useFolders(currentProjectId)
    const { syncNow } = useSync()
    const deleteFolder = useDeleteFolder()
    const deleteApi = useDeleteApi()

    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [ctx, setCtx] = useState<{ x: number; y: number; type: 'folder' | 'api'; id: string } | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<{ type: 'folder' | 'api'; id: string; folderId?: string; projectId?: string } | null>(null)
    const [isActionsExpanded, setIsActionsExpanded] = useState(false)
    const [version, setVersion] = useState<string>('')
    const [projectDdOpen, setProjectDdOpen] = useState(false)

    useEffect(() => {
        ; (window as any).electronAPI.getAppVersion().then(setVersion)
    }, [])

    useEffect(() => { const h = () => { setCtx(null); setProjectDdOpen(false) }; window.addEventListener('click', h); return () => window.removeEventListener('click', h) }, [])

    const toggle = (id: string) => {
        setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
        selectFolder(id)
    }
    const onCtx = (e: React.MouseEvent, type: 'folder' | 'api', id: string) => {
        e.preventDefault();
        setCtx({ x: e.clientX, y: e.clientY, type, id })
    }

    const executeDeletion = () => {
        if (!confirmDelete) return
        const state = useAppStore.getState()
        if (confirmDelete.type === 'folder') {
            deleteFolder.mutate(confirmDelete.id)
            if (state.currentFolderId === confirmDelete.id) selectFolder(null)
        } else {
            deleteApi.mutate({
                id: confirmDelete.id,
                folderId: confirmDelete.folderId || state.currentFolderId || '',
                projectId: confirmDelete.projectId || state.currentProjectId || ''
            })
            if (state.currentApiId === confirmDelete.id) selectApi(null)
        }
        setConfirmDelete(null)
    }

    /* ══ Collapsed mode ══ */
    if (isSidebarCollapsed) {
        return (
            <div
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '16px', gap: '12px', height: '100%', width: '52px', background: '#0A0A0A', borderRight: '1px solid #1F1F1F' }}
            >
                <button onClick={toggleSidebar} className="rounded-lg"
                    style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280', transition: '150ms ease' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#151515'; e.currentTarget.style.color = '#FFFFFF' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' }}>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <line x1="3" y1="5" x2="15" y2="5" /><line x1="3" y1="9" x2="11" y2="9" /><line x1="3" y1="13" x2="15" y2="13" />
                    </svg>
                </button>
            </div>
        )
    }

    return (
        <>
            <aside className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '300px', background: '#0A0A0A', borderRight: '1px solid #1F1F1F' }}>

                {/* ═══ Brand header ═══ */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0, height: '52px', borderBottom: '1px solid #1A1A1A' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button onClick={toggleSidebar} className="rounded-lg"
                            style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280', transition: '150ms ease' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#151515'; e.currentTarget.style.color = '#FFFFFF' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="10" y2="8" /><line x1="2" y1="12" x2="14" y2="12" />
                            </svg>
                        </button>
                        <span style={{ fontSize: 'calc(13px * var(--font-scale))', fontWeight: 600, color: 'white', letterSpacing: '-0.01em' }}>API Documenter</span>
                    </div>
                    {currentProjectId && (
                        <button onClick={() => selectProject(null)} className="rounded-lg group"
                            style={{ width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280', transition: '150ms ease' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#151515'; e.currentTarget.style.color = '#FFFFFF' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' }}
                            title="Go to Home">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                                <polyline points="9 22 9 12 15 12 15 22" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* ═══ PROJECT section ═══ */}
                <div style={{ flexShrink: 0, borderBottom: '1px solid #1A1A1A' }}>
                    <p style={{ padding: '20px 20px 10px 20px', color: '#444', margin: 0, fontSize: 'calc(9px * var(--font-scale))', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 800 }}>Project Workspace</p>
                    <div style={{ padding: '0 12px 16px 12px', position: 'relative' }}>
                        {/* Custom Dropdown Trigger */}
                        <button
                            onClick={(e) => { e.stopPropagation(); setProjectDdOpen(!projectDdOpen) }}
                            className="rounded-xl border transition-all duration-200"
                            style={{
                                width: '100%', height: '44px', padding: '0 14px',
                                background: isTeamWorkspace ? 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)' : '#111111',
                                border: projectDdOpen ? '1px solid #444' : (isTeamWorkspace ? '1px solid #333' : '1px solid #222'),
                                color: '#FFFFFF',
                                display: 'flex', alignItems: 'center', gap: '10px',
                                cursor: 'pointer', textAlign: 'left'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.background = '#151515' }}
                            onMouseLeave={e => { if (!projectDdOpen) { e.currentTarget.style.borderColor = isTeamWorkspace ? '#333' : '#222'; e.currentTarget.style.background = isTeamWorkspace ? '#111111' : '#111111' } }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '6px', background: isTeamWorkspace ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)', color: isTeamWorkspace ? '#10b981' : '#6B7280' }}>
                                {isTeamWorkspace ? (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                                ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                )}
                            </div>
                            <span style={{ fontSize: '13px', fontWeight: 600, flex: 1, truncate: 'true' as any }}>
                                {isTeamWorkspace ? `Team: ${teamConfig?.projectId.slice(0, 8)}` : (projects?.find(p => p.id === currentProjectId)?.name || 'Select workspace…')}
                            </span>
                            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" style={{ transform: projectDdOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}>
                                <path d="M1 1l4 4 4-4" />
                            </svg>
                        </button>

                        {/* Floating Menu */}
                        {projectDdOpen && (
                                <div className="fade-in scale-in z-[3000]"
                                    style={{
                                        position: 'absolute', top: '100%', left: '0', right: '0', marginTop: '8px',
                                        background: '#111111', border: '1px solid #2A2A2A', borderRadius: '12px',
                                        boxShadow: '0 12px 48px rgba(0,0,0,0.6)', padding: '6px',
                                        animation: 'fadeUp 150ms ease'
                                    }}>
                                
                                {!isTeamWorkspace ? (
                                    <>
                                        <div style={{ padding: '6px 10px', fontSize: '9px', fontWeight: 800, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Connect</div>
                                        <div onClick={() => { setShowTeamConnect(true); setProjectDdOpen(false) }}
                                            className="group"
                                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', cursor: 'pointer', transition: '150ms ease' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#1A1A1A'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                            </div>
                                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#9CA3AF' }} className="group-hover:text-white">Connect Team Project</span>
                                        </div>

                                        <div style={{ height: '1px', background: '#1F1F1F', margin: '6px 4px' }} />
                                        <div style={{ padding: '6px 10px', fontSize: '9px', fontWeight: 800, color: '#444', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Local Projects</div>
                                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                            {projects?.map(p => {
                                                const isSel = p.id === currentProjectId
                                                return (
                                                    <div key={p.id} onClick={() => { selectProject(p.id); setProjectDdOpen(false) }}
                                                        className="group"
                                                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', cursor: 'pointer', background: isSel ? 'rgba(255,255,255,0.03)' : 'transparent', transition: '150ms ease' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = isSel ? 'rgba(255,255,255,0.05)' : '#1A1A1A'}
                                                        onMouseLeave={e => e.currentTarget.style.background = isSel ? 'rgba(255,255,255,0.03)' : 'transparent'}>
                                                        <div style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: isSel ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)', color: isSel ? '#FFF' : '#6B7280' }}>
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>
                                                        </div>
                                                        <span style={{ fontSize: '13px', fontWeight: isSel ? 600 : 500, color: isSel ? '#FFF' : '#9CA3AF', flex: 1 }} className="group-hover:text-white">{p.name}</span>
                                                        {isSel && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#FFF' }} />}
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        {currentProjectId && (
                                            <>
                                                <div style={{ height: '1px', background: '#1F1F1F', margin: '6px 4px' }} />
                                                <div onClick={() => { selectProject(null); setProjectDdOpen(false) }}
                                                    className="group"
                                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', cursor: 'pointer', transition: '150ms ease' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <div style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171' }}>
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                                    </div>
                                                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#f87171' }}>Close Project</span>
                                                </div>
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div onClick={() => { setTeamWorkspace(false); setProjectDdOpen(false) }}
                                            className="group"
                                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', cursor: 'pointer', transition: '150ms ease' }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(248, 113, 113, 0.1)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: 'rgba(248, 113, 113, 0.1)', color: '#f87171' }}>
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                                            </div>
                                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#f87171' }}>Exit Team Workspace</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {isTeamWorkspace && (
                            <div className="mt-2 px-2 flex items-center gap-2">
                                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                <span style={{ fontSize: 'calc(9px * var(--font-scale))', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.15em' }}>Team Live Mode</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══ ENVIRONMENTS section ═══ */}
                <div style={{ flexShrink: 0, borderBottom: '1px solid #1A1A1A', padding: '12px 16px' }}>
                    <p style={{ padding: '0 4px 8px 4px', color: '#444', margin: 0, fontSize: 'calc(9px * var(--font-scale))', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 800 }}>Environment</p>
                    <EnvironmentSelector />
                </div>

                {/* ═══ FOLDERS section ═══ */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    {currentProjectId && (
                        <div style={{ padding: '16px 16px 8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <p style={{ color: '#6B7280', margin: 0, fontSize: 'calc(10px * var(--font-scale))', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Folders</p>
                            <button
                                onClick={() => syncNow()}
                                disabled={isSyncing}
                                className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[10px] font-bold text-neutral-400 hover:text-white transition-all border border-white/5"
                            >
                                <div style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }}>
                                    <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M13 7a6 6 0 1 1-1-3.2L11 5" />
                                        <polyline points="13 2 13 5 10 5" />
                                    </svg>
                                </div>
                                {isSyncing ? 'Syncing...' : 'Sync with database'}
                            </button>
                        </div>
                    )}

                    <div style={{ flex: 1, padding: '0 8px' }}>
                        {!currentProjectId ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: '0 24px' }}>
                                <p className="text-[12px] leading-relaxed" style={{ color: '#6B7280', margin: 0 }}>
                                    Select or create a project to get started
                                </p>
                            </div>
                        ) : isFoldersLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px' }}>
                                <div className="border-2 border-white/10 border-t-white/40 rounded-full animate-spin" style={{ width: '20px', height: '20px' }} />
                                <p className="text-[10px] mt-3 uppercase tracking-widest font-bold text-neutral-600">Loading Folders...</p>
                            </div>
                        ) : foldersError ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px', textAlign: 'center' }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px', opacity: 0.5 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                <p className="text-[11px] text-red-400 font-medium">{(foldersError as any).message || 'Connection failed'}</p>
                                <button onClick={() => qc.invalidateQueries({ queryKey: ['folders'] })} className="mt-4 text-[10px] font-bold uppercase tracking-wider text-neutral-400 hover:text-white transition-colors">Retry</button>
                            </div>
                        ) : !folders?.length ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 16px', textAlign: 'center' }}>
                                <p className="text-[12px]" style={{ color: '#6B7280', margin: 0 }}>No folders yet</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {folders.map((f: Folder) => (
                                    <FolderItem key={f.id} folder={f}
                                        isOpen={expanded.has(f.id)} isActive={currentFolderId === f.id}
                                        activeApi={currentApiId}
                                        onToggle={() => toggle(f.id)} onSelectApi={(apiId) => selectApi(apiId, f.id)}
                                        onCtx={onCtx} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ═══ Bottom actions ═══ */}
                {currentProjectId && projects && (() => {
                    const p = projects.find(x => x.id === currentProjectId)
                    const hasDb = p?.databaseUrl && p.databaseUrl.trim() !== ''

                    return (
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid #1A1A1A' }}>
                            {/* Collapsible Actions Header */}
                            <div
                                onClick={() => setIsActionsExpanded(!isActionsExpanded)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 16px', cursor: 'pointer', transition: '150ms ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = '#151515'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <span className="text-[11px] tracking-[0.1em] uppercase font-semibold" style={{ color: '#6B7280' }}>
                                    Project Actions
                                </span>
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round"
                                    style={{ transform: isActionsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}>
                                    <polyline points="3,1 7,5 3,9" />
                                </svg>
                            </div>

                            {/* Hidden/Expanded Buttons Area */}
                            {isActionsExpanded && (
                                <div className="fade-in" style={{ padding: '0 8px 12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <SyncAction currentProject={p} />
                                    {(!isTeamWorkspace || folders?.some(f => (f as any).role === 'admin')) && (
                                        <ActionBtn icon="folder" label="New Folder" onClick={() => setShowCreateFolder(true)} />
                                    )}
                                    {(!isTeamWorkspace || folders?.some(f => (f as any).role !== 'viewer')) && (
                                        <ActionBtn icon="plus" label="New Endpoint" onClick={() => setShowCreateApi(true)} />
                                    )}

                                    <div style={{ height: '1px', background: '#1A1A1A', margin: '4px 8px' }} />

                                    {!isTeamWorkspace && (
                                        <ActionBtn icon="database" label="Database" onClick={() => setShowDatabaseSettings(true)} />
                                    )}

                                    {hasDb && !isTeamWorkspace && (
                                        <>
                                            <ActionBtn icon="users" label="Team (RBAC)" onClick={() => setShowRbacSettings(true)} />
                                            <ActionBtn icon="deploy" label="Deploy Proxy" onClick={() => setShowDeploySettings(true)} />
                                        </>
                                    )}

                                    {!isTeamWorkspace && (
                                        <ActionBtn icon="settings" label="Project Settings" onClick={() => setShowGeneralSettings(true)} />
                                    )}

                                    {!isTeamWorkspace && (
                                        <ActionBtn icon="document" label="Generate API Docs" onClick={() => setShowApiDocumentation(true)} />
                                    )}

                                    {p?.localPath && !isTeamWorkspace && (
                                        <ActionBtn icon="folderOpen" label="Open in Explorer" onClick={() => (window as any).electronAPI.openInExplorer(p.localPath)} />
                                    )}
                                </div>
                            )}
                        </div>
                    )
                })()}

                {/* ═══ Footer meta ═══ */}
                <div className="text-[10px] font-medium" style={{ flexShrink: 0, padding: '8px 16px', borderTop: '1px solid #1A1A1A', color: '#6B7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>
                        {folders?.length || 0} folders · {(() => {
                            if (!currentProjectId) return 'No project'
                            const p = projects?.find(x => x.id === currentProjectId)
                            const hasD = p?.databaseUrl && p.databaseUrl.trim() !== ''
                            const hasP = p?.proxyUrl && p.proxyUrl.trim() !== ''
                            if (hasD || hasP) return 'Remote'
                            return 'Local'
                        })()}
                    </span>
                    <span style={{ opacity: 0.5, fontStyle: 'italic' }}>v{version}</span>
                </div>
            </aside>

            {/* ══ Context menu ══ */}
            {ctx && (
                <div className="fixed z-[2000] scale-in"
                    style={{
                        left: ctx.x, top: ctx.y, padding: '6px', minWidth: '200px',
                        background: '#141414', border: '1px solid #222', borderRadius: '12px',
                        boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)'
                    }}>
                    {ctx.type === 'folder' && (() => {
                        const folder = folders?.find(f => f.id === ctx.id);
                        const isViewer = (folder as any)?.role === 'viewer';
                        const isAdmin = (folder as any)?.role === 'admin';
                        if (isViewer) return null;

                        return (
                            <>
                                <CtxBtn onClick={() => { setEditingFolderId(ctx.id); setShowCreateFolder(true); setCtx(null) }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', opacity: 0.6 }}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                    Edit folder
                                </CtxBtn>
                                <CtxBtn onClick={() => { selectFolder(ctx.id); setShowCreateApi(true); setCtx(null) }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', opacity: 0.6 }}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                    Add endpoint
                                </CtxBtn>
                                {(!isTeamWorkspace || isAdmin) && (
                                    <>
                                        <div style={{ height: '1px', background: '#222', margin: '6px 8px' }} />
                                        <CtxBtn
                                            onClick={() => { setConfirmDelete({ type: ctx.type, id: ctx.id }); setCtx(null) }}
                                            style={{ color: '#EF4444' }}
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', opacity: 0.8 }}><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                            Delete folder
                                        </CtxBtn>
                                    </>
                                )}
                            </>
                        );
                    })()}

                    {ctx.type === 'api' && (() => {
                        const api = (window as any)._allApis?.find((a: any) => a.id === ctx.id); // Hacky or we need a better way
                        // For now, let's just use the selected folder's role if we can find it
                        const folder = folders?.find(f => f.id === currentFolderId);
                        const isViewer = (folder as any)?.role === 'viewer';
                        const isAdmin = (folder as any)?.role === 'admin';

                        return (
                            <>
                                {(!isTeamWorkspace || !isViewer) && (
                                    <CtxBtn
                                        onClick={() => {
                                            setConfirmDelete({
                                                type: ctx.type,
                                                id: ctx.id,
                                                folderId: currentFolderId || '',
                                                projectId: currentProjectId || ''
                                            });
                                            setCtx(null)
                                        }}
                                        style={{ color: '#EF4444' }}
                                    >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '10px', opacity: 0.8 }}><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                        Delete endpoint
                                    </CtxBtn>
                                )}
                            </>
                        );
                    })()}
                </div>
            )}

            {/* ══ Confirm Modal ══ */}
            {confirmDelete && (
                <ConfirmModal
                    title={`Delete ${confirmDelete.type === 'folder' ? 'Folder' : 'Endpoint'}?`}
                    description={`Are you sure you want to delete this ${confirmDelete.type}? This action cannot be undone and will remove all associated data.`}
                    confirmLabel="Delete Permanently"
                    onConfirm={executeDeletion}
                    onCancel={() => setConfirmDelete(null)}
                />
            )}
        </>
    )
}


/* ═══════════════════════════════════════════════════════════════════
   FOLDER ITEM — Collapsible with smooth expand
   ═══════════════════════════════════════════════════════════════════ */
interface FolderItemProps {
    folder: Folder; isOpen: boolean; isActive: boolean; activeApi: string | null
    onToggle: () => void; onSelectApi: (apiId: string, folderId: string) => void
    onCtx: (e: React.MouseEvent, t: 'folder' | 'api', id: string) => void
}

function FolderItem({ folder, isOpen, isActive, activeApi, onToggle, onSelectApi, onCtx }: FolderItemProps) {
    const { data: apis, isLoading, error } = useApis(isOpen ? folder.id : null)

    return (
        <div>
            {/* Folder row */}
            <div className="rounded-lg cursor-pointer group"
                style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                    background: isActive ? '#1F1F1F' : 'transparent',
                    transition: '150ms ease'
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#151515' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                onClick={onToggle} onContextMenu={e => onCtx(e, 'folder', folder.id)}>

                {/* Chevron */}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round"
                    style={{ flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}>
                    <polyline points="3,1 7,5 3,9" />
                </svg>

                <span className="text-[14px] font-medium truncate"
                    style={{ flex: 1, color: isActive ? '#FFFFFF' : '#9CA3AF', transition: '150ms ease' }}>
                    {folder.name}
                </span>

                {/* Role indicator for Team Workspace */}
                {(folder as any).role && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
                        style={{
                            color: (folder as any).role === 'admin' ? '#F87171' : (folder as any).role === 'editor' ? '#60A5FA' : '#9CA3AF',
                            borderColor: (folder as any).role === 'admin' ? '#991B1B' : (folder as any).role === 'editor' ? '#1E40AF' : '#374151',
                            background: 'rgba(0,0,0,0.3)'
                        }}>
                        {(folder as any).role}
                    </span>
                )}
            </div>

            {/* API items — indented */}
            {isOpen && (
                <div className="fade-in" style={{ overflow: 'hidden' }}>
                    {isLoading ? (
                        <div style={{ padding: '8px 16px 8px 40px' }}>
                            <span className="text-[11px] animate-pulse" style={{ color: '#444' }}>Loading...</span>
                        </div>
                    ) : error ? (
                        <div style={{ padding: '8px 16px 8px 40px' }}>
                            <span className="text-[10px] text-red-500/50">Error loading endpoints</span>
                        </div>
                    ) : !apis?.length ? (
                        <div style={{ padding: '8px 16px 8px 40px' }}>
                            <span className="text-[11px]" style={{ color: '#6B7280' }}>No endpoints</span>
                        </div>
                    ) : apis.map((a: ApiCollection) => {
                        const isAct = activeApi === a.id
                        return (
                            <div key={a.id}
                                className="rounded-lg cursor-pointer"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '12px', margin: '4px 8px', padding: '10px 12px',
                                    background: isAct ? '#1F1F1F' : 'transparent',
                                    borderLeft: isAct ? '3px solid #FFFFFF' : '3px solid transparent',
                                    transition: '150ms ease'
                                }}
                                onMouseEnter={e => { if (!isAct) e.currentTarget.style.background = '#151515' }}
                                onMouseLeave={e => { if (!isAct) e.currentTarget.style.background = 'transparent' }}
                                onClick={() => onSelectApi(a.id, folder.id)} onContextMenu={e => onCtx(e, 'api', a.id)}>

                                {/* Method badge — colored pill */}
                                {(() => {
                                    const colors = METHOD_COLORS[a.method] || METHOD_COLORS.GET
                                    return (
                                        <span className="text-[10px] font-bold font-mono tracking-[0.05em] whitespace-nowrap"
                                            style={{
                                                padding: '2px 8px',
                                                background: colors.bg,
                                                border: `1px solid ${colors.border}`,
                                                borderRadius: '999px',
                                                color: colors.text,
                                                lineHeight: 1
                                            }}>
                                            {a.method}
                                        </span>
                                    )
                                })()}

                                <span className="text-[13px] font-medium truncate"
                                    style={{ color: isAct ? '#FFFFFF' : '#9CA3AF', transition: '150ms ease' }}>
                                    {a.name || a.path}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════════
   SYNC ACTION — manual trigger
   ═══════════════════════════════════════════════════════════════════ */
function SyncAction({ currentProject }: { currentProject?: Project }) {
    const { syncNow } = useSync()
    const { proxyConnection, isSyncing } = useAppStore()

    const hasDirect = currentProject?.databaseUrl && currentProject.databaseUrl.trim() !== ''
    const hasProxy = !!proxyConnection?.connected && !!proxyConnection?.proxyUrl

    if (!hasDirect && !hasProxy) return null

    return (
        <ActionBtn
            icon="refresh"
            label={isSyncing ? 'Syncing...' : 'Sync Now'}
            onClick={() => syncNow()}
            disabled={isSyncing}
            spin={isSyncing}
        />
    )
}


/* ═══════════════════════════════════════════════════════════════════
   ACTION BUTTON — bottom area
   ═══════════════════════════════════════════════════════════════════ */
function ActionBtn({ icon, label, onClick, disabled, spin }: {
    icon: 'folder' | 'plus' | 'globe' | 'users' | 'refresh' | 'database' | 'deploy' | 'settings' | 'document' | 'folderOpen';
    label: string;
    onClick: () => void;
    disabled?: boolean;
    spin?: boolean
}) {
    return (
        <button onClick={onClick} disabled={disabled}
            className="text-[12px] font-medium text-left transition-all"
            style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '12px 16px', borderRadius: '8px',
                color: disabled ? '#4B5563' : '#6B7280',
                cursor: disabled ? 'not-allowed' : 'pointer'
            }}
            onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = '#151515'; e.currentTarget.style.color = '#FFFFFF' } }}
            onMouseLeave={e => { if (!disabled) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' } }}>
            <div style={{ animation: spin ? 'spin 1s linear infinite' : 'none' }}>
                {icon === 'folder' ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4V11C2 11.6 2.4 12 3 12H11C11.6 12 12 11.6 12 11V5.5C12 4.9 11.6 4.5 11 4.5H7L5.5 3H3C2.4 3 2 3.4 2 4Z" />
                    </svg>
                ) : icon === 'folderOpen' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                ) : icon === 'globe' ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="7" cy="7" r="5" />
                        <path d="M2 7H12" />
                        <path d="M7 2C8.5 3.5 8.5 10.5 7 12" />
                        <path d="M7 2C5.5 3.5 5.5 10.5 7 12" />
                    </svg>
                ) : icon === 'users' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                ) : icon === 'refresh' ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M13 7a6 6 0 1 1-1-3.2L11 5" />
                        <polyline points="13 2 13 5 10 5" />
                    </svg>
                ) : icon === 'database' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5V19A9 3 0 0 0 21 19V5" /><path d="M3 12A9 3 0 0 0 21 12" />
                    </svg>
                ) : icon === 'deploy' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                ) : icon === 'document' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
                    </svg>
                ) : icon === 'settings' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <line x1="7" y1="3" x2="7" y2="11" /><line x1="3" y1="7" x2="11" y2="7" />
                    </svg>
                )}
            </div>
            {label}
        </button>
    )
}


/* ═══════════════════════════════════════════════════════════════════
   CONTEXT MENU BUTTON
   ═══════════════════════════════════════════════════════════════════ */
function CtxBtn({ children, onClick, style }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void; style?: React.CSSProperties }) {
    return (
        <button onClick={onClick}
            className="text-[12px] font-medium text-left transition-all"
            style={{ display: 'flex', width: '100%', padding: '7px 12px', borderRadius: '6px', color: '#9CA3AF', ...style }}
            onMouseEnter={e => {
                if (!style?.background) e.currentTarget.style.background = '#1F1F1F';
                if (!style?.color) e.currentTarget.style.color = '#FFFFFF'
            }}
            onMouseLeave={e => {
                if (!style?.background) e.currentTarget.style.background = 'transparent';
                if (!style?.color) e.currentTarget.style.color = '#9CA3AF'
            }}>
            {children}
        </button>
    )
}