import React, { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { db } from '@/db'
import { useQueryClient } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import type { SavedTeamConnection } from '@/types'

export function TeamConnectDialog() {
    const { setShowTeamConnect, setProxyConnection } = useAppStore()
    const qc = useQueryClient()
    const [name, setName] = useState('')
    const [url, setUrl] = useState('')
    const [token, setToken] = useState('')
    const [projectId, setProjectId] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const savedConnections = useLiveQuery(
        () => db.teamConnections.orderBy('lastUsedAt').reverse().toArray()
    )

    const handleConnect = async (manualData?: { url: string; token: string; projectId: string; name?: string }) => {
        const connectUrl = manualData?.url || url
        const connectToken = manualData?.token || token
        const connectProjectId = manualData?.projectId || projectId
        const connectName = manualData?.name || name || 'Shared Project'

        if (!connectUrl || !connectToken || !connectProjectId) return
        setLoading(true)
        setError(null)

        try {
            const res = await (window as any).electronAPI.sendHttpRequest({
                url: `${connectUrl}/api/folders?projectId=${connectProjectId}`,
                method: 'GET',
                headers: { 'Authorization': `Bearer ${connectToken}` }
            })

            if (!res.success) throw new Error(res.error || 'Failed to connect: Invalid URL, Token, or Project ID')

            // Save to connection history
            await db.teamConnections.put({
                id: connectProjectId, // Use project ID as ID to avoid duplicates for same project
                name: connectName,
                url: connectUrl,
                token: connectToken,
                projectId: connectProjectId,
                lastUsedAt: new Date().toISOString()
            })

            setProxyConnection({
                proxyUrl: connectUrl,
                token: connectToken,
                connected: true
            })

            const { setTeamWorkspace } = useAppStore.getState()
            setTeamWorkspace(true, { url: connectUrl, token: connectToken, projectId: connectProjectId })

            setShowTeamConnect(false)
            qc.invalidateQueries()

        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const loadSaved = (conn: SavedTeamConnection) => {
        setName(conn.name)
        setUrl(conn.url)
        setToken(conn.token)
        setProjectId(conn.projectId)
    }

    const deleteSaved = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        await db.teamConnections.delete(id)
    }

    return (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
            <div
                className="w-full bg-[#0a0a0a] rounded-[16px] shadow-2xl scale-in"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    maxWidth: 'min(850px, 92vw)',
                    height: 'min(700px, 90vh)',
                    border: '1px solid #222',
                    overflow: 'hidden'
                }}
            >
                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

                    {/* Left Panel: History */}
                    <div style={{ width: '300px', flexShrink: 0, borderRight: '1px solid #222', background: 'rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '24px', borderBottom: '1px solid #222', flexShrink: 0 }}>
                            <h3 style={{ fontSize: 'calc(11px * var(--font-scale))', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Recent Connections</h3>
                        </div>
                        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column' }}>
                            {savedConnections?.length === 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', padding: '24px', opacity: 0.4 }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ marginBottom: '12px' }}>
                                        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p style={{ fontSize: 'calc(12px * var(--font-scale))', margin: 0 }}>No saved connections yet</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {savedConnections?.map(conn => (
                                        <div
                                            key={conn.id}
                                            onClick={() => loadSaved(conn)}
                                            className="group hover:border-white/10 hover:bg-white/5 transition-all"
                                            style={{ padding: '12px', borderRadius: '12px', border: '1px solid transparent', cursor: 'pointer' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                                <div style={{ minWidth: 0 }}>
                                                    <p style={{ fontSize: 'calc(14px * var(--font-scale))', fontWeight: 600, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{conn.name}</p>
                                                    <p style={{ fontSize: 'calc(10px * var(--font-scale))', color: '#71717A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '4px 0 0 0' }}>{conn.url}</p>
                                                </div>
                                                <button
                                                    onClick={(e) => deleteSaved(e, conn.id)}
                                                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                                                    style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#71717A', flexShrink: 0 }}
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                        <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Panel: Form */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#0a0a0a' }}>
                        
                        {/* Header Section */}
                        <div style={{ padding: '24px', borderBottom: '1px solid #222', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                    <div className="rounded-lg bg-white/10 border border-white/5" style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" />
                                        </svg>
                                    </div>
                                    <h2 style={{ fontSize: 'calc(20px * var(--font-scale))', fontWeight: 600, color: 'white', letterSpacing: '-0.02em', margin: 0 }}>Join Team Project</h2>
                                </div>
                                <button
                                    onClick={() => setShowTeamConnect(false)}
                                    className="text-neutral-500 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                                    style={{ padding: '6px', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                                >
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                        <line x1="15" y1="5" x2="5" y2="15" /><line x1="5" y1="5" x2="15" y2="15" />
                                    </svg>
                                </button>
                            </div>
                            <p style={{ fontSize: 'calc(14px * var(--font-scale))', color: '#9CA3AF', margin: 0 }}>Connect to a shared governance environment via Proxy URL</p>
                        </div>

                        {/* Body Content Area (Scrollable) */}
                        <div className="custom-scrollbar" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '24px', flex: 1, overflowY: 'auto' }}>

                            {/* Inputs Group */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: 'calc(10px * var(--font-scale))', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Connection Name (Local Label)</label>
                                    <input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="e.g. My Team - Production"
                                        className="bg-black border border-[#333] rounded-xl text-white outline-none focus:border-neutral-400 transition-colors placeholder:text-neutral-600"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', fontSize: 'calc(14px * var(--font-scale))' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: 'calc(10px * var(--font-scale))', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Proxy Endpoint URL</label>
                                    <input
                                        value={url}
                                        onChange={e => setUrl(e.target.value)}
                                        placeholder="https://api-proxy.vercel.app"
                                        className="bg-black border border-[#333] rounded-xl text-white font-mono outline-none focus:border-neutral-400 transition-colors placeholder:text-neutral-600"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', fontSize: 'calc(14px * var(--font-scale))' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: 'calc(10px * var(--font-scale))', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Project ID</label>
                                    <input
                                        value={projectId}
                                        onChange={e => setProjectId(e.target.value)}
                                        placeholder="a717a2e5-3b99-437a-a46c-4199d27cba8e"
                                        className="bg-black border border-[#333] rounded-xl text-white font-mono outline-none focus:border-neutral-400 transition-colors placeholder:text-neutral-600"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', fontSize: 'calc(14px * var(--font-scale))' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <label style={{ fontSize: 'calc(10px * var(--font-scale))', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Access Token</label>
                                    <input
                                        value={token}
                                        onChange={e => setToken(e.target.value)}
                                        type="password"
                                        placeholder="••••••••••••••••••••••••••••••••"
                                        className="bg-black border border-[#333] rounded-xl text-white font-mono outline-none focus:border-neutral-400 transition-colors placeholder:text-neutral-600"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', fontSize: 'calc(14px * var(--font-scale))' }}
                                    />
                                </div>
                            </div>

                            {/* Error Banner */}
                            {error && (
                                <div
                                    className="bg-red-500/5 border border-red-500/10 rounded-xl text-red-400 animate-in fade-in"
                                    style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                    <span style={{ fontSize: 'calc(13px * var(--font-scale))', lineHeight: 1.4 }}>{error}</span>
                                </div>
                            )}

                        </div>

                        {/* Anchored Action Buttons (Fixed at Bottom) */}
                        <div style={{ flexShrink: 0, padding: '24px 32px', borderTop: '1px solid #222', display: 'flex', gap: '16px', background: '#0a0a0a' }}>
                            <button
                                onClick={() => setShowTeamConnect(false)}
                                className="border border-[#333] text-neutral-400 hover:bg-white/5 hover:text-white transition-all active:scale-[0.98]"
                                style={{ flex: 1, padding: '12px', fontSize: 'calc(14px * var(--font-scale))', fontWeight: 700, borderRadius: '12px', background: 'transparent', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleConnect()}
                                disabled={loading || !url || !token || !projectId}
                                className={`transition-all shadow-lg active:scale-[0.98] ${loading || !url || !token || !projectId
                                    ? 'bg-[#222] text-neutral-400 cursor-not-allowed opacity-50'
                                    : 'bg-white text-black hover:bg-neutral-200 cursor-pointer'
                                    }`}
                                style={{ flex: 2, padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', fontSize: 'calc(14px * var(--font-scale))', fontWeight: 700, borderRadius: '12px', border: 'none' }}
                            >
                                {loading ? (
                                    <>
                                        <div className="border-2 border-black/20 border-t-black rounded-full animate-spin" style={{ width: '16px', height: '16px' }} />
                                        <span>Authenticating...</span>
                                    </>
                                ) : (
                                    'Connect & Save'
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* System Footer Bar */}
                <div className="bg-[#050505]" style={{ flexShrink: 0, padding: '12px 24px', borderTop: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="rounded-full bg-green-500/50" style={{ width: '6px', height: '6px' }} />
                        <span style={{ fontSize: 'calc(10px * var(--font-scale))', fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Persistence layer active</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="rounded-full bg-neutral-700" style={{ width: '6px', height: '6px' }} />
                        <span style={{ fontSize: 'calc(10px * var(--font-scale))', fontWeight: 600, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Securely stored in local DB</span>
                    </div>
                </div>
            </div>
        </div>
    )
}