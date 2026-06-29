import { useState, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useCreateApi } from '@/hooks/useApis'
import type { HttpMethod } from '@/types'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']

export function CreateApiDialog() {
    const { currentProjectId, currentFolderId, setShowCreateApi, selectApi } = useAppStore()
    const create = useCreateApi()
    const [name, setName] = useState('')
    const [method, setMethod] = useState<HttpMethod>('GET')
    const [path, setPath] = useState('')

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
        window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
    }, [])

    const close = () => setShowCreateApi(false)
    const submit = async () => {
        if (!name.trim() || !currentProjectId || !currentFolderId) return
        const a = await create.mutateAsync({
            projectId: currentProjectId,
            folderId: currentFolderId,
            name: name.trim(),
            method,
            path: path.trim()
        })
        selectApi(a.id); close()
    }

    const canSubmit = !!name.trim()

    return (
        <div
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', animation: 'fadeIn 180ms ease-out'
            }}
            onClick={close}
        >
            <div onClick={e => e.stopPropagation()}
                style={{
                    background: '#111111', border: '1px solid #1F1F1F', borderRadius: '16px',
                    padding: '28px', width: '480px', maxWidth: '90vw',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
                    animation: 'modalIn 180ms ease-out'
                }}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>New Endpoint</h2>
                        <p style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '4px', marginBottom: 0 }}>Add an API endpoint to document</p>
                    </div>
                    <button onClick={close}
                        style={{
                            width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            borderRadius: '8px', flexShrink: 0, color: '#6B7280', transition: '150ms ease',
                            background: 'transparent', border: 'none', cursor: 'pointer'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#1A1A1A'; e.currentTarget.style.color = '#FFFFFF' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' }}>
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="2" x2="10" y2="10" /><line x1="10" y1="2" x2="2" y2="10" /></svg>
                    </button>
                </div>

                {/* Fields */}
                <div style={{ marginTop: '24px' }}>
                    {/* Name */}
                    <div>
                        <label
                            style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', marginBottom: '6px' }}
                        >
                            Name <span style={{ color: '#FFFFFF' }}>*</span>
                        </label>
                        <input value={name} onChange={e => setName(e.target.value)} placeholder="Login API" autoFocus
                            onKeyDown={e => e.key === 'Enter' && submit()}
                            style={{
                                width: '100%', boxSizing: 'border-box', height: '42px', padding: '0 14px', fontSize: '14px',
                                background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '10px',
                                color: '#FFFFFF', outline: 'none', transition: '150ms ease'
                            }}
                            onFocus={e => { e.currentTarget.style.borderColor = '#FFFFFF'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.1)' }}
                            onBlur={e => { e.currentTarget.style.borderColor = '#2A2A2A'; e.currentTarget.style.boxShadow = 'none' }} />
                    </div>

                    {/* Method */}
                    <div style={{ marginTop: '20px' }}>
                        <label
                            style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', marginBottom: '6px' }}
                        >
                            Method
                        </label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {METHODS.map(m => {
                                const isAct = method === m
                                return (
                                    <button key={m} onClick={() => setMethod(m)}
                                        style={{
                                            fontFamily: 'monospace', fontWeight: 600, fontSize: '11px', letterSpacing: '0.05em',
                                            padding: '6px 12px', borderRadius: '8px',
                                            border: `1px solid ${isAct ? '#FFFFFF' : '#2A2A2A'}`,
                                            background: isAct ? '#1F1F1F' : 'transparent',
                                            color: isAct ? '#FFFFFF' : '#6B7280',
                                            transition: '150ms ease', cursor: 'pointer'
                                        }}
                                        onMouseEnter={e => { if (!isAct) { e.currentTarget.style.background = '#151515'; e.currentTarget.style.color = '#FFFFFF' } }}
                                        onMouseLeave={e => { if (!isAct) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = isAct ? '#FFFFFF' : '#6B7280' } }}>
                                        {m}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* Path */}
                    <div style={{ marginTop: '20px' }}>
                        <label
                            style={{ display: 'block', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280', marginBottom: '6px' }}
                        >
                            Path
                        </label>
                        <input value={path} onChange={e => setPath(e.target.value)} placeholder="/auth/login"
                            onKeyDown={e => e.key === 'Enter' && submit()}
                            style={{
                                width: '100%', boxSizing: 'border-box', height: '42px', padding: '0 14px', fontSize: '12px', fontFamily: 'monospace',
                                background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '10px',
                                color: '#FFFFFF', outline: 'none', transition: '150ms ease'
                            }}
                            onFocus={e => { e.currentTarget.style.borderColor = '#FFFFFF'; e.currentTarget.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.1)' }}
                            onBlur={e => { e.currentTarget.style.borderColor = '#2A2A2A'; e.currentTarget.style.boxShadow = 'none' }} />
                    </div>
                </div>

                {/* Footer */}
                <div style={{ marginTop: '28px', borderTop: '1px solid #1F1F1F', paddingTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        <button onClick={close}
                            style={{
                                fontSize: '13px', fontWeight: 500, padding: '8px 16px', borderRadius: '10px',
                                color: '#A1A1A1', background: 'transparent', border: 'none', transition: '150ms ease', cursor: 'pointer'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#1A1A1A'; e.currentTarget.style.color = '#FFFFFF' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#A1A1A1' }}>
                            Cancel
                        </button>
                        <button onClick={submit} disabled={!canSubmit}
                            style={{
                                fontSize: '13px', fontWeight: 600, padding: '8px 18px', borderRadius: '10px',
                                border: `1px solid ${canSubmit ? '#FFFFFF' : '#2A2A2A'}`,
                                color: canSubmit ? '#FFFFFF' : '#4B5563',
                                background: 'transparent', transition: '150ms ease',
                                cursor: canSubmit ? 'pointer' : 'not-allowed'
                            }}
                            onMouseEnter={e => { if (canSubmit) { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#000000' } }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = canSubmit ? '#FFFFFF' : '#4B5563' }}>
                            Create Endpoint
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}