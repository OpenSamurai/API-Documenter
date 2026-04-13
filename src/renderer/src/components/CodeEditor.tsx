import { useCallback, useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { vscodeDark } from '@uiw/codemirror-theme-vscode'
import { EditorView } from '@codemirror/view'

interface Props {
    value: string
    onChange: (v: string) => void
    language: 'json' | 'html' | 'xml' | 'text'
    placeholder?: string
}

export function CodeEditor({ value, onChange, language, placeholder }: Props) {
    const isJson = language === 'json'
    const isHtml = language === 'html' || language === 'xml'

    const format = useCallback(() => {
        if (!isJson || !value.trim()) return
        try {
            onChange(JSON.stringify(JSON.parse(value), null, 2))
        } catch {
            // Not valid JSON
        }
    }, [value, onChange, isJson])

    const copy = useCallback(() => {
        navigator.clipboard.writeText(value)
    }, [value])

    let valid = true
    if (isJson && value.trim()) {
        try { JSON.parse(value) } catch { valid = false }
    }

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
        if (isJson) exts.push(json())
        if (isHtml) exts.push(html())
        return exts
    }, [isJson, isHtml])

    return (
        <div style={{ borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, border: '1px solid #1F1F1F' }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', flexShrink: 0, background: '#151515', borderBottom: '1px solid #1F1F1F' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isJson && (
                        <>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: valid ? '#4ade80' : '#f87171' }} />
                            <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 500, color: '#6B7280' }}>
                                {valid ? 'Valid JSON' : 'Invalid'}
                            </span>
                        </>
                    )}
                    {!isJson && (
                        <span style={{ fontSize: '10px', fontFamily: 'monospace', fontWeight: 500, color: '#6B7280', textTransform: 'uppercase' }}>
                            {language}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ToolbarBtn onClick={copy}>Copy</ToolbarBtn>
                    {isJson && <ToolbarBtn onClick={format}>Format</ToolbarBtn>}
                </div>
            </div>

            {/* Editor */}
            <CodeMirror
                value={value}
                onChange={onChange}
                height="auto"
                minHeight="200px"
                maxHeight="500px"
                extensions={extensions}
                theme={vscodeDark}
                placeholder={placeholder || `Raw ${language} body…`}
                basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    dropCursor: true,
                    allowMultipleSelections: true,
                    indentOnInput: true,
                }}
            />
        </div>
    )
}

function ToolbarBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            style={{ fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px', color: '#9CA3AF', border: '1px solid #2A2A2A', background: 'transparent', transition: '150ms ease', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#000000'; e.currentTarget.style.borderColor = '#FFFFFF' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9CA3AF'; e.currentTarget.style.borderColor = '#2A2A2A' }}
        >
            {children}
        </button>
    )
}
