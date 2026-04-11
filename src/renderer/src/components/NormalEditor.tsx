import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Link } from '@tiptap/extension-link'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import { useState, useCallback, useEffect, useRef } from 'react'
import { PageBreak } from './PageBreak'
import { CustomDiv, CustomContentDiv } from './CustomDiv'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'

// Extended nodes to preserve style attributes
const StyledHeading = Heading.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            id: {
                default: null,
                parseHTML: element => element.getAttribute('id'),
                renderHTML: attributes => attributes.id ? { id: attributes.id } : {},
            },
            style: {
                default: null,
                parseHTML: element => element.getAttribute('style'),
                renderHTML: attributes => attributes.style ? { style: attributes.style } : {},
            },
            class: {
                default: null,
                parseHTML: element => element.getAttribute('class'),
                renderHTML: attributes => attributes.class ? { class: attributes.class } : {},
            },
        }
    },
})

const StyledParagraph = Paragraph.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            style: {
                default: null,
                parseHTML: element => element.getAttribute('style'),
                renderHTML: attributes => attributes.style ? { style: attributes.style } : {},
            },
            class: {
                default: null,
                parseHTML: element => element.getAttribute('class'),
                renderHTML: attributes => attributes.class ? { class: attributes.class } : {},
            },
        }
    },
})

interface Props {
    content: string
    onChange: (markdown: string) => void
    folders?: any[]
    apis?: any[]
}

