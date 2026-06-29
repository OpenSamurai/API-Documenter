import { useState } from 'react'
import type { ResponseExample, ResponseExampleMetadata, KeyValuePair } from '@/types'
import { v4 as uuid } from 'uuid'
import { CodeEditor } from './CodeEditor'

interface Props {
    examples: ResponseExample[]
    onChange: (e: ResponseExample[]) => void
}

const CONTENT_TYPES = [
    'application/json',
    'application/xml',
    'text/html',
    'text/plain',
    'application/octet-stream',
    'multipart/form-data'
]

const DEFAULT_METADATA: ResponseExampleMetadata = {
    contentType: 'application/json',
    isDefault: false,
    deprecated: false
}

export function ResponseViewer({ examples, onChange }: Props) {
    const [active, setActive] = useState(0)
    const [adding, setAdding] = useState(false)
    const [code, setCode] = useState('200')

    const add = () => {
        const now = Date.now()
        const ex: ResponseExample = {
            id: uuid(), statusCode: parseInt(code) || 200,
            title: `${code} Response`,
            description: '',
            body: '{\n  \n}',
            metadata: { ...DEFAULT_METADATA, isDefault: examples.length === 0 },
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        }
        onChange([...examples, ex]); setActive(examples.length); setAdding(false)
    }

    const update = <K extends keyof ResponseExample>(i: number, f: K, v: ResponseExample[K]) => {
        const u = [...examples]; u[i] = { ...u[i], [f]: v, updatedAt: new Date().toISOString() }; onChange(u)
    }

    const updateMeta = <K extends keyof ResponseExampleMetadata>(i: number, f: K, v: ResponseExampleMetadata[K]) => {
        const u = [...examples]
        u[i] = { ...u[i], metadata: { ...u[i].metadata, [f]: v }, updatedAt: new Date().toISOString() }
        // If setting isDefault, unset others
        if (f === 'isDefault' && v === true) {
            u.forEach((ex, j) => { if (j !== i) u[j] = { ...u[j], metadata: { ...u[j].metadata, isDefault: false } } })
        }
        onChange(u)
    }

    const remove = (i: number) => {
        onChange(examples.filter((_, j) => j !== i))
        if (active >= examples.length - 1) setActive(Math.max(0, examples.length - 2))
    }

    const cur = examples[active]

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '16px' }}>
            {/* ═══ Status tabs ═══ */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {examples.map((ex, i) => (
                    <button key={ex.id} onClick={() => setActive(i)}
                        className="group"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderRadius: '8px',
                            fontSize: '11px', fontFamily: 'monospace', fontWeight: 700,
                            background: active === i ? '#1F1F1F' : 'transparent',
                            color: active === i ? '#FFFFFF' : '#6B7280',
                            border: `1px solid ${active === i ? '#FFFFFF' : '#2A2A2A'}`,
                            transition: '150ms ease', cursor: 'pointer'
                        }}
                        onMouseEnter={e => { if (active !== i) e.currentTarget.style.background = '#151515' }}
                        onMouseLeave={e => { if (active !== i) e.currentTarget.style.background = 'transparent' }}>
                        <span>{ex.statusCode}</span>
                        {ex.title && ex.title !== `${ex.statusCode} Response` && (
                            <span style={{ fontSize: '10px', fontWeight: 500, fontFamily: 'sans-serif', color: '#9CA3AF' }}>{ex.title}</span>
                        )}
                        {ex.metadata?.isDefault && (
                            <span style={{ fontSize: '8px', padding: '1px 6px', borderRadius: '9999px', fontFamily: 'sans-serif', fontWeight: 600, background: '#2A2A2A', color: '#FFFFFF' }}>DEFAULT</span>
                        )}
                        {ex.metadata?.deprecated && (
                            <span style={{ fontSize: '8px', padding: '1px 6px', borderRadius: '9999px', fontFamily: 'sans-serif', fontWeight: 600, background: '#2A2A2A', color: '#6B7280' }}>DEPRECATED</span>
                        )}
                        <span className="opacity-0 group-hover:opacity-100"
                            style={{ fontSize: '8px', cursor: 'pointer', marginLeft: '4px', color: '#6B7280', transition: '150ms ease' }}
                            onClick={e => { e.stopPropagation(); remove(i) }}>✕</span>
                    </button>
                ))}

                {adding ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input type="number" value={code} onChange={e => setCode(e.target.value)} autoFocus
                            onKeyDown={e => e.key === 'Enter' && add()}
                            style={{ width: '64px', padding: '8px', fontSize: '11px', fontFamily: 'monospace', borderRadius: '8px', background: '#0F0F0F', border: '1px solid #2A2A2A', color: '#FFFFFF', outline: 'none' }}
                            onFocus={e => { e.currentTarget.style.borderColor = '#FFFFFF' }}
                            onBlur={e => { e.currentTarget.style.borderColor = '#2A2A2A' }} />
                        <SmallBtn onClick={add}>✓</SmallBtn>
                        <SmallBtn onClick={() => setAdding(false)}>✕</SmallBtn>
                    </div>
                ) : (
                    <button onClick={() => setAdding(true)}
                        style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 500, color: '#6B7280', border: '1px dashed #2A2A2A', transition: '150ms ease', background: 'transparent', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#151515'; e.currentTarget.style.color = '#FFFFFF' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' }}>+ Add</button>
                )}
            </div>

            {/* ═══ Response Example Card ═══ */}
            {cur ? (
                <ExampleCard
                    example={cur}
                    index={active}
                    onUpdate={update}
                    onUpdateMeta={updateMeta}
                />
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '64px 0', gap: '8px', borderRadius: '16px', border: '1px solid #1F1F1F', background: '#111111' }}>
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round">
                        <rect x="4" y="4" width="20" height="20" rx="4" />
                        <line x1="14" y1="10" x2="14" y2="18" />
                        <line x1="10" y1="14" x2="18" y2="14" />
                    </svg>
                    <p style={{ fontSize: '12px', fontWeight: 500, color: '#6B7280', margin: 0 }}>Add response examples to document expected outputs</p>
                    <p style={{ fontSize: '10px', color: '#4B5563', margin: 0 }}>Click "+ Add" to create your first example</p>
                </div>
            )}
        </div>
    )
}


