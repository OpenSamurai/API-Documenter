import { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useProjects } from '@/hooks/useProjects'
import { useGit } from '@/hooks/useGit'
import { useSync } from '@/hooks/useSync'
import { ConfirmModal } from './ConfirmModal'

export function GitSidebar() {
    const { currentProjectId, currentSyncBranch, databaseUrl, sidebarWidth } = useAppStore()
    const { data: projects } = useProjects()
    const currentProject = projects?.find(p => p.id === currentProjectId)

    const { status, branches, logs, isLoading, error, clearError, stageFile, unstageFile, commitMessage, discardFile, fetchStatus, switchBranch, createBranch, hasUnresolvedConflicts } = useGit(currentProjectId)
    const [message, setMessage] = useState('')
    const [showBranches, setShowBranches] = useState(false)
    const [newBranchName, setNewBranchName] = useState('')
    const [isCommitsCollapsed, setIsCommitsCollapsed] = useState(false)
    const [showConnectConfirm, setShowConnectConfirm] = useState(false)
    const { syncNow } = useSync()

    const handleCommit = async () => {
        if (!message.trim() || !stagedChanges.length) return
        await commitMessage(message)
        setMessage('')
        
        // Trigger push sync after commit
        await syncNow(false)
    }

    if (!currentProjectId) {
        return (
            <aside style={{ display: 'flex', flexDirection: 'column', height: '100%', width: `${sidebarWidth}px`, background: '#0A0A0A', borderRight: '1px solid #1F1F1F', padding: '24px' }}>
                <p className="text-sm text-neutral-500">Open a project to use Source Control.</p>
            </aside>
        )
    }

    // Determine unstaged files
    // status.files contains all files. We have to separate them into Staged and Changes.
    const allStaged = status?.staged || []
    const allModified = status?.files.filter(f => !allStaged.includes(f.path) && f.index !== 'D') || [] // simplistic
    // Using simple-git, typically files that are not fully staged appear in not_added, deleted, modified.
    const unstagedFiles = status?.files.filter(f => f.working_dir !== ' ' && f.working_dir !== '?') || []
    const untrackedFiles = status?.not_added || []
    
    // Actually simple-git gives us:
    // status.created, status.deleted, status.modified, status.not_added, status.renamed
    // status.staged => files currently added to index
    const changes = [
        ...(status?.modified || []).filter(f => !allStaged.includes(f)).map(f => ({ path: f, type: 'M' })),
        ...(status?.not_added || []).filter(f => !allStaged.includes(f)).map(f => ({ path: f, type: 'U' })),
        ...(status?.deleted || []).filter(f => !allStaged.includes(f)).map(f => ({ path: f, type: 'D' }))
    ]

    const stagedChanges = [
        ...(status?.renamed || []).map((r: any) => ({ path: r.to, fromPath: r.from, type: 'R' })),
        ...allStaged.filter(f => !status?.renamed?.find((r: any) => r.to === f)).map(f => ({ path: f, type: 'S' }))
    ]

    return (
        <aside className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: `${sidebarWidth}px`, background: '#0A0A0A', borderRight: '1px solid #1F1F1F' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0, height: '52px', borderBottom: '1px solid #1A1A1A' }}>
                <span className="text-sm font-semibold text-white tracking-wide">SOURCE CONTROL</span>
                <div style={{ flex: 1 }} />
                {databaseUrl && (
                    <button onClick={() => fetchStatus()} className="text-neutral-500 hover:text-white transition-colors" title="Refresh">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isLoading ? 'animate-spin' : ''}>
                            <path d="M13 7a6 6 0 1 1-1-3.2L11 5" />
                            <polyline points="13 2 13 5 10 5" />
                        </svg>
                    </button>
                )}
            </div>

            {/* Error state */}
            {error && (
                <div style={{ padding: '12px 16px' }} className="bg-[#2A0808] border-b border-[#4A1010] flex flex-col relative group shrink-0">
                    <button 
                        onClick={() => clearError()} 
                        className="absolute top-2 right-2 p-1.5 rounded-md text-red-400 hover:bg-[#4A1010] hover:text-red-200 transition-colors opacity-0 group-hover:opacity-100"
                        title="Dismiss Error"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    <span className="text-[11.5px] text-red-400 leading-[1.6] pr-8 break-words whitespace-pre-wrap font-medium">{error}</span>
                </div>
            )}

            {/* Commit Input Area */}
            <div style={{ padding: '16px', borderBottom: '1px solid #1A1A1A', background: '#0A0A0A' }}>
                <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Message (Ctrl+Enter to commit)"
                    style={{ padding: '12px' }}
                    className="w-full bg-[#111] text-neutral-200 text-[13px] border border-[#333] rounded mb-3 focus:border-blue-500 focus:bg-[#141414] outline-none resize-none transition-all scrollbar-thin"
                    rows={3}
                    onKeyDown={e => {
                        if (e.ctrlKey && e.key === 'Enter') handleCommit()
                    }}
                />
                {/* Conflict Warning */}
                {hasUnresolvedConflicts && (
                    <div style={{ padding: '8px 12px', marginBottom: '8px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        <span className="text-[11px] text-amber-400 font-medium">Resolve sync conflicts before committing</span>
                    </div>
                )}
                <button 
                    onClick={handleCommit}
                    disabled={!message.trim() || !stagedChanges.length || hasUnresolvedConflicts}
                    style={{ padding: '8px 12px' }}
                    className="w-full bg-[#1A1A1A] hover:bg-blue-600 disabled:bg-[#111] disabled:text-[#444] text-[#DDD] hover:text-white border border-[#333] disabled:border-[#222] hover:border-blue-500 text-xs font-semibold rounded transition-all tracking-wide"
                    title={hasUnresolvedConflicts ? 'Resolve sync conflicts before committing' : ''}
                >
                    {hasUnresolvedConflicts ? '⚠ Conflicts' : 'Commit'}
                </button>
            </div>

            {/* Scrollable lists */}
            <div className="flex-1 overflow-y-auto scrollbar-thin" style={{ display: 'flex', flexDirection: 'column' }}>
                
                {/* Staged Changes */}
                {stagedChanges.length > 0 && (
                    <div className="mt-2">
                        <div style={{ padding: '6px 16px' }} className="flex items-center justify-between group cursor-pointer hover:bg-white/5">
                            <span className="text-[11px] font-bold tracking-wider text-neutral-400">STAGED CHANGES <span className="ml-1 bg-white/10 px-1.5 py-0.5 rounded text-white">{stagedChanges.length}</span></span>
                            <button onClick={() => unstageFile('.')} disabled={isLoading} className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-white transition-all disabled:opacity-30" title="Unstage All">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </button>
                        </div>
                        {stagedChanges.map(f => (
                            <FileItem key={f.path} type={f.type} path={f.path} fromPath={f.fromPath}
                                onAction={() => unstageFile(f.type === 'R' && f.fromPath ? [f.fromPath, f.path] : f.path)} 
                                actionIcon="minus" title="Unstage Changes"
                                disabled={isLoading}
                            />
                        ))}
                    </div>
                )}

                {/* Changes (Unstaged) */}
                {changes.length > 0 && (
                    <div className="mt-2" style={{ paddingBottom: '12px' }}>
                        <div style={{ padding: '6px 16px' }} className="flex items-center justify-between group cursor-pointer hover:bg-white/5">
                            <span className="text-[11px] font-bold tracking-wider text-neutral-400">CHANGES <span className="ml-1 bg-white/10 px-1.5 py-0.5 rounded text-white">{changes.length}</span></span>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                <button onClick={() => discardFile('.')} disabled={isLoading} className="text-neutral-500 hover:text-red-400 disabled:opacity-30" title="Discard All Changes">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                </button>
                                <button onClick={() => stageFile('.')} disabled={isLoading} className="text-neutral-500 hover:text-white disabled:opacity-30" title="Stage All Changes">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                </button>
                            </div>
                        </div>
                        {changes.map(f => (
                            <FileItem key={f.path} type={f.type} path={f.path} fromPath={f.fromPath}
                                onAction={() => stageFile(f.type === 'R' && f.fromPath ? [f.fromPath, f.path] : f.path)} 
                                actionIcon="plus" title="Stage Changes"
                                onDiscard={() => discardFile(f.type === 'R' && f.fromPath ? [f.fromPath, f.path] : f.path)}
                                disabled={isLoading}
                            />
                        ))}
                    </div>
                )}

                {stagedChanges.length === 0 && changes.length === 0 && !isLoading && (
                    <div className="flex flex-col items-center justify-center text-neutral-600 text-[13px] p-8 text-center mt-8">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-4 opacity-50"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                        No active changes in this repository.
                    </div>
                )}
            </div>

            {/* Commits Section */}
            {logs && logs.length > 0 && (
                <div className={`flex-1 overflow-y-auto scrollbar-thin border-t border-[#1A1A1A] flex flex-col transition-all ${isCommitsCollapsed ? 'max-h-[36px] overflow-hidden' : ''}`}>
                    <div 
                        onClick={() => setIsCommitsCollapsed(!isCommitsCollapsed)}
                        style={{ padding: '8px 16px' }}
                        className="flex items-center justify-between sticky top-0 bg-[#0A0A0A] z-10 shadow-[0_4px_10px_rgba(0,0,0,0.5)] cursor-pointer hover:bg-[#111]"
                    >
                        <div className="flex items-center gap-1.5">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-neutral-500 transition-transform ${isCommitsCollapsed ? '-rotate-90' : ''}`}>
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                            <span className="text-[11px] font-bold tracking-wider text-neutral-400 select-none">COMMITS</span>
                        </div>
                    </div>
                    
                    {!isCommitsCollapsed && logs.map(log => (
                        <div key={log.hash} style={{ padding: '12px 16px' }} className="hover:bg-[#151515] border-b border-[#111] transition-colors shrink-0 group flex flex-col gap-1.5 cursor-default">
                            <div className="text-[13px] text-neutral-200 leading-snug truncate" title={log.message}>{log.message}</div>
                            <div className="flex items-center justify-between text-[11px] font-medium text-neutral-500">
                                <div className="flex items-center gap-1.5 truncate">
                                    <div className="w-4 h-4 rounded-full bg-[#1A1A1A] text-neutral-400 flex items-center justify-center border border-[#333] shrink-0 text-[8px] uppercase">
                                        {log.author_name?.charAt(0)}
                                    </div>
                                    <span className="truncate">{log.author_name}</span>
                                </div>
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0">{new Date(log.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric'})}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Sync Status / Upstream tracking */}
            {status?.current && (
                <div className="relative shrink-0">
                    {/* Branch Dropdown */}
                    {showBranches && (
                        <div className="absolute bottom-full left-0 w-full bg-[#141414] border-t border-[#222] shadow-[0_-5px_20px_rgba(0,0,0,0.8)] z-20 flex flex-col max-h-[300px]">
                            
                            <div style={{ padding: '12px' }} className="border-b border-[#222]">
                                <input 
                                    type="text" 
                                    value={newBranchName}
                                    onChange={e => setNewBranchName(e.target.value)}
                                    placeholder="Branch name..."
                                    style={{ padding: '10px 12px' }}
                                    className="w-full bg-[#050505] text-white text-[13px] border border-[#333] rounded mb-3 focus:border-blue-500 outline-none"
                                    onKeyDown={async e => {
                                        if (e.key === 'Enter' && newBranchName.trim()) {
                                            await createBranch(newBranchName.trim())
                                            setNewBranchName('')
                                            setShowBranches(false)
                                        }
                                    }}
                                />
                                <button 
                                    disabled={!newBranchName.trim()}
                                    onClick={async () => {
                                        if (newBranchName.trim()) {
                                            await createBranch(newBranchName.trim())
                                            setNewBranchName('')
                                            setShowBranches(false)
                                        }
                                    }}
                                    style={{ padding: '8px 12px' }}
                                    className="w-full bg-[#222] hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors tracking-wide"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    Create Branch
                                </button>
                            </div>

                            <div className="overflow-y-auto scrollbar-thin">
                                {branches?.all?.map((b: string) => (
                                    <div 
                                        key={b}
                                        style={{ padding: '8px 16px' }}
                                        onClick={async () => {
                                            await switchBranch(b)
                                            setShowBranches(false)
                                        }}
                                        className={`text-sm cursor-pointer hover:bg-blue-600/20 hover:text-blue-400 transition-colors flex items-center justify-between pr-4 ${b === status.current ? 'text-blue-400 bg-blue-900/10' : 'text-neutral-300'}`}
                                    >
                                        <div className="flex items-center">
                                            {b === status.current && <svg className="mr-2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                            <span className={b === status.current ? 'font-semibold' : ''}>{b}</span>
                                        </div>
                                        {b === currentSyncBranch && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" title="Connected Sync Branch" />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div 
                        onClick={() => setShowBranches(!showBranches)}
                        className="p-3 border-t border-[#1A1A1A] bg-[#050505] shadow-[0_-5px_15px_rgba(0,0,0,0.5)] flex items-center justify-between cursor-pointer hover:bg-[#111] transition-colors group select-none relative z-30"
                    >
                        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-400 group-hover:text-blue-400 transition-colors">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v12"></path><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M18 9a9 9 0 0 1-9 9"></path></svg>
                            <span>{status.current}</span>
                            
                            {/* Connection Status Badge */}
                            {status.current === currentSyncBranch ? (
                                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] border border-emerald-500/20 flex items-center gap-1 animate-pulse">
                                    <div className="w-1 h-1 rounded-full bg-emerald-500" />
                                    CONNECTED
                                </span>
                            ) : databaseUrl ? (
                                <button 
                                    onClick={async (e) => {
                                        e.stopPropagation()
                                        setShowConnectConfirm(true)
                                    }}
                                    className="ml-2 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold transition-all shadow-lg shadow-blue-900/20"
                                >
                                    CONNECT
                                </button>
                            ) : null}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-bold">
                            {status.behind > 0 && <span className="text-blue-400 flex items-center gap-1 bg-blue-900/20 px-1.5 py-0.5 rounded"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 19 19 12"></polyline></svg> {status.behind}</span>}
                            {status.ahead > 0 && <span className="text-emerald-400 flex items-center gap-1 bg-emerald-900/20 px-1.5 py-0.5 rounded"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 5 5 12"></polyline></svg> {status.ahead}</span>}
                        </div>
                    </div>
                </div>
            )}
            {/* Confirmation Modal for Connect */}
            {showConnectConfirm && (
                <ConfirmModal
                    title="Switch Connected Branch?"
                    description={`Warning: The branch [${currentSyncBranch || 'None'}] is currently connected to the remote database. If you connect [${status?.current}], all data of the remote branch will be REMOVED and replaced with this branch's data. Do you want to proceed?`}
                    confirmLabel="Connect & Sync Branch"
                    cancelLabel="Cancel"
                    isDanger={true}
                    onConfirm={async () => {
                        setShowConnectConfirm(false)
                        await syncNow(false, true, true)
                    }}
                    onCancel={() => setShowConnectConfirm(false)}
                />
            )}
        </aside>
    )
}

