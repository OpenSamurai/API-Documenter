import React, { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useProject, useUpdateProject, triggerFullProjectSync } from '@/hooks/useProjects'
import { useQueryClient } from '@tanstack/react-query'

export function DatabaseSettingsDialog() {
    const { currentProjectId, setShowDatabaseSettings, activeBranch } = useAppStore()
    const { data: project } = useProject(currentProjectId)
    const updateProject = useUpdateProject()
    const qc = useQueryClient()

    const [dbUrl, setDbUrl] = useState(project?.databaseUrl || '')
    const [inputMode, setInputMode] = useState<'url' | 'form'>('url')
    const [testing, setTesting] = useState(false)
    const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)

    // Form state
    const [formData, setFormData] = useState({
        type: 'mysql',
        host: 'localhost',
        port: '3306',
        user: 'root',
        password: '',
        database: ''
    })

    // Initial load and sync
    useEffect(() => {
        if (project?.databaseUrl) {
            setDbUrl(project.databaseUrl)
            parseAndSetForm(project.databaseUrl)
        }
    }, [project?.id, project?.databaseUrl])

    const parseAndSetForm = (url: string) => {
        try {
            const matches = url.match(/^(mysql|postgres(?:ql)?):\/\/(.*?):(.*?)@(.*?):(\d+)\/(.*)$/)
            if (matches) {
                setFormData({
                    type: matches[1].startsWith('postgres') ? 'postgres' : 'mysql',
                    user: decodeURIComponent(matches[2]),
                    password: decodeURIComponent(matches[3]),
                    host: matches[4],
                    port: matches[5],
                    database: matches[6]
                })
            }
        } catch (e) {
            console.warn('Failed to parse DB URL into form:', e)
        }
    }

    const constructUrl = (data: typeof formData) => {
        const protocol = data.type === 'mysql' ? 'mysql' : 'postgres'
        const user = encodeURIComponent(data.user)
        const pass = encodeURIComponent(data.password)
        const url = `${protocol}://${user}:${pass}@${data.host}:${data.port}/${data.database}`
        setDbUrl(url)
        return url
    }

    const handleFormChange = (key: keyof typeof formData, value: string) => {
        const newData = { ...formData, [key]: value }
        // Default ports
        if (key === 'type') {
            newData.port = value === 'mysql' ? '3306' : '5432'
        }
        setFormData(newData)
        constructUrl(newData)
    }

    const handleTest = async () => {
        setTesting(true)
        const res = await window.electronAPI.testDbConnection(dbUrl)
        setTestResult(res)
        setTesting(false)
        if (res.success) {
            updateProject.mutate({ id: currentProjectId!, databaseUrl: dbUrl })
        }
    }

    const handleSync = async () => {
        setTesting(true)
        try {
            if (project) {
                // Always ensure latest URL is saved before sync
                await updateProject.mutateAsync({ id: currentProjectId!, databaseUrl: dbUrl })
                await triggerFullProjectSync(qc, { ...project, databaseUrl: dbUrl }, activeBranch || 'main')
                setTestResult({ success: true })
                setShowDatabaseSettings(false)
            }
        } catch (err: any) {
            setTestResult({ success: false, error: err.message })
        }
        setTesting(false)
    }

    return (
        <div
            className="animate-in fade-in duration-300"
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', padding: '24px'
            }}
        >
            <div
                className="scale-in"
                style={{
                    width: '100%', maxWidth: '600px', background: '#0a0a0a',
                    borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #222'
                }}
            >
                {/* Header Section */}
                <div style={{ padding: '24px', borderBottom: '1px solid #222', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><circle cx="12" cy="11" r="3" />
                                </svg>
                            </div>
                            <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'white', letterSpacing: '-0.02em', margin: 0 }}>Database Settings</h2>
                        </div>
                        <button onClick={() => setShowDatabaseSettings(false)}
                            style={{ padding: '6px', color: '#737373', background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'all 150ms ease' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#737373'; e.currentTarget.style.background = 'transparent' }}
                        >
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="15" y1="5" x2="5" y2="15" /><line x1="5" y1="5" x2="15" y2="15" />
                            </svg>
                        </button>
                    </div>
                    <p style={{ fontSize: '14px', color: '#9CA3AF', margin: 0 }}>Configure external persistence and remote project synchronization</p>
                </div>

                {/* Mode Tabs */}
                <div style={{ display: 'flex', gap: '4px', background: '#111', padding: '4px', margin: '24px 24px 0', borderRadius: '12px', border: '1px solid #222' }}>
                    <button
                        onClick={() => setInputMode('url')}
                        style={{
                            ...(inputMode === 'url' ? { background: 'rgba(255,255,255,0.1)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' } : { background: 'transparent', color: '#737373', border: '1px solid transparent' })
                        }}
                    >
                        Direct URL
                    </button>
                    <button
                        onClick={() => setInputMode('form')}
                        style={{
                            ...(inputMode === 'form' ? { background: 'rgba(255,255,255,0.1)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' } : { background: 'transparent', color: '#737373', border: '1px solid transparent' })
                        }}
                    >
                        Connection Form
                    </button>
                </div>

                {/* Body Content Area */}
                <div className="custom-scrollbar" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px', overflowY: 'auto', maxHeight: '60vh' }}>

                    {inputMode === 'url' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <label style={{ fontSize: '11px', fontWeight: 700, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Database Connection URL</label>
                            <input
                                value={dbUrl}
                                onChange={e => {
                                    setDbUrl(e.target.value)
                                    parseAndSetForm(e.target.value)
                                }}
                                placeholder="mysql://user:pass@host:3306/db"
                                style={{ width: '100%', boxSizing: 'border-box', padding: '16px', background: '#000000', border: '1px solid #333', borderRadius: '12px', fontSize: '14px', color: '#FFFFFF', fontFamily: 'monospace', outline: 'none', transition: 'border-color 150ms ease' }}
                                onFocus={e => e.currentTarget.style.borderColor = '#9CA3AF'}
                                onBlur={e => e.currentTarget.style.borderColor = '#333'}
                            />
                            <p style={{ fontSize: '12px', color: '#737373', margin: '4px 0 0 4px' }}>
                                Tip: Clearing this field will revert storage to your local SQLite instance.
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 700, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Database Type</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {['mysql', 'postgres'].map(t => (
                                        <button
                                            key={t}
                                            onClick={() => handleFormChange('type', t)}
                                            style={{
                                                flex: 1, padding: '12px 0', borderRadius: '12px', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', transition: 'all 150ms ease', cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                                                ...(formData.type === t ? { border: '1px solid #A3A3A3', background: 'rgba(255,255,255,0.05)', color: '#FFFFFF' } : { border: '1px solid #222', background: 'transparent', color: '#737373' })
                                            }}
                                        >
                                            <img
                                                src={t === 'mysql'
                                                    ? 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/mysql/mysql-original.svg'
                                                    : 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/postgresql/postgresql-original.svg'
                                                }
                                                alt={`${t} logo`}
                                                style={{
                                                    width: '16px', height: '16px',
                                                    filter: formData.type === t ? 'grayscale(0%) opacity(100%)' : 'grayscale(100%) opacity(40%)',
                                                    transition: 'all 150ms ease'
                                                }}
                                            />
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Field label="Host" value={formData.host} onChange={v => handleFormChange('host', v)} placeholder="localhost" />
                            <Field label="Port" value={formData.port} onChange={v => handleFormChange('port', v)} placeholder="3306" />
                            <Field label="Username" value={formData.user} onChange={v => handleFormChange('user', v)} placeholder="root" />
                            <Field label="Password" type="password" value={formData.password} onChange={v => handleFormChange('password', v)} placeholder="********" />
                            <div style={{ gridColumn: 'span 2' }}>
                                <Field label="Database Name" value={formData.database} onChange={v => handleFormChange('database', v)} placeholder="my_project_db" />
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '8px' }}>
                        <button
                            onClick={handleTest}
                            disabled={testing || !dbUrl}
                            className={testing || !dbUrl ? '' : 'active:scale-[0.98]'}
                            style={{
                                padding: '14px', background: '#FFFFFF', color: '#000000', fontSize: '13px', fontWeight: 700, borderRadius: '12px', transition: 'all 150ms ease', border: 'none', cursor: testing || !dbUrl ? 'not-allowed' : 'pointer',
                                opacity: testing || !dbUrl ? 0.2 : 1, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                            }}
                        >
                            {testing ? 'Verifying...' : 'Test Connection'}
                        </button>

                        <button
                            onClick={handleSync}
                            disabled={testing || !dbUrl}
                            className={testing || !dbUrl ? '' : 'active:scale-[0.98]'}
                            style={{
                                padding: '14px', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', color: '#60a5fa', fontSize: '13px', fontWeight: 700, borderRadius: '12px', transition: 'all 150ms ease', cursor: testing || !dbUrl ? 'not-allowed' : 'pointer',
                                opacity: testing || !dbUrl ? 0.2 : 1
                            }}
                            onMouseEnter={e => { if (!testing && dbUrl) e.currentTarget.style.background = 'rgba(37,99,235,0.2)' }}
                            onMouseLeave={e => { if (!testing && dbUrl) e.currentTarget.style.background = 'rgba(37,99,235,0.1)' }}
                        >
                            {project?.databaseUrl === dbUrl && dbUrl ? 'Sync Now' : 'Connect & Sync'}
                        </button>
                    </div>

                    {testResult && (
                        <div
                            className="animate-in fade-in slide-in-from-top-2 duration-300"
                            style={{
                                padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px', borderRadius: '12px',
                                ...(testResult.success ? { background: 'rgba(16,185,129,0.05)', color: '#34d399', border: '1px solid rgba(16,185,129,0.1)' } : { background: 'rgba(239,68,68,0.05)', color: '#f87171', border: '1px solid rgba(239,68,68,0.1)' })
                            }}
                        >
                            <div
                                style={{
                                    width: '28px', height: '28px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    background: testResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
                                }}
                            >
                                {testResult.success ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                    {testResult.success ? 'Verification Successful' : 'Verification Failed'}
                                </span>
                                <span style={{ fontSize: '12px', color: '#A3A3A3', opacity: 0.8 }}>
                                    {testResult.success ? 'Connection stable and synchronized.' : testResult.error}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Bar */}
                <div style={{ padding: '16px 24px', borderTop: '1px solid #222', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontWeight: 700, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '9px' }}>Active Cloud Bridge</span>
                        <span style={{ fontFamily: 'monospace', fontSize: '10px', color: '#D4D4D8', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', padding: '4px 8px' }}>
                            {dbUrl.split(':')[0] || 'offline'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string, value: string, onChange: (v: string) => void, placeholder: string, type?: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>{label}</label>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                style={{ width: '100%', boxSizing: 'border-box', height: '44px', padding: '0 16px', background: '#000000', border: '1px solid #222', borderRadius: '12px', fontSize: '14px', color: '#FFFFFF', fontWeight: 500, outline: 'none', transition: 'border-color 150ms ease' }}
                onFocus={e => e.currentTarget.style.borderColor = '#737373'}
                onBlur={e => e.currentTarget.style.borderColor = '#222'}
            />
        </div>
    )
}