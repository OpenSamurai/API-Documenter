import { useState, useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view'
import { foldAll, unfoldAll } from '@codemirror/language'
import { openSearchPanel, search, getSearchQuery } from '@codemirror/search'

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
    const topRef = useRef<HTMLDivElement>(null)
    const bottomRef = useRef<HTMLDivElement>(null)

    const contentType = response?.headers?.['content-type']?.toLowerCase() || ''
    const extensions = useMemo(() => {
        const exts = [
            vscodeDark,
            EditorView.lineWrapping,
            search({ top: true }),
            searchMatchCounter,
            EditorView.scrollMargins.of(() => ({ top: 100, bottom: 50 })),
            EditorView.theme({
                '&': { fontSize: '12px', background: '#0F0F0F !important' },
                '.cm-gutters': { background: '#0F0F0F', border: 'none', color: '#4B5563' },
                '.cm-content': { padding: '16px 0' },
                '.cm-line': { padding: '0 16px' },
                '.cm-panels': { background: 'transparent', color: '#FFFFFF', border: 'none' },
                '.cm-panels-top': {
                    position: 'sticky',
                    top: '10px',
                    zIndex: 100,
                    border: '1px solid #2A2A2A',
                    borderRadius: '8px',
                    background: '#151515',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                    width: 'max-content',
                    marginLeft: 'auto',
                    marginRight: '16px'
                },
                '.cm-panel.cm-search': { padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' },
                '.cm-panel.cm-search input[type="text"]': { background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '4px', color: '#FFFFFF', padding: '10px 8px', fontSize: '12px', outline: 'none', width: '240px !important', minWidth: '240px !important' },

                /* Buttons */
                '.cm-panel.cm-search button': { background: 'transparent', border: 'none', color: 'transparent !important', width: '24px', height: '24px', padding: 0, cursor: 'pointer', position: 'relative', transition: '150ms ease', borderRadius: '4px', overflow: 'hidden' },
                '.cm-panel.cm-search button:hover': { background: '#2A2A2A' },
                '.cm-panel.cm-search button::after': { color: '#9CA3AF', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '14px', fontWeight: 'bold' },
                '.cm-panel.cm-search button[name="next"]::after': { content: '"↓"' },
                '.cm-panel.cm-search button[name="prev"]::after': { content: '"↑"' },
                '.cm-panel.cm-search button[name="select"]::after': { content: '"≡"', fontSize: '16px' },
                '.cm-panel.cm-search button[name="close"]': { position: 'relative !important', marginLeft: '8px', right: 'auto !important', top: 'auto !important' },
                '.cm-panel.cm-search button[name="replace_toggle"]': { display: 'none !important' },
                '.cm-panel.cm-search button[name="close"]::after': { content: '"✕"', fontSize: '12px' },

                /* Checkboxes */
                '.cm-panel.cm-search label': { fontSize: '0 !important', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', width: '24px', height: '24px', background: 'transparent', borderRadius: '4px', transition: '150ms ease', margin: '0 !important', color: 'transparent !important' },
                '.cm-panel.cm-search label:hover': { background: '#2A2A2A' },
                '.cm-panel.cm-search label input[type="checkbox"]': { opacity: 0, position: 'absolute', inset: 0, margin: 0, cursor: 'pointer', width: '100%', height: '100%' },
                '.cm-panel.cm-search label::after': { color: '#9CA3AF', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontWeight: 'bold' },
                '.cm-panel.cm-search label:nth-of-type(1)::after': { content: '"Aa"', fontSize: '12px' },
                '.cm-panel.cm-search label:nth-of-type(2)::after': { content: '".*"', fontSize: '12px' },
                '.cm-panel.cm-search label:nth-of-type(3)::after': { content: '"ab"', fontSize: '11px' },

                /* Checked state */
                '.cm-panel.cm-search label:has(input:checked)': { background: '#1F1F1F', border: '1px solid #4ade80' },
                '.cm-panel.cm-search label:has(input:checked)::after': { color: '#4ade80' },

                /* Tooltips */
                '.cm-panel.cm-search label::before': { position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', background: '#000', color: '#FFF', padding: '4px 8px', fontSize: '10px', borderRadius: '4px', marginTop: '4px', whiteSpace: 'nowrap', zIndex: 100, opacity: 0, pointerEvents: 'none', transition: '150ms ease' },
                '.cm-panel.cm-search label:hover::before': { opacity: 1 },
                '.cm-panel.cm-search label:nth-of-type(1)::before': { content: '"Match Case"' },
                '.cm-panel.cm-search label:nth-of-type(2)::before': { content: '"Regular Expression"' },
                '.cm-panel.cm-search label:nth-of-type(3)::before': { content: '"Whole Word"' }
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
            <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px', height: '44px', borderBottom: '1px solid #1F1F1F', background: '#151515', borderTopLeftRadius: '11px', borderTopRightRadius: '11px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>Error</span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#6B7280', marginLeft: 'auto' }}>{response.time}ms</span>
                </div>
                <div style={{ padding: '16px', borderBottomLeftRadius: '11px', borderBottomRightRadius: '11px' }}>
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
        <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: '12px' }}>

            {/* ── Status bar ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '0 16px', height: '44px', borderBottom: '1px solid #1F1F1F', background: '#151515', borderTopLeftRadius: '11px', borderTopRightRadius: '11px' }}>
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
                            <SmallBtn onClick={() => editorRef.current?.view && openSearchPanel(editorRef.current.view)}>Search</SmallBtn>
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
            <div style={{ background: '#0F0F0F', borderBottomLeftRadius: '11px', borderBottomRightRadius: '11px' }}>
                {tab === 'body' && (
                    <div style={{ position: 'relative', background: '#0F0F0F', minHeight: '100px', borderBottomLeftRadius: '11px', borderBottomRightRadius: '11px' }}>
                        <div ref={topRef} style={{ position: 'absolute', top: '-100px' }} />
                        <div style={{ position: 'sticky', top: '80px', height: 0, zIndex: 50, pointerEvents: 'none' }}>
                            <div style={{ position: 'absolute', right: '24px', display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'auto' }}>
                                <FloatBtn icon={
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                                } onClick={() => topRef.current?.scrollIntoView({ behavior: 'smooth' })} />
                                <FloatBtn icon={
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                                } onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })} />
                            </div>
                        </div>
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
                        <div ref={bottomRef} style={{ height: '24px' }} />
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

function FloatBtn({ icon, onClick }: { icon: React.ReactNode; onClick?: () => void }) {
    return (
        <button onClick={onClick}
            style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#2A2A2A', border: '1px solid #3A3A3A', color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', transition: '150ms ease' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#000000'; e.currentTarget.style.borderColor = '#FFFFFF' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#2A2A2A'; e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.borderColor = '#3A3A3A' }}>
            {icon}
        </button>
    )
}

const searchMatchCounter = ViewPlugin.fromClass(class {
    countEl: HTMLElement | null = null;

    constructor(view: EditorView) {
        setTimeout(() => this.updateCount(view), 50);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.selectionSet || update.state !== update.startState) {
            setTimeout(() => this.updateCount(update.view), 10);
        }
    }

    updateCount(view: EditorView) {
        const panel = view.dom.querySelector('.cm-search');
        if (!panel) {
            this.countEl = null;
            return;
        }

        if (!this.countEl) {
            this.countEl = document.createElement('span');
            this.countEl.className = 'custom-search-count';
            Object.assign(this.countEl.style, {
                fontSize: '11px',
                color: '#4ade80',
                marginLeft: '8px',
                marginRight: '8px',
                fontFamily: 'monospace',
                minWidth: '45px',
                textAlign: 'center'
            });
            const input = panel.querySelector('input[name="search"]');
            if (input && input.nextSibling) {
                input.parentNode?.insertBefore(this.countEl, input.nextSibling);
            }
        }

        const query = getSearchQuery(view.state);
        if (query && query.valid && query.search) {
            let cursor = query.getCursor(view.state.doc);
            let total = 0;
            let current = 0;
            let selStart = view.state.selection.main.from;

            let match = cursor.next();
            while (!match.done) {
                total++;
                if (match.value.from <= selStart) current = total;
                if (total > 1000) break;
                match = cursor.next();
            }
            if (total > 0) {
                this.countEl.textContent = `${current || 1} of ${total > 1000 ? '1000+' : total}`;
                this.countEl.style.color = '#4ade80';
            } else {
                this.countEl.textContent = '0 of 0';
                this.countEl.style.color = '#f87171';
            }
        } else {
            this.countEl.textContent = '';
        }
    }
})