import { useState } from 'react'
import type { KeyValuePair } from '@/types'
import { v4 as uuid } from 'uuid'
import { VariableInput } from './VariableInput'

interface Props {
    pairs: KeyValuePair[]
    onChange: (p: KeyValuePair[]) => void
    keyPlaceholder?: string
    valuePlaceholder?: string
    variables?: Record<string, string>
    readOnly?: boolean
    showTypeSelector?: boolean
}

export function KeyValueEditor({ pairs, onChange, keyPlaceholder = 'Key', valuePlaceholder = 'Value', variables = {}, readOnly = false, showTypeSelector = false }: Props) {
    const [hoveredRow, setHoveredRow] = useState<number | null>(null)

    const set = (i: number, f: keyof KeyValuePair, v: any) => {
        const u = [...pairs]
        u[i] = { ...u[i], [f]: v }
        if (f === 'type' && v === 'file') {
            u[i].value = ''
        }
        onChange(u)
    }
    const add = () => onChange([...pairs, { id: uuid(), key: '', value: '', enabled: true, type: showTypeSelector ? 'text' : undefined }])
    const del = (i: number) => onChange(pairs.filter((_, j) => j !== i))

    const handleFileSelect = async (i: number) => {
        const paths = await window.electronAPI.selectFiles()
        if (paths && paths.length > 0) {
            let existing: string[] = []
            try {
                const parsed = JSON.parse(pairs[i].value)
                existing = Array.isArray(parsed) ? parsed : [pairs[i].value]
            } catch (e) {
                existing = pairs[i].value ? [pairs[i].value] : []
            }
            // Filter out existing to avoid duplicates
            const uniqueNew = paths.filter(p => !existing.includes(p))
            set(i, 'value', JSON.stringify([...existing, ...uniqueNew]))
        }
    }

    const removeFile = (i: number, filePath: string) => {
        try {
            const parsed = JSON.parse(pairs[i].value)
            if (Array.isArray(parsed)) {
                const u = parsed.filter(f => f !== filePath)
                set(i, 'value', u.length > 0 ? JSON.stringify(u) : '')
            }
        } catch (e) {
            set(i, 'value', '')
        }
    }

    const getFiles = (val: string): string[] => {
        if (!val) return []
        try {
            const parsed = JSON.parse(val)
            if (Array.isArray(parsed)) return parsed
            return [val]
        } catch (e) {
            return [val]
        }
    }

    const gridTemplate = showTypeSelector ? '32px 1fr 100px 1fr 32px' : '32px 1fr 1fr 32px'

    return (
        <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: '12px' }}>
            {/* Header row */}
            <div style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: '12px', padding: '10px 16px', background: '#151515', borderBottom: '1px solid #1F1F1F' }}>
                <div />
                <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#A1A1A1' }}>{keyPlaceholder}</span>
                {showTypeSelector && <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#A1A1A1' }}>Type</span>}
                <span style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#A1A1A1' }}>{valuePlaceholder}</span>
                <div />
            </div>

            {/* Data rows */}
            {pairs.map((p, i) => (
                <div key={p.id}
                    style={{
                        display: 'grid', gridTemplateColumns: gridTemplate, gap: '12px', alignItems: 'center',
                        padding: '8px 16px',
                        background: i % 2 === 0 ? '#111111' : '#151515',
                        borderBottom: '1px solid #1F1F1F',
                        opacity: p.enabled ? 1 : 0.35,
                        transition: '150ms ease'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = '#1A1A1A'
                        setHoveredRow(i)
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = i % 2 === 0 ? '#111111' : '#151515'
                        setHoveredRow(null)
                    }}>

                    {/* Toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <button onClick={() => !readOnly && set(i, 'enabled', !p.enabled)}
                            disabled={readOnly}
                            style={{
                                width: '16px', height: '16px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                border: '1.5px solid #FFFFFF', background: p.enabled ? '#FFFFFF' : 'transparent', transition: '150ms ease', cursor: readOnly ? 'default' : 'pointer'
                            }}>
                            {p.enabled && <svg width="8" height="6" viewBox="0 0 8 6" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round"><polyline points="1,3 3,5 7,1" /></svg>}
                        </button>
                    </div>

                    {/* Key input */}
                    <input value={p.key} onChange={e => !readOnly && set(i, 'key', e.target.value)} placeholder={keyPlaceholder}
                        readOnly={readOnly}
                        style={{
                            width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '11px',
                            padding: '0 12px', height: '32px', borderRadius: '8px',
                            background: '#0A0A0A', border: '1px solid #2A2A2A', color: '#FFFFFF',
                            outline: 'none', transition: '150ms ease',
                            cursor: readOnly ? 'default' : 'text'
                        }}
                        onFocus={e => { !readOnly && (e.currentTarget.style.borderColor = '#FFFFFF') }}
                        onBlur={e => { !readOnly && (e.currentTarget.style.borderColor = '#2A2A2A') }} />

                    {/* Type Selector */}
                    {showTypeSelector && (
                        <select
                            value={p.type || 'text'}
                            onChange={e => !readOnly && set(i, 'type', e.target.value)}
                            disabled={readOnly}
                            style={{
                                background: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '8px',
                                color: '#FFFFFF', fontSize: '11px', height: '32px', outline: 'none', padding: '0 4px', cursor: readOnly ? 'default' : 'pointer'
                            }}>
                            <option value="text">Text</option>
                            <option value="file">File</option>
                        </select>
                    )}

                    {/* Value input */}
                    {p.type === 'file' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {getFiles(p.value).map((f, fi) => (
                                    <div key={fi} title={f}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '6px',
                                            padding: '2px 8px', fontSize: '11px', color: '#FFFFFF'
                                        }}>
                                        <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {f.split(/[\\/]/).pop()}
                                        </span>
                                        {!readOnly && (
                                            <button onClick={() => removeFile(i, f)}
                                                style={{ border: 'none', background: 'transparent', color: '#6B7280', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                                onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'}
                                                onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}>
                                                <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" /></svg>
                                            </button>
                                        )}
                                    </div>
                                ))}
                                {getFiles(p.value).length === 0 && (
                                    <span style={{ fontSize: '11px', color: '#6B7280', padding: '6px 0' }}>No files selected</span>
                                )}
                            </div>
                            <button onClick={() => !readOnly && handleFileSelect(i)}
                                disabled={readOnly}
                                style={{
                                    fontSize: '11px', fontWeight: 600, padding: '0 12px', height: '28px', borderRadius: '6px',
                                    background: '#1F1F1F', border: '1px solid #2A2A2A', color: '#FFFFFF', cursor: readOnly ? 'default' : 'pointer',
                                    transition: '150ms ease'
                                }}
                                onMouseEnter={e => { if (!readOnly) e.currentTarget.style.background = '#2A2A2A' }}
                                onMouseLeave={e => { if (!readOnly) e.currentTarget.style.background = '#1F1F1F' }}>
                                {getFiles(p.value).length > 0 ? '+ Add Files' : 'Select Files'}
                            </button>
                        </div>
                    ) : (
                        <VariableInput
                            value={p.value}
                            onChange={v => !readOnly && set(i, 'value', v)}
                            variables={variables}
                            placeholder={valuePlaceholder}
                            readOnly={readOnly}
                            style={{
                                width: '100%', fontFamily: 'monospace', fontSize: '11px',
                                height: '32px', borderRadius: '8px',
                                background: '#0A0A0A', borderWidth: '1px', borderStyle: 'solid', borderColor: '#2A2A2A',
                                transition: '150ms ease',
                                cursor: readOnly ? 'default' : 'text'
                            }}
                        />
                    )}

                    {/* Delete */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {!readOnly && (
                            <button onClick={() => del(i)}
                                style={{
                                    width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px',
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    color: '#6B7280', transition: '150ms ease',
                                    opacity: hoveredRow === i ? 1 : 0
                                }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF' }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#6B7280' }}>
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" /></svg>
                            </button>
                        )}
                    </div>
                </div>
            ))}

            {/* Add row button */}
            {!readOnly && (
                <button onClick={add}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px', width: '100%', fontSize: '12px', fontWeight: 500, textAlign: 'left',
                        padding: '12px 16px', color: '#6B7280', transition: '150ms ease', background: 'transparent', border: 'none', cursor: 'pointer'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#1A1A1A'; e.currentTarget.style.color = '#FFFFFF' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                        <line x1="6" y1="2" x2="6" y2="10" /><line x1="2" y1="6" x2="10" y2="6" />
                    </svg>
                    Add {keyPlaceholder}
                </button>
            )}
        </div>
    )
}
