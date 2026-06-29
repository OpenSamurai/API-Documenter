import React from 'react'
import { useAppStore } from '@/stores/appStore'
import { useProjects } from '@/hooks/useProjects'
import icon from '@/assets/icon.jpg'

interface Props { hasProject: boolean }

export function EmptyState({ hasProject }: Props) {
    const { setShowCreateProject, isOnline, selectProject } = useAppStore()
    const { data: projects } = useProjects()
    const [recentProjects, setRecentProjects] = React.useState<any[]>([])

    React.useEffect(() => {
        if (!hasProject) {
            (window as any).electronAPI.getRecentProjects().then(setRecentProjects)
        }
    }, [hasProject])

    const validRecentProjects = React.useMemo(() => {
        if (!projects || !recentProjects) return []
        return recentProjects.filter(rp => projects.some(p => p.id === rp.id))
    }, [recentProjects, projects])

    if (hasProject) {
        return (
            <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #1F1F1F', background: '#111111', marginBottom: '8px', boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.2)' }}>
                    <img src={icon} alt="API Documenter" style={{ width: '28px', height: '28px' }} />
                </div>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'white', letterSpacing: '-0.025em', margin: 0 }}>Select an endpoint</h2>
                <p style={{ fontSize: '13px', color: '#6B7280', textAlign: 'center', maxWidth: '300px', margin: 0, lineHeight: 1.5 }}>
                    Choose an API endpoint from the sidebar to start documenting.
                </p>
            </div>
        )
    }

    return (
        <div className="grid-bg" style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', overflow: 'hidden' }}>

            {/* 1. Subtle depth glow behind content */}
            <div
                style={{
                    position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                    width: '800px', height: '800px', pointerEvents: 'none',
                    background: 'radial-gradient(circle at center, rgba(255,255,255,0.02) 0%, transparent 60%)'
                }}
            />

            {/* Main Content Stack */}
            <div className="fade-up" style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: '600px', width: '100%', padding: '0 32px' }}>

                {/* 2. Hero Identity Mark */}
                <div className="group cursor-default" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {/* <div
                        className="transition-all duration-500 group-hover:scale-[1.02] group-hover:-translate-y-1"
                        style={{
                            width: '100px', height: '100px', borderRadius: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',


                            boxShadow: 'inset 0 0 20px rgba(255,255,255,0.03), 0 20px 50px rgba(0,0,0,0.6)'
                        }}
                    > */}
                        {/* Soft inner glow */}
                        {/* <div
                            style={{
                                position: 'absolute', top: '1px', left: '1px', right: '1px', bottom: '1px',
                                borderRadius: '27px', background: 'linear-gradient(to bottom right, rgba(255,255,255,0.1), transparent)',
                                opacity: 0, pointerEvents: 'none',
                                overflow: 'hidden'
                            }}
                        />
                        <img src={icon} alt="Logo" style={{ zIndex: 10 }} />
                    </div> */}

                    <div style={{ width: '100px', height: '100px', borderRadius: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', boxShadow: 'inset 0 0 20px rgba(255,255,255,0.03), 0 20px 50px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
                        <img src={icon} alt="Logo" style={{ zIndex: 10, width: '100px', height: '100px' }} />
                    </div>
                </div>

                {/* 3. Messaging Hierarchy */}
                <div style={{ textAlign: 'center', marginBottom: '24px', marginTop: '10px' }}>
                    <h1 style={{ fontSize: '32px', fontWeight: 600, color: 'white', letterSpacing: '-0.04em', marginBottom: '12px', lineHeight: 1, margin: '0 0 12px 0' }}>
                        Welcome to API Documenter
                    </h1>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                        <p style={{ fontSize: '17px', fontWeight: 500, color: 'rgba(255,255,255,0.95)', letterSpacing: '-0.01em', margin: 0 }}>
                            A privacy-first, offline API documentation tool.
                        </p>
                        <p style={{ fontSize: '14px', color: '#9CA3AF', maxWidth: '360px', lineHeight: 1.6, margin: 0 }}>
                            Built for developers. Your data never leaves your machine.
                        </p>
                    </div>
                </div>

                {/* 4. Decisive CTA Authority */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', marginBottom: '32px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <button
                            onClick={() => setShowCreateProject(true)}
                            className="group transition-all hover:scale-[1.03] active:scale-[0.98]"
                            style={{
                                position: 'relative', display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '14px 40px', borderRadius: '12px', fontWeight: 600, fontSize: '15px',
                                background: '#FFFFFF', color: '#000000', marginTop: '10px'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.boxShadow = '0 0 30px rgba(255,255,255,0.15), 0 4px 12px rgba(0,0,0,0.2)'
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.boxShadow = 'none'
                            }}>
                            Create Project
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* 4.5. Recent Projects */}
                {validRecentProjects.length > 0 && (
                    <div style={{ width: '100%', maxWidth: '400px', marginBottom: '32px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <h3 style={{ fontSize: '13px', fontWeight: 600, color: '#9CA3AF', margin: '0 0 4px 8px', letterSpacing: '0.025em' }}>Recent Projects</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', paddingRight: '8px' }} className="custom-scrollbar">
                            {validRecentProjects.slice(0, 3).map(p => (
                                <button key={p.id}
                                    onClick={() => {
                                        selectProject(p.id)
                                        ;(window as any).electronAPI.addRecentProject({ id: p.id, name: p.name, localPath: p.localPath })
                                    }}
                                    className="group transition-all"
                                    style={{ 
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '12px 16px', borderRadius: '10px', border: '1px solid #1F1F1F',
                                        background: 'rgba(255,255,255,0.02)', color: '#FFFFFF', cursor: 'pointer',
                                        textAlign: 'left'
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = '#333333' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = '#1F1F1F' }}
                                >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                                        <span style={{ fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                        {p.localPath && (
                                            <span style={{ fontSize: '11px', color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.localPath}</span>
                                        )}
                                    </div>
                                    <svg style={{ flexShrink: 0, color: '#4B5563', transition: 'color 150ms ease, transform 150ms ease' }} className="group-hover:text-white group-hover:translate-x-1" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 5. Feature Highlights */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                    <p style={{ fontSize: '11px', color: '#3F3F3F', fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'default', margin: 0 }}>
                        No cloud · No tracking · No lock-in
                    </p>

                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px' }}>
                        {['Self-Hosted', 'Offline-First', '1-Click Docs', 'Folder RBAC'].map(f => (
                            <div key={f}
                                className="transition-all hover:border-white/40 hover:text-white cursor-default"
                                style={{
                                    padding: '8px 20px', borderRadius: '9999px', border: '1px solid #1F1F1F',
                                    background: 'rgba(17,17,17,0.3)', color: '#A1A1A1', fontSize: '13px', fontWeight: 500, letterSpacing: '0.025em'
                                }}>
                                {f}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 6. Polished Status Bar */}
            <div
                className="transition-colors hover:text-[#444]"
                style={{ position: 'absolute', bottom: '32px', left: '40px', fontSize: '9px', fontFamily: 'monospace', color: '#2A2A2A', textTransform: 'uppercase', letterSpacing: '0.3em', cursor: 'default' }}
            >
                v1.0.0 · Local Dev Build
            </div>

            <div style={{ position: 'absolute', bottom: '32px', right: '40px', display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(17,17,17,0.5)', padding: '6px 12px', borderRadius: '9999px', border: '1px solid rgba(31,31,31,0.5)' }}>
                <div
                    className="status-dot pulse"
                    style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: isOnline ? 'rgba(16,185,129,0.8)' : 'rgba(245,158,11,0.8)',
                        boxShadow: isOnline ? '0 0 8px rgba(16,185,129,0.3)' : 'none'
                    }}
                />
                <span style={{ fontSize: '9px', fontFamily: 'monospace', fontWeight: 700, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                    {isOnline ? 'System Online' : 'Local Mode'}
                </span>
            </div>
        </div>
    )
}