function FileItem({ path, fromPath, type, actionIcon, onAction, onDiscard, title, disabled }: any) {
    const fileName = path.split('/').pop() || path
    const dir = path.substring(0, path.lastIndexOf('/'))

    const color = type === 'M' ? '#EAB308' : type === 'U' ? '#10B981' : type === 'D' ? '#EF4444' : type === 'R' ? '#A855F7' : '#60A5FA'

    return (
        <div style={{ padding: '6px 16px' }} className="group flex items-center gap-2 hover:bg-[#1A1A1A] cursor-pointer transition-colors shrink-0">
            <span style={{ color, fontSize: '12px', fontWeight: 700, width: '12px', textAlign: 'center' }}>
                {type}
            </span>
            <div className="flex items-center flex-1 min-w-0" style={{ gap: '8px' }}>
                <span className="text-[13px] text-neutral-200 truncate" title={type === 'R' && fromPath ? `${fromPath} → ${path}` : path}>
                    {type === 'R' && fromPath ? `${fromPath.split('/').pop()} → ${fileName}` : fileName}
                </span>
                {dir && <span className="text-[11px] text-neutral-600 truncate opacity-60">{dir}</span>}
            </div>
            
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onDiscard && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); !disabled && onDiscard() }} 
                        disabled={disabled} 
                        className="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all" 
                        title="Discard"
                    >
                         <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                    </button>
                )}
                <button 
                    onClick={(e) => { e.stopPropagation(); !disabled && onAction() }} 
                    disabled={disabled} 
                    className="p-1.5 rounded hover:bg-white/10 text-neutral-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all" 
                    title={title}
                >
                    {actionIcon === 'plus' ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    )}
                </button>
            </div>
        </div>
    )
}
