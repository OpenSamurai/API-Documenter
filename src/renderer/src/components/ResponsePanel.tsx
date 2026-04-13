import { useState, useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import { EditorView } from '@codemirror/view'
import { foldAll, unfoldAll } from '@codemirror/language'

export interface HttpResponse {
    success: boolean
    status?: number
    statusText?: string
    headers?: Record<string, string>
    body?: string
    time: number
    size?: number
    error?: string
}

interface Props {
    response: HttpResponse | null
    loading: boolean
    onSaveAsExample?: (status: number, body: string, headers: Record<string, string>) => void
}

type Tab = 'body' | 'headers' | 'meta'

export function ResponsePanel({ response, loading, onSaveAsExample }: Props) {
    const [tab, setTab] = useState<Tab>('body')
    const [copied, setCopied] = useState(false)
    const editorRef = useRef<any>(null)

    const contentType = response?.headers?.['content-type']?.toLowerCase() || ''
    const extensions = useMemo(() => {
        const exts = [
            vscodeDark,
            EditorView.lineWrapping,
            EditorView.theme({
                '&': { fontSize: '12px', background: '#0F0F0F !important' },
                '.cm-gutters': { background: '#0F0F0F', border: 'none', color: '#4B5563' },
                '.cm-content': { padding: '16px 0' },
                '.cm-line': { padding: '0 16px' }
            })
        ]
        if (contentType.includes('json')) exts.push(json())
        if (contentType.includes('html') || contentType.includes('xml')) exts.push(html())
        return exts
    }, [contentType])

    const copy = (text: string) => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    /* ═══ Loading state ═══ */
    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', background: '#111111', border: '1px solid #1F1F1F', borderRadius: '12px' }}>
                <div style={{ width: '24px', height: '24px', border: '2px solid #2A2A2A', borderTopColor: 'transparent', borderRadius: '50%', marginBottom: '12px', animation: 'spin 800ms linear infinite' }} />
                <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>Sending request…</p>
            </div>
        )
    }

    /* ═══ Empty state ═══ */
    if (!response) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', background: '#111111', border: '1px solid #1F1F1F', borderRadius: '12px' }}>
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: '12px' }}>
                    <circle cx="16" cy="16" r="12" /><polyline points="16,10 16,16 20,18" />
                </svg>
                <p style={{ fontSize: '13px', fontWeight: 500, color: '#6B7280', marginBottom: '4px', marginTop: 0 }}>No response yet</p>
                <p style={{ fontSize: '11px', color: '#4B5563', margin: 0 }}>Hit Send to make a request</p>
            </div>
        )
    }

    /* ═══ Error state ═══ */
    if (!response.success) {
        return (
            <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '44px', borderBottom: '1px solid #1F1F1F', background: '#151515' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Error</span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#6B7280', marginLeft: 'auto' }}>{response.time}ms</span>
                </div>
                <div style={{ padding: '16px' }}>
                    <p style={{ fontSize: '12px', fontFamily: 'monospace', lineHeight: 1.6, color: '#A1A1A1', margin: 0 }}>
                        {response.error}
                    </p>
                </div>
            </div>
        )
    }

    /* ═══ Success — full response view ═══ */
    const headerEntries = Object.entries(response.headers || {})
    const sizeStr = (response.size || 0) > 1024
        ? `${((response.size || 0) / 1024).toFixed(1)} KB`
        : `${response.size || 0} B`

    let prettyBody = response.body || ''
    try { prettyBody = JSON.stringify(JSON.parse(prettyBody), null, 2) } catch { /* not JSON */ }

    const tabs: { key: Tab; label: string; count?: number }[] = [
        { key: 'body', label: 'Body' },
        { key: 'headers', label: 'Headers', count: headerEntries.length },
        { key: 'meta', label: 'Meta' }
    ]

    const getStatusColor = (status?: number) => {
        if (!status) return '#6B7280'
        if (status >= 200 && status < 300) return '#4ade80' // Success - Green
        if (status >= 300 && status < 400) return '#facc15' // Redirect - Yellow
        if (status >= 400 && status < 500) return '#fb923c' // Client Error - Orange
        if (status >= 500) return '#f87171' // Server Error - Red
        return '#6B7280'
    }

    return (
        <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: '12px', overflow: 'hidden' }}>

            {/* ── Status bar ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '0 16px', height: '44px', borderBottom: '1px solid #1F1F1F', background: '#151515' }}>
                {/* Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getStatusColor(response.status) }} />
                    <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', color: getStatusColor(response.status) }}>
                        {response.status}
                    </span>
                    <span style={{ fontSize: '12px', color: '#9CA3AF', fontWeight: 500 }}>{response.statusText}</span>
                </div>

                {/* Meta pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
                    <MetaPill label="Time" value={`${response.time}ms`} />
                    <MetaPill label="Size" value={sizeStr} />
                </div>
            </div>

            {/* ── Tabs ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '0 16px', borderBottom: '1px solid #1F1F1F' }}>
                {tabs.map(t => {
                    const isAct = tab === t.key
                    return (
                        <button key={t.key} onClick={() => setTab(t.key)}
                            style={{
                                position: 'relative', padding: '8px 12px 10px', fontSize: '12px', fontWeight: 500,
                                color: isAct ? '#FFFFFF' : '#6B7280',
                                background: 'transparent', border: 'none', transition: '150ms ease', cursor: 'pointer'
                            }}
                            onMouseEnter={e => { if (!isAct) e.currentTarget.style.color = '#FFFFFF' }}
                            onMouseLeave={e => { if (!isAct) e.currentTarget.style.color = '#6B7280' }}>
                            {t.label}
                            {!!t.count && <span style={{ marginLeft: '4px', fontSize: '9px', fontWeight: 700, padding: '0 4px', borderRadius: '9999px', background: '#1F1F1F', color: '#9CA3AF' }}>{t.count}</span>}
                            <span style={{ position: 'absolute', bottom: 0, left: '12px', right: '12px', height: '2px', background: '#FFFFFF', borderRadius: '1px', opacity: isAct ? 1 : 0, transform: isAct ? 'scaleX(1)' : 'scaleX(0)', transition: '200ms ease' }} />
                        </button>
                    )
                })}

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                    {tab === 'body' && (
                        <>
                            <SmallBtn onClick={() => editorRef.current?.view && foldAll(editorRef.current.view)}>Collapse All</SmallBtn>
                            <SmallBtn onClick={() => editorRef.current?.view && unfoldAll(editorRef.current.view)}>Expand All</SmallBtn>
                        </>
                    )}
                    <SmallBtn onClick={() => copy(prettyBody)}>{copied ? '✓ Copied' : 'Copy'}</SmallBtn>
                    {onSaveAsExample && (
                        <SmallBtn onClick={() => onSaveAsExample(response.status || 200, prettyBody, response.headers || {})}>Save as Example</SmallBtn>
                    )}
                </div>
            </div>

            {/* ── Content ── */}
            <div style={{ background: '#0F0F0F' }}>
                {tab === 'body' && (
                    <div style={{ background: '#0F0F0F', minHeight: '100px' }}>
                        <CodeMirror
                            ref={editorRef}
                            value={prettyBody || ''}
                            height="auto"
                            minHeight="100px"
                            extensions={extensions}
                            readOnly={true}
                            editable={false}
                            theme={vscodeDark}
                            basicSetup={{
                                lineNumbers: true,
                                foldGutter: true,
                                dropCursor: false,
                                allowMultipleSelections: false,
                                indentOnInput: false,
                            }}
                        />
                    </div>
                )}

                {tab === 'headers' && (
                    <div>
                        {headerEntries.map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 16px', borderBottom: '1px solid #1F1F1F', transition: '150ms ease' }}
                                onMouseEnter={e => { e.currentTarget.style.background = '#151515' }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                                <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: 600, color: '#FFFFFF', minWidth: '180px' }}>{k}</span>
                                <span style={{ fontSize: '11px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#9CA3AF' }}>{v}</span>
                            </div>
                        ))}
                        {headerEntries.length === 0 && (
                            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                                <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>No headers returned</p>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'meta' && (
                    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <MetaRow label="Status Code" value={`${response.status} ${response.statusText}`} />
                        <MetaRow label="Response Time" value={`${response.time} ms`} />
                        <MetaRow label="Body Size" value={sizeStr} />
                        <MetaRow label="Content-Type" value={response.headers?.['content-type'] || 'unknown'} />
                        <MetaRow label="Server" value={response.headers?.['server'] || 'unknown'} />
                    </div>
                )}
            </div>
        </div>
    )
}


/* ═══ Small helpers ════════════════════════════════════════════════ */

function MetaPill({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontFamily: 'monospace', color: '#6B7280', padding: '3px 8px', background: '#1A1A1A', borderRadius: '6px' }}>
            <span style={{ color: '#4B5563' }}>{label}</span>
            <span style={{ color: '#FFFFFF' }}>{value}</span>
        </div>
    )
}

function MetaRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1F1F1F' }}>
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#6B7280' }}>{label}</span>
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#FFFFFF' }}>{value}</span>
        </div>
    )
}

function SmallBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
    return (
        <button onClick={onClick}
            style={{ fontSize: '10px', fontWeight: 600, padding: '4px 8px', borderRadius: '6px', border: '1px solid #2A2A2A', color: '#9CA3AF', background: 'transparent', transition: '150ms ease', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#000000'; e.currentTarget.style.borderColor = '#FFFFFF' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.borderColor = '#2A2A2A' }}>
            {children}
        </button>
    )
}