export function NormalEditor({ content, onChange, folders = [], apis = [] }: Props) {
    const [headingMenuOpen, setHeadingMenuOpen] = useState(false)
    const [tableMenuOpen, setTableMenuOpen] = useState(false)
    const [, setUpdateCount] = useState(0)

    const lastMarkdownRef = useRef<string>(content)

    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                codeBlock: {},
                heading: false,
                paragraph: false,
            }),
            StyledHeading,
            StyledParagraph,
            CustomDiv,
            CustomContentDiv,
            Markdown.configure({
                html: true,
                tightLists: true,
                bulletListMarker: '-',
                linkify: true,
                breaks: true,
            }),
            Table.configure({ resizable: true }),
            TableRow,
            TableHeader,
            TableCell,
            Placeholder.configure({ placeholder: 'Start writing your documentation...' }),
            PageBreak,
        ],
        content: content,
        onUpdate: ({ editor }) => {
            const markdown = (editor.storage as any).markdown.getMarkdown()
            lastMarkdownRef.current = markdown
            onChange(markdown)
        },
        onTransaction: () => {
            setTimeout(() => {
                setUpdateCount(prev => prev + 1)
            }, 0)
        },
    }, [onChange])

    // Track previous folder/api names to detect EXTERNAL changes only
    const prevFolderNamesRef = useRef<Record<string, string>>({})
    const prevApiNamesRef = useRef<Record<string, string>>({})

    // Sync Headings with External Data (ONLY when database changes, NOT user typing)
    useEffect(() => {
        if (!editor) return

        // Build current name maps from database
        const currentFolderNames: Record<string, string> = {}
        folders.forEach(f => { currentFolderNames[f.id] = f.name })
        const currentApiNames: Record<string, string> = {}
        apis.forEach(a => { currentApiNames[a.id] = a.name })

        // Determine which folders/apis actually changed in the DATABASE
        const changedFolderIds = new Set<string>()
        const changedApiIds = new Set<string>()

        for (const [id, name] of Object.entries(currentFolderNames)) {
            if (prevFolderNamesRef.current[id] !== undefined && prevFolderNamesRef.current[id] !== name) {
                changedFolderIds.add(id)
            }
        }
        for (const [id, name] of Object.entries(currentApiNames)) {
            if (prevApiNamesRef.current[id] !== undefined && prevApiNamesRef.current[id] !== name) {
                changedApiIds.add(id)
            }
        }

        // Update refs for next comparison
        prevFolderNamesRef.current = currentFolderNames
        prevApiNamesRef.current = currentApiNames

        // If nothing changed externally, skip entirely
        if (changedFolderIds.size === 0 && changedApiIds.size === 0) return

        let changed = false
        const { tr } = editor.state
        const { selection } = editor.state

        editor.state.doc.descendants((node: any, pos: number) => {
            if (node.type.name === 'heading') {
                const id = node.attrs.id || ''
                if (node.attrs.level === 2 && id.startsWith('folder-')) {
                    const folderId = id.replace('folder-', '')
                    if (changedFolderIds.has(folderId)) {
                        const folder = folders.find(f => f.id === folderId)
                        const expectedText = `Folder: ${folder?.name || ''}`
                        if (folder && node.textContent !== expectedText) {
                            tr.insertText(expectedText, pos + 1, pos + node.nodeSize - 1)
                            changed = true
                        }
                    }
                } else if (node.attrs.level === 3 && id.startsWith('api-')) {
                    const apiId = id.replace('api-', '')
                    if (changedApiIds.has(apiId)) {
                        const api = apis.find(a => a.id === apiId)
                        const expectedText = `Endpoint: ${api?.name || ''}`
                        if (api && node.textContent !== expectedText) {
                            tr.insertText(expectedText, pos + 1, pos + node.nodeSize - 1)
                            changed = true
                        }
                    }
                }
            }
            return true
        })

        if (changed) {
            const mappedSelection = selection.map(tr.doc, tr.mapping)
            tr.setSelection(mappedSelection)
            tr.setMeta('addToHistory', false)
            editor.view.dispatch(tr)
        }
    }, [folders, apis, editor])

    // Sync content if it changes externally (important for the toggling)
    useEffect(() => {
        // Compare with lastMarkdownRef to avoid ping-pong updates
        const currentMarkdown = (editor?.storage as any)?.markdown?.getMarkdown()
        if (!editor || content === lastMarkdownRef.current || content === currentMarkdown) return

        lastMarkdownRef.current = content // Sync ref with incoming external change

        setTimeout(() => {
            if (editor && !editor.isDestroyed) {
                editor.commands.setContent(content)
            }
        }, 0)
    }, [content, editor])

    const addLink = useCallback(() => {
        const url = window.prompt('URL')
        if (url) {
            editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
        }
    }, [editor])

    if (!editor) return null

    const toggleHeading = (level: any) => {
        if (level === 0) {
            editor.chain().focus().setParagraph().run()
        } else {
            editor.chain().focus().toggleHeading({ level }).run()
        }
        setHeadingMenuOpen(false)
    }

    const currentHeading = () => {
        if (editor.isActive('heading', { level: 1 })) return 'Heading 1'
        if (editor.isActive('heading', { level: 2 })) return 'Heading 2'
        if (editor.isActive('heading', { level: 3 })) return 'Heading 3'
        if (editor.isActive('heading', { level: 4 })) return 'Heading 4'
        if (editor.isActive('heading', { level: 5 })) return 'Heading 5'
        if (editor.isActive('heading', { level: 6 })) return 'Heading 6'
        return 'Normal text'
    }

    const tableActions = [
        { label: 'Add Row Above', action: () => editor.chain().focus().addRowBefore().run() },
        { label: 'Add Row Below', action: () => editor.chain().focus().addRowAfter().run() },
        { label: 'Add Col Left', action: () => editor.chain().focus().addColumnBefore().run() },
        { label: 'Add Col Right', action: () => editor.chain().focus().addColumnAfter().run() },
        { label: 'Delete Row', action: () => editor.chain().focus().deleteRow().run() },
        { label: 'Delete Col', action: () => editor.chain().focus().deleteColumn().run() },
        { label: 'Toggle Header', action: () => editor.chain().focus().toggleHeaderRow().run() },
        { label: 'DELETE TABLE', action: () => editor.chain().focus().deleteTable().run(), danger: true },
    ]

    return (
        <div className="normal-editor-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0F0F0F' }}>
            {/* Toolbar */}
            <div className="editor-toolbar" style={{
                display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
                background: '#151515', borderBottom: '1px solid #1F1F1F', flexWrap: 'wrap'
            }}>
                {/* Heading Dropdown */}
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setHeadingMenuOpen(!headingMenuOpen)}
                        className="toolbar-btn dropdown-btn"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}
                    >
                        <span>{currentHeading()}</span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                    {headingMenuOpen && (
                        <div style={{
                            position: 'absolute', top: '100%', left: 0, zIndex: 50, background: '#1A1A1A',
                            border: '1px solid #2A2A2A', borderRadius: '4px', marginTop: '4px', width: '200px',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)'
                        }}>
                            {[0, 1, 2, 3, 4, 5, 6].map(level => (
                                <button
                                    key={level}
                                    onClick={() => toggleHeading(level)}
                                    style={{
                                        width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent',
                                        border: 'none', color: '#D1D5DB', fontSize: '13px', cursor: 'pointer',
                                    }}
                                    className="menu-item-hover"
                                >
                                    {level === 0 ? 'Normal text' : `Heading ${level}`}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="toolbar-divider" />

                {/* Basic Formatting */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    active={editor.isActive('bold')}
                    title="Bold"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /></svg>}
                />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    active={editor.isActive('italic')}
                    title="Italic"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></svg>}
                />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    active={editor.isActive('strike')}
                    title="Strikethrough"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 4h3a2 2 0 0 1 0 4h-3m-10 0h3a2 2 0 0 0 0-4h-3m10 8H9m7 4h3a2 2 0 0 1 0 4h-3m-10 0h3a2 2 0 0 1 0-4h-3" /></svg>}
                />

                <div className="toolbar-divider" />

                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    active={editor.isActive('bulletList')}
                    title="Bullet List"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>}
                />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    active={editor.isActive('orderedList')}
                    title="Ordered List"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><path d="M4 6h1v4" /><path d="M4 10h2" /><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" /></svg>}
                />

                <div className="toolbar-divider" />

                <ToolbarButton
                    onClick={addLink}
                    active={editor.isActive('link')}
                    title="Insert Link"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>}
                />
                <div style={{ position: 'relative', display: 'flex', gap: '4px' }}>
                    <ToolbarButton
                        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                        active={editor.isActive('table')}
                        title="Insert Table"
                        icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>}
                    />
                    {editor.isActive('table') && (
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setTableMenuOpen(!tableMenuOpen)}
                                className={`toolbar-btn ${tableMenuOpen ? 'is-active' : ''}`}
                                title="Table Actions"
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 8px' }}
                            >
                                <span style={{ fontSize: '11px', fontWeight: 700 }}>TABLE</span>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                            </button>
                            {tableMenuOpen && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, zIndex: 50, background: '#1A1A1A',
                                    border: '1px solid #2A2A2A', borderRadius: '4px', marginTop: '4px', width: '160px',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)'
                                }}>
                                    {tableActions.map((action, i) => (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                action.action()
                                                setTableMenuOpen(false)
                                            }}
                                            style={{
                                                width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent',
                                                border: 'none', color: action.danger ? '#F87171' : '#D1D5DB', fontSize: '12px', cursor: 'pointer',
                                                fontWeight: action.danger ? 700 : 400
                                            }}
                                            className="menu-item-hover"
                                        >
                                            {action.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    active={editor.isActive('blockquote')}
                    title="Blockquote"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
                />

                <div className="toolbar-divider" />

                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    active={editor.isActive('code')}
                    title="Inline Code"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>}
                />
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                    active={editor.isActive('codeBlock')}
                    title="Code Block"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M7 8l3 3-3 3" /><path d="M12 14h5" /></svg>}
                />
                <ToolbarButton
                    onClick={() => (editor as any).commands.insertSmartTOC()}
                    active={editor.isActive('smartToc')}
                    title="Insert Smart TOC"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /><circle cx="3" cy="6" r="1" /><circle cx="3" cy="12" r="1" /><circle cx="3" cy="18" r="1" /></svg>}
                />
                <ToolbarButton
                    onClick={() => (editor as any).commands.setPageBreak()}
                    active={false}
                    title="Insert Page Break"
                    icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="2" y1="12" x2="22" y2="12" strokeDasharray="4 4" /><path d="M2 18h20M2 6h20" /></svg>}
                />
            </div>

            {/* Editor Area */}
            <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
                <EditorContent editor={editor} className="tiptap-editor-styles" />
            </div>

            <style>{`
                .tiptap-editor-styles .ProseMirror {
                    outline: none;
                    color: #D1D5DB;
                    font-family: inherit;
                    font-size: 15px;
                    line-height: 1.7;
                    min-height: 200px;
                    padding: 40px;
                    max-width: 850px;
                    margin: 0 auto;
                }
                .tiptap-editor-styles .ProseMirror p { margin: 12px 0; }
                .tiptap-editor-styles .ProseMirror h1 { font-size: 2.2em; font-weight: 800; margin: 32px 0 16px; color: #FFFFFF; letter-spacing: -0.02em; }
                .tiptap-editor-styles .ProseMirror h2 { font-size: 1.8em; font-weight: 700; margin: 24px 0 12px; color: #FFFFFF; letter-spacing: -0.01em; }
                .tiptap-editor-styles .ProseMirror h3 { font-size: 1.4em; font-weight: 600; margin: 20px 0 10px; color: #E5E7EB; }
                .tiptap-editor-styles .ProseMirror blockquote {
                    border-left: 4px solid #3B82F6;
                    padding-left: 20px;
                    color: #9CA3AF;
                    font-style: italic;
                    margin: 24px 0;
                    background: rgba(59, 130, 246, 0.05);
                    padding: 12px 20px;
                    border-radius: 0 8px 8px 0;
                }
                .tiptap-editor-styles .ProseMirror table {
                    border-collapse: collapse;
                    table-layout: fixed;
                    width: 100%;
                    margin: 24px 0;
                    overflow: hidden;
                }
                .tiptap-editor-styles .ProseMirror td, .tiptap-editor-styles .ProseMirror th {
                    min-width: 1em;
                    border: 1px solid #2A2A2A;
                    padding: 10px 14px;
                    vertical-align: top;
                    box-sizing: border-box;
                    position: relative;
                }
                .tiptap-editor-styles .ProseMirror th {
                    font-weight: bold;
                    text-align: left;
                    background: #1A1A1A;
                    color: #FFFFFF;
                }
                .tiptap-editor-styles .ProseMirror code {
                    background: rgba(45, 45, 45, 0.8);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-family: 'JetBrains Mono', 'Fira Code', monospace;
                    font-size: 0.9em;
                    color: #A5D6FF; /* Nice light blue for code snippets */
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }
                .tiptap-editor-styles .ProseMirror pre {
                    background: #111111;
                    color: #E2E8F0;
                    font-family: 'JetBrains Mono', 'Fira Code', monospace;
                    padding: 20px;
                    border-radius: 12px;
                    margin: 24px 0;
                    border: 1px solid #2A2A2A;
                    overflow: auto;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                }
                .tiptap-editor-styles .ProseMirror pre code {
                    background: transparent;
                    padding: 0;
                    border-radius: 0;
                    color: inherit;
                    font-size: 0.95em;
                    border: none;
                }
                .tiptap-editor-styles .ProseMirror .editor-link {
                    color: #3B82F6;
                    text-decoration: underline;
                    text-underline-offset: 4px;
                    cursor: pointer;
                }
                

                .tiptap-editor-styles .ProseMirror p.is-editor-empty:first-child::before {
                    content: attr(data-placeholder);
                    float: left;
                    color: #4B5563;
                    pointer-events: none;
                    height: 0;
                }
                .tiptap-editor-styles .ProseMirror ul,
                .tiptap-editor-styles .ProseMirror ol {
                    padding: 0 1rem;
                    margin: 1.25rem 1rem 1.25rem 0.4rem;
                }
                .tiptap-editor-styles .ProseMirror li {
                    margin-bottom: 0.5rem;
                }
                .tiptap-editor-styles .ProseMirror ul li::marker {
                    color: #3B82F6;
                }

                /* Page Break Node Styles */
                .page-break-node {
                    page-break-after: always;
                    break-after: page;
                }
                
                .toolbar-btn {
                    background: transparent;
                    border: 1px solid transparent;
                    color: #9CA3AF;
                    padding: 6px;
                    border-radius: 4px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: 150ms ease;
                }
                .toolbar-btn:hover {
                    background: rgba(255,255,255,0.05);
                    color: #FFFFFF;
                }
                .toolbar-btn.is-active {
                    background: #3B82F6;
                    color: #FFFFFF;
                }
                .toolbar-divider {
                    width: 1px;
                    height: 20px;
                    background: #2A2A2A;
                    margin: 0 4px;
                }
                .menu-item-hover:hover {
                    background: #3B82F6 !important;
                    color: #FFFFFF !important;
                }
                .dropdown-btn {
                    padding: 6px 12px;
                    color: #FFFFFF;
                    font-size: 13px;
                }
            `}</style>
        </div>
    )
}

function ToolbarButton({ onClick, active, icon, title }: { onClick: () => void, active: boolean, icon: React.ReactNode, title: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`toolbar-btn ${active ? 'is-active' : ''}`}
            title={title}
        >
            {icon}
        </button>
    )
}
