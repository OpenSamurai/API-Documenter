import React, { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useProject, useUpdateProject } from '@/hooks/useProjects'

export function DeployProxyDialog() {
    const { currentProjectId, setShowDeploySettings } = useAppStore()
    const { data: project } = useProject(currentProjectId)
    const updateProject = useUpdateProject()

    const [deploying, setDeploying] = useState(false)
    const [deployOutput, setDeployOutput] = useState<string[]>([])
    const outputEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!deploying) return
        const cleanup = window.electronAPI.onDeployOutput((data: string) => {
            setDeployOutput(prev => [...prev.slice(-100), data])
        })
        return cleanup
    }, [deploying])

    useEffect(() => {
        if (outputEndRef.current) {
            outputEndRef.current.scrollIntoView({ behavior: 'smooth' })
        }
    }, [deployOutput])

    const handleDeploy = async () => {
        if (!project?.databaseUrl) return alert('Please configure a Database URL first.')
        setDeploying(true)
        setDeployOutput(['Initiating deployment...'])

        try {
            const res = (await window.electronAPI.deployToVercel({
                databaseUrl: project.databaseUrl,
                adminToken: 'secret_rbac_token_admin',
                projectId: currentProjectId!,
                projectName: project.name
            })) as any
            if (res.success) {
                const now = new Date().toISOString()
                setDeployOutput(prev => [...prev, '\n✅ Deployment successful!'])

                await updateProject.mutateAsync({
                    id: currentProjectId!,
                    proxyUrl: res.url || project.proxyUrl,
                    lastDeployedAt: now
                })
                setDeployOutput(prev => [...prev.slice(-100), '\n✅ Deployment successful and project updated!'])
            } else {
                setDeployOutput(prev => [...prev.slice(-100), `\n❌ Deployment failed: ${res.error}`])
            }
        } catch (err: any) {
            setDeployOutput(prev => [...prev.slice(-100), `\n❌ Critical error: ${err.message}`])
        } finally {
            setDeploying(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm" style={{ padding: '24px' }}>
            {/* Main Dialog Container */}
            <div
                className="w-full bg-[#0a0a0a] rounded-[16px] shadow-2xl flex flex-col overflow-hidden"
                style={{
                    maxWidth: '672px',
                    border: '1px solid #222'
                }}
            >
                {/* Header Section */}
                <div style={{ padding: '24px', borderBottom: '1px solid #222', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div className="rounded-lg bg-white/10 flex items-center justify-center border border-white/5 shrink-0" style={{ width: '32px', height: '32px' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                    <line x1="12" y1="22.08" x2="12" y2="12" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-semibold text-white tracking-tight" style={{ margin: 0 }}>Deploy Proxy Server</h2>
                        </div>
                        <button
                            onClick={() => setShowDeploySettings(false)}
                            className="text-neutral-500 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                            style={{ padding: '6px' }}
                        >
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="15" y1="5" x2="5" y2="15" /><line x1="5" y1="5" x2="15" y2="15" />
                            </svg>
                        </button>
                    </div>
                    <p className="text-sm text-neutral-400" style={{ margin: 0 }}>Provision your RBAC infrastructure to Vercel production</p>
                </div>

                {/* Body Content Area (Scrollable) */}
                <div className="custom-scrollbar" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '32px', overflowY: 'auto', maxHeight: '60vh' }}>

                    {/* Warning Banner */}
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl" style={{ padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                        <div className="shrink-0" style={{ marginTop: '2px' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="2.5">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                        </div>
                        <p className="text-[13.5px] text-neutral-300 leading-relaxed" style={{ margin: 0 }}>
                            Deploying to Vercel enables team sharing and RBAC enforcement. Ensure your <span className="text-white font-medium">Database URL</span> is configured before proceeding.
                        </p>
                    </div>

                    {/* Input Field Area */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest" style={{ margin: 0 }}>Proxy Endpoint</label>
                        <input
                            value={project?.proxyUrl || ''}
                            onChange={e => updateProject.mutate({ id: currentProjectId!, proxyUrl: e.target.value })}
                            placeholder="https://your-proxy.vercel.app"
                            className="bg-black border border-[#333] rounded-xl text-sm text-white font-mono outline-none focus:border-neutral-400 transition-colors placeholder:text-neutral-600"
                            style={{ width: '100%', padding: '16px' }}
                        />
                    </div>

                    {/* Call to Action Button */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <button
                            onClick={handleDeploy}
                            disabled={deploying || !project?.databaseUrl}
                            className={`rounded-xl font-bold text-[15px] transition-all flex items-center justify-center ${deploying
                                ? 'bg-[#222] text-neutral-400 cursor-wait'
                                : 'bg-white text-black hover:bg-neutral-200 active:scale-[0.99] disabled:opacity-30 disabled:hover:bg-white'
                                }`}
                            style={{ width: '100%', padding: '16px 24px', gap: '12px' }}
                        >
                            {deploying ? (
                                <>
                                    <div className="border-2 border-black/20 border-t-black rounded-full animate-spin" style={{ width: '20px', height: '20px' }} />
                                    <span>Deploying Core Infrastructure...</span>
                                </>
                            ) : (
                                <>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                        <polyline points="22 4 12 14.01 9 11.01" />
                                    </svg>
                                    <span>{project?.lastDeployedAt ? 'Redeploy Proxy Server' : 'Provision Production Proxy'}</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* System Information Grid */}
                    {project?.lastDeployedAt && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px', marginTop: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">Last Infrastructure Update</span>
                                <span className="text-sm text-white font-medium">
                                    {new Date(project.lastDeployedAt).toLocaleDateString()} at {new Date(project.lastDeployedAt).toLocaleTimeString()}
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest">Active Endpoint</span>
                                <span className="text-sm text-emerald-400 font-mono truncate" title={project.proxyUrl}>
                                    {project.proxyUrl?.replace('https://', '') || 'Not discovered'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Console Output */}
                    {((deployOutput && deployOutput.length > 0) || deploying) && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                            <label className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest" style={{ margin: 0 }}>Deployment Runtime</label>
                            <div className="bg-[#050505] border border-[#222] rounded-xl font-mono text-[11px] sm:text-xs text-neutral-400 custom-scrollbar" style={{ padding: '16px', height: '160px', overflowY: 'auto' }}>
                                {deployOutput.map((line, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                                        <span className="text-neutral-700 shrink-0">[{i.toString().padStart(2, '0')}]</span>
                                        <span className={`break-words ${line.includes('✅') ? 'text-emerald-400' : line.includes('❌') ? 'text-red-400' : 'text-neutral-300'}`}>
                                            {line}
                                        </span>
                                    </div>
                                ))}
                                <div ref={outputEndRef} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Section */}
                <div className="bg-black/40 text-xs flex-wrap" style={{ padding: '20px 24px', borderTop: '1px solid #222', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="font-bold text-neutral-500 uppercase tracking-widest text-[10px]">Cloud Target</span>
                        <span className="font-mono text-neutral-300 bg-white/5 rounded border border-white/10" style={{ padding: '4px 8px' }}>vercel-production</span>
                    </div>
                    <div className="text-neutral-400" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" style={{ width: '6px', height: '6px' }} />
                        <span>Vercel API connection healthy</span>
                    </div>
                </div>
            </div>
        </div>
    )
}