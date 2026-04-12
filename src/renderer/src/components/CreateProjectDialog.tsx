import { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useProjects, useCreateProject, useImportProject } from '@/hooks/useProjects'

export function CreateProjectDialog() {
    const { setShowCreateProject, selectProject } = useAppStore()
    const { data: localProjects = [] } = useProjects()
    const create = useCreateProject()
    const importProj = useImportProject()

    // Tab state
    const [tab, setTab] = useState<'create' | 'import'>('create')

    // Create state
    const [name, setName] = useState('')

    // Import state
    const [dbUrl, setDbUrl] = useState('')
    const [remoteProjects, setRemoteProjects] = useState<any[]>([])
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
    const [isLoadingProjects, setIsLoadingProjects] = useState(false)
    const [importError, setImportError] = useState('')
    const [infoMessage, setInfoMessage] = useState('')

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
        window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
    }, [])

    const close = () => setShowCreateProject(false)

    const fetchRemoteProjects = async () => {
        if (!dbUrl.trim()) return
        setIsLoadingProjects(true)
        setImportError('')
        setInfoMessage('')
        try {
            const res = await (window as any).electronAPI.getRemoteProjects(dbUrl.trim())
            if (res.success) {
                const localIds = new Set(localProjects.map(p => p.id))
                const filtered = (res.projects || []).filter((p: any) => !localIds.has(p.id))

                setRemoteProjects(filtered)
                if (filtered.length > 0) {
                    setSelectedProjectId(filtered[0].id)
                } else {
                    setSelectedProjectId(null)
                    if (res.projects?.length > 0) {
                        setInfoMessage('All projects in this database are already imported locally.')
                    } else {
                        setInfoMessage('No projects found in this database.')
                    }
                }
            } else {
                setImportError(res.error || 'Failed to connect to database')
                setRemoteProjects([])
            }
        } catch (err) {
            console.error('[ImportProject] fetchRemoteProjects failed:', err)
            setImportError('Failed to fetch projects. Check your database URL.')
        } finally {
            setIsLoadingProjects(false)
        }
    }

    const submit = async () => {
        if (tab === 'create') {
            if (!name.trim()) return
            const p = await create.mutateAsync({ name: name.trim() })
            selectProject(p.id); close()
        } else {
            if (!selectedProjectId || !dbUrl.trim()) return
            const selectedMatch = remoteProjects.find(p => p.id === selectedProjectId)
            if (!selectedMatch) return
            try {
                const p = await importProj.mutateAsync({
                    url: dbUrl.trim(),
                    projectId: selectedProjectId,
                    name: selectedMatch.name
                })
                selectProject(p.id); close()
            } catch (err: any) {
                console.error('[ImportProject] import failed:', err)
                setImportError(err.message || 'Import failed')
            }
        }
    }

    const canSubmit = tab === 'create' ? !!name.trim() : !!selectedProjectId

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', animation: 'fadeIn 180ms ease-out' }}
            onClick={close}>

            <div onClick={e => e.stopPropagation()}
                style={{
                    background: '#111111', border: '1px solid #1F1F1F', borderRadius: 16,
                    padding: 28, width: 520, maxWidth: '90vw',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                    animation: 'modalIn 180ms ease-out'
                }}>

                {/* Header */}
                <div className="flex justify-between items-start">
                    <div>
                        <h2 style={{ fontSize: 'calc(20px * var(--font-scale))', fontWeight: 600, color: 'white', margin: 0 }}>{tab === 'create' ? 'New Project' : 'Import Project'}</h2>
                        <p style={{ fontSize: 'calc(13px * var(--font-scale))', marginTop: '4px', color: '#9CA3AF', margin: 0 }}>
                            {tab === 'create' ? 'Create a fresh local project' : 'Import an existing project from a database'}
                        </p>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '24px', background: '#0A0A0A', padding: '4px', borderRadius: '12px', border: '1px solid #1F1F1F' }}>
                    <button
                        onClick={() => setTab('create')}
                        style={{
                            flex: 1, padding: '8px', fontSize: 'calc(13px * var(--font-scale))', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            background: tab === 'create' ? '#1F1F1F' : 'transparent',
                            color: tab === 'create' ? '#FFF' : '#6B7280',
                            transition: 'all 150ms'
                        }}>
                        New Project
                    </button>
                    <button
                        onClick={() => setTab('import')}
                        style={{
                            flex: 1, padding: '8px', fontSize: 'calc(13px * var(--font-scale))', borderRadius: '8px', border: 'none', cursor: 'pointer',
                            background: tab === 'import' ? '#1F1F1F' : 'transparent',
                            color: tab === 'import' ? '#FFF' : '#6B7280',
                            transition: 'all 150ms'
                        }}>
                        Import from DB
                    </button>
                </div>

                {/* Fields */}
                <div style={{ marginTop: 24, minHeight: '120px' }}>
                    {tab === 'create' ? (
                        <div>
                            <FieldLabel text="Project Name" required />
                            <FieldInput value={name} onChange={setName} placeholder="My API" autoFocus onSubmit={submit} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <FieldLabel text="Database URL" required hint="mysql:// or postgres://" />
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <FieldInput
                                        value={dbUrl}
                                        onChange={setDbUrl}
                                        placeholder="mysql://user:pass@host/db"
                                        mono
                                        onSubmit={fetchRemoteProjects}
                                    />
                                    <button
                                        onClick={fetchRemoteProjects}
                                        disabled={isLoadingProjects || !dbUrl.trim()}
                                        style={{
                                            padding: '0 16px', borderRadius: '10px', background: '#1F1F1F', color: '#FFF',
                                            border: '1px solid #2A2A2A', cursor: 'pointer', fontSize: '13px', fontWeight: 500
                                        }}>
                                        {isLoadingProjects ? '...' : 'Fetch'}
                                    </button>
                                </div>
                            </div>

                            {remoteProjects.length > 0 && (
                                <div>
                                    <FieldLabel text="Select Project" required />
                                    <div style={{ background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: 10, overflow: 'hidden' }}>
                                        {remoteProjects.map(p => (
                                            <div
                                                key={p.id}
                                                onClick={() => setSelectedProjectId(p.id)}
                                                style={{
                                                    padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #1F1F1F',
                                                    background: selectedProjectId === p.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                                                    display: 'flex', alignItems: 'center', gap: '10px'
                                                }}>
                                                <div style={{
                                                    width: '14px', height: '14px', borderRadius: '50%', border: '1px solid #6B7280',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    {selectedProjectId === p.id && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FFF' }} />}
                                                </div>
                                                <span style={{ fontSize: '14px', color: '#FFF' }}>{p.name}</span>
                                                <span style={{ fontSize: '11px', color: '#4B5563', marginLeft: 'auto' }}>ID: {p.id.slice(0, 8)}...</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {infoMessage && (
                                <p style={{ fontSize: '12px', color: '#9CA3AF', margin: 0 }}>{infoMessage}</p>
                            )}

                            {importError && (
                                <p style={{ fontSize: '12px', color: '#EF4444', margin: 0 }}>{importError}</p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ marginTop: 28, borderTop: '1px solid #1F1F1F', paddingTop: 20 }}>
                    <div className="flex justify-end gap-3">
                        <SecondaryBtn onClick={close}>Cancel</SecondaryBtn>
                        <PrimaryBtn
                            onClick={submit}
                            disabled={!canSubmit || importProj.isPending || create.isPending}
                        >
                            {create.isPending || importProj.isPending ? 'Processing...' : (tab === 'create' ? 'Create Project' : 'Import Project')}
                        </PrimaryBtn>
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ═══ Shared field components ═══ */

function FieldLabel({ text, required, hint }: { text: string; required?: boolean; hint?: string }) {
    return (
        <label className="flex items-baseline gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em]"
            style={{ color: '#6B7280', marginBottom: 6 }}>
            {text}{required && <span className="text-white">*</span>}
            {hint && <span className="normal-case tracking-normal font-normal text-[11px]" style={{ color: '#4B5563' }}>({hint})</span>}
        </label>
    )
}

function FieldInput({ value, onChange, placeholder, autoFocus, onSubmit, mono }: {
    value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; onSubmit?: () => void; mono?: boolean
}) {
    return (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
            onKeyDown={e => e.key === 'Enter' && onSubmit?.()}
            className={mono ? 'font-mono' : ''}
            style={{
                width: '100%', height: 42, padding: '0 14px', fontSize: mono ? 12 : 14,
                background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: 10,
                color: '#FFFFFF', outline: 'none', transition: '150ms ease'
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#FFFFFF'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.1)' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#2A2A2A'; e.currentTarget.style.boxShadow = 'none' }} />
    )
}

function SecondaryBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
    return (
        <button onClick={onClick} className="text-[13px] font-medium"
            style={{ padding: '8px 16px', borderRadius: 10, color: '#A1A1A1', background: 'transparent', transition: '150ms ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1A1A1A'; e.currentTarget.style.color = '#FFFFFF' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A1A1A1' }}>
            {children}
        </button>
    )
}

function PrimaryBtn({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled: boolean }) {
    return (
        <button onClick={onClick} disabled={disabled} className="text-[13px] font-semibold"
            style={{
                padding: '8px 18px', borderRadius: 10,
                border: `1px solid ${!disabled ? '#FFFFFF' : '#2A2A2A'}`,
                color: !disabled ? '#FFFFFF' : '#4B5563',
                background: 'transparent', transition: '150ms ease',
                cursor: !disabled ? 'pointer' : 'not-allowed'
            }}
            onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#000000' } }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = !disabled ? '#FFFFFF' : '#4B5563' }}>
            {children}
        </button>
    )
}