/* ═══════════════════════════════════════════════════════════════
   EXAMPLE CARD — Rich card with metadata + body
   ═══════════════════════════════════════════════════════════════ */
interface ExampleCardProps {
    example: ResponseExample
    index: number
    onUpdate: <K extends keyof ResponseExample>(i: number, f: K, v: ResponseExample[K]) => void
    onUpdateMeta: <K extends keyof ResponseExampleMetadata>(i: number, f: K, v: ResponseExampleMetadata[K]) => void
}

function ExampleCard({ example, index, onUpdate, onUpdateMeta }: ExampleCardProps) {
    const [metaOpen, setMetaOpen] = useState(false)
    const [tagsInput, setTagsInput] = useState('')

    const addTag = () => {
        const tag = tagsInput.trim()
        if (!tag) return
        const existing = example.metadata.tags || []
        if (!existing.includes(tag)) onUpdateMeta(index, 'tags', [...existing, tag])
        setTagsInput('')
    }
    const removeTag = (tag: string) => {
        onUpdateMeta(index, 'tags', (example.metadata.tags || []).filter(t => t !== tag))
    }

    return (
        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 0, background: '#111111', border: '1px solid #1F1F1F', borderRadius: '16px', overflow: 'hidden' }}>

            {/* ── Header ── */}
            <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    {/* Status code pill */}
                    <span style={{ fontSize: '14px', fontFamily: 'monospace', fontWeight: 700, padding: '4px 10px', borderRadius: '8px', background: '#1F1F1F', color: '#FFFFFF', border: '1px solid #2A2A2A' }}>
                        {example.statusCode}
                    </span>
                    {/* Title */}
                    <input value={example.title} onChange={e => onUpdate(index, 'title', e.target.value)}
                        placeholder="Response title…"
                        style={{ flex: 1, background: 'transparent', fontSize: '15px', fontWeight: 600, color: '#FFFFFF', outline: 'none', border: 'none', minWidth: 0 }} />
                    {/* Badges */}
                    {example.metadata?.isDefault && (
                        <span style={{ fontSize: '9px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#1F1F1F', color: '#FFFFFF', border: '1px solid #2A2A2A' }}>Default</span>
                    )}
                    {example.metadata?.deprecated && (
                        <span style={{ fontSize: '9px', fontWeight: 600, padding: '2px 8px', borderRadius: '9999px', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#1F1F1F', color: '#6B7280', border: '1px solid #2A2A2A' }}>Deprecated</span>
                    )}
                </div>
                <input value={example.description} onChange={e => onUpdate(index, 'description', e.target.value)}
                    placeholder="Short description of this response…"
                    style={{ width: '100%', background: 'transparent', fontSize: '12px', color: '#9CA3AF', outline: 'none', border: 'none' }} />
            </div>

            {/* ── Collapsible Metadata ── */}
            <div style={{ borderTop: '1px solid #1F1F1F' }}>
                <button onClick={() => setMetaOpen(!metaOpen)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', padding: '10px 20px', transition: '150ms ease', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#151515' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round"
                        style={{ transform: metaOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 200ms ease' }}>
                        <polyline points="2,0 6,4 2,8" />
                    </svg>
                    <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280' }}>Metadata</span>
                    <span style={{ fontSize: '10px', marginLeft: 'auto', color: '#4B5563' }}>
                        {example.metadata?.contentType || 'application/json'}
                    </span>
                </button>

                {metaOpen && (
                    <div className="fade-in" style={{ padding: '0 20px 16px 20px' }}>
                        <div style={{ background: '#151515', borderRadius: '10px', padding: '14px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {/* Content-Type */}
                                <MetaField label="Content-Type">
                                    <select value={example.metadata?.contentType || 'application/json'}
                                        onChange={e => onUpdateMeta(index, 'contentType', e.target.value)}
                                        style={{ fontSize: '11px', fontFamily: 'monospace', background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '8px', padding: '6px 8px', color: '#FFFFFF', outline: 'none' }}>
                                        {CONTENT_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                                    </select>
                                </MetaField>

                                {/* Default toggle */}
                                <MetaField label="Default Example">
                                    <Toggle checked={example.metadata?.isDefault || false}
                                        onChange={v => onUpdateMeta(index, 'isDefault', v)} />
                                </MetaField>

                                {/* Deprecated toggle */}
                                <MetaField label="Deprecated">
                                    <Toggle checked={example.metadata?.deprecated || false}
                                        onChange={v => onUpdateMeta(index, 'deprecated', v)} />
                                </MetaField>

                                {/* Version */}
                                <MetaField label="Version">
                                    <input value={example.metadata?.version || ''} onChange={e => onUpdateMeta(index, 'version', e.target.value)}
                                        placeholder="v1.0"
                                        style={{ fontSize: '11px', fontFamily: 'monospace', background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '8px', padding: '6px 8px', color: '#FFFFFF', outline: 'none', width: '80px' }}
                                        onFocus={e => { e.currentTarget.style.borderColor = '#FFFFFF' }}
                                        onBlur={e => { e.currentTarget.style.borderColor = '#2A2A2A' }} />
                                </MetaField>

                                {/* Response Time */}
                                <MetaField label="Response Time (ms)">
                                    <input type="number" value={example.metadata?.responseTime || ''} onChange={e => onUpdateMeta(index, 'responseTime', parseInt(e.target.value) || undefined)}
                                        placeholder="—"
                                        style={{ fontSize: '11px', fontFamily: 'monospace', background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '8px', padding: '6px 8px', color: '#FFFFFF', outline: 'none', width: '80px' }}
                                        onFocus={e => { e.currentTarget.style.borderColor = '#FFFFFF' }}
                                        onBlur={e => { e.currentTarget.style.borderColor = '#2A2A2A' }} />
                                </MetaField>

                                {/* Response Size */}
                                <MetaField label="Response Size (bytes)">
                                    <input type="number" value={example.metadata?.responseSize || ''} onChange={e => onUpdateMeta(index, 'responseSize', parseInt(e.target.value) || undefined)}
                                        placeholder="—"
                                        style={{ fontSize: '11px', fontFamily: 'monospace', background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '8px', padding: '6px 8px', color: '#FFFFFF', outline: 'none', width: '80px' }}
                                        onFocus={e => { e.currentTarget.style.borderColor = '#FFFFFF' }}
                                        onBlur={e => { e.currentTarget.style.borderColor = '#2A2A2A' }} />
                                </MetaField>

                                {/* Tags */}
                                <MetaField label="Tags">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        {(example.metadata?.tags || []).map(tag => (
                                            <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '9999px', background: '#1F1F1F', color: '#FFFFFF', border: '1px solid #2A2A2A' }}>
                                                {tag}
                                                <span style={{ cursor: 'pointer', color: '#6B7280' }}
                                                    onClick={() => removeTag(tag)}>✕</span>
                                            </span>
                                        ))}
                                        <input value={tagsInput} onChange={e => setTagsInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && addTag()}
                                            placeholder="Add tag…"
                                            style={{ fontSize: '10px', background: 'transparent', border: 'none', color: '#FFFFFF', outline: 'none', width: '60px' }} />
                                    </div>
                                </MetaField>

                                {/* Notes */}
                                <MetaField label="Notes">
                                    <textarea value={example.metadata?.notes || ''} onChange={e => onUpdateMeta(index, 'notes', e.target.value)}
                                        placeholder="Internal notes…"
                                        style={{ width: '100%', fontSize: '11px', resize: 'none', fontFamily: 'monospace', background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '8px', padding: '6px 8px', color: '#9CA3AF', outline: 'none', minHeight: '48px', lineHeight: 1.6 }}
                                        onFocus={e => { e.currentTarget.style.borderColor = '#FFFFFF' }}
                                        onBlur={e => { e.currentTarget.style.borderColor = '#2A2A2A' }} />
                                </MetaField>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Response Body ── */}
            <div style={{ borderTop: '1px solid #1F1F1F', padding: '16px' }}>
                <div style={{ marginBottom: '8px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280' }}>Response Body</span>
                </div>
                <CodeEditor 
                    value={example.body} 
                    onChange={v => onUpdate(index, 'body', v)} 
                    language={example.metadata?.contentType === 'application/xml' || example.metadata?.contentType === 'text/html' ? 'html' : (example.metadata?.contentType === 'text/plain' ? 'text' : 'json')}
                />
            </div>

            {/* ── Footer ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px', borderTop: '1px solid #1F1F1F', background: '#111111' }}>
                <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#4B5563' }}>
                    Updated {new Date(example.updatedAt).toLocaleString()}
                </span>
                <span style={{ fontSize: '9px', fontFamily: 'monospace', color: '#4B5563' }}>
                    {example.metadata?.contentType}
                </span>
            </div>
        </div>
    )
}


/* ═══ Small helpers ════════════════════════════════════════════════ */

function MetaField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '28px' }}>
            <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6B7280', minWidth: '120px' }}>{label}</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>{children}</div>
        </div>
    )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <button onClick={() => onChange(!checked)}
            style={{ position: 'relative', borderRadius: '9999px', width: '32px', height: '18px', background: checked ? '#FFFFFF' : '#2A2A2A', transition: '150ms ease', border: 'none', cursor: 'pointer' }}>
            <span style={{
                position: 'absolute', top: '2px', borderRadius: '50%',
                width: '14px', height: '14px',
                background: checked ? '#000000' : '#6B7280',
                left: checked ? '16px' : '2px',
                transition: '150ms ease'
            }} />
        </button>
    )
}

function SmallBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
    return (
        <button onClick={onClick}
            style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px', border: '1px solid #2A2A2A', color: '#9CA3AF', background: 'transparent', transition: '150ms ease', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#000000'; e.currentTarget.style.borderColor = '#FFFFFF' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.borderColor = '#2A2A2A' }}>
            {children}
        </button>
    )
}