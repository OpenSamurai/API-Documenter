import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { db } from '@/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { Project, Folder, ApiCollection } from '@/types'
import { NormalEditor } from './NormalEditor'

export function ApiDocumentationPage() {
    const { currentProjectId, setShowApiDocumentation } = useAppStore()
    const [markdown, setMarkdown] = useState('')
    const [isExporting, setIsExporting] = useState(false)
    const [isCompiling, setIsCompiling] = useState(false)
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [editorType, setEditorType] = useState<'markdown' | 'normal'>('normal')
    const [editorMenuOpen, setEditorMenuOpen] = useState(false)

    // Fetch project data
    const project = useLiveQuery(async () => 
        currentProjectId ? await db.projects.get(currentProjectId) : null
    , [currentProjectId])

    const folders = useLiveQuery(async () => 
        currentProjectId ? await db.folders.where('projectId').equals(currentProjectId).sortBy('orderIndex') : []
    , [currentProjectId])

    const apis = useLiveQuery(async () => 
        currentProjectId ? await db.apiCollections.where('projectId').equals(currentProjectId).toArray() : []
    , [currentProjectId])

    // Generate initial markdown template
    useEffect(() => {
        if (!project || folders === undefined || apis === undefined || markdown) return

        let md = `<div style="height: 85vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; font-family: sans-serif;">\n`
        md += `  <h1 style="font-size: 3.5rem; margin-bottom: 0.5rem; color: #111827;">${project.name}</h1>\n`
        md += `  <p style="font-size: 1.5rem; color: #4B5563; margin-bottom: 2rem;">Comprehensive API Reference Documentation</p>\n`
        md += `  <div style="width: 60px; height: 4px; background: #3B82F6; margin-bottom: 2rem;"></div>\n`
        md += `  <p style="font-size: 1.1rem; color: #6B7280;">Version: 1.0.0</p>\n`
        md += `  <p style="font-size: 1.1rem; color: #6B7280;">Date: ${new Date().toLocaleDateString()}</p>\n`
        md += `</div>\n`
        md += `<div style="page-break-after: always;"></div>\n\n`

        // --- Table of Contents ---
        md += `<div id="toc-section" class="toc-container">\n`
        md += `  <div class="toc-title-bar">\n`
        md += `    <h2>Table of Contents</h2>\n`
        md += `  </div>\n`
        
        md += `  <div class="toc-list">\n`
        if (folders) {
            folders.forEach((folder, fIndex) => {
                const folderId = `folder-${folder.id || fIndex}`
                const cleanFolderName = folder.name.replace(/^(Folder:)\s*/i, '').trim()
                md += `    <div class="toc-folder-group">\n`
                md += `      <div class="toc-folder-item">\n`
                md += `        <span class="toc-folder-number">${(fIndex + 1).toString().padStart(2, '0')}</span>\n`
                md += `        <a href="#${folderId}" class="toc-folder-link">${cleanFolderName}</a>\n`
                md += `      </div>\n`
                md += `      <div class="toc-endpoints-container">\n`
                
                const folderApis = apis?.filter(a => a.folderId === folder.id) || []
                folderApis.forEach((api) => {
                    const apiId = `api-${api.id}`
                    const cleanApiName = api.name.replace(/^(Endpoint:)\s*/i, '').trim()
                    md += `        <div class="toc-endpoint-item">\n`
                    md += `          <span class="toc-endpoint-bullet">•</span>\n`
                    md += `          <a href="#${apiId}" class="toc-endpoint-link">${cleanApiName}</a>\n`
                    md += `        </div>\n`
                })
                md += `      </div>\n` // End endpoints
                md += `    </div>\n` // End folder-group
            })
        }
        md += `  </div>\n`
        md += `</div>\n`
        md += `\n<div style="page-break-after: always;"></div>\n\n`

        // --- Main Content ---
        if (folders) {
            folders.forEach(folder => {
                const folderId = `folder-${folder.id}`
                md += `<h2 id="${folderId}">Folder: ${folder.name}</h2>\n`
                if (folder.description) md += `${folder.description}\n\n`
                
                const folderApis = apis?.filter(a => a.folderId === folder.id) || []
                folderApis.forEach(api => {
                    const apiId = `api-${api.id}`
                    md += `<h3 id="${apiId}">Endpoint: ${api.name}</h3>\n`
                    md += `<div><strong>Method:</strong> <span class="method method-${api.method}">${api.method}</span> &nbsp;&nbsp; <strong>Path:</strong> <code>${api.path}</code></div>\n\n`
                    if (api.description) md += `${api.description}\n\n`
                    
                    // Query Params
                    const enabledParams = api.urlParams?.filter(p => p.enabled && p.key) || []
                    if (enabledParams.length > 0) {
                        md += `#### Query Parameters\n`
                        md += `| Parameter | Value | Description |\n| --- | --- | --- |\n`
                        enabledParams.forEach(p => {
                            md += `| ${p.key} | ${p.value || '-'} | - |\n`
                        })
                        md += `\n`
                    }

                    // Headers
                    const enabledHeaders = api.headers?.filter(h => h.enabled && h.key) || []
                    if (enabledHeaders.length > 0) {
                        md += `#### Request Headers\n`
                        md += `| Header | Value | Description |\n| --- | --- | --- |\n`
                        enabledHeaders.forEach(h => {
                            md += `| ${h.key} | ${h.value} | - |\n`
                        })
                        md += `\n`
                    }

                    // Body
                    if (api.bodyType !== 'none') {
                        md += `#### Request Body (${api.bodyType}${api.rawType ? `: ${api.rawType}` : ''})\n`
                        if (api.bodyType === 'raw' && api.requestBody) {
                            try {
                                if (api.rawType === 'json') {
                                    const formatted = JSON.stringify(JSON.parse(api.requestBody), null, 2)
                                    md += `\`\`\`json\n${formatted}\n\`\`\`\n\n`
                                } else {
                                    md += `\`\`\`${api.rawType || 'text'}\n${api.requestBody}\n\`\`\`\n\n`
                                }
                            } catch (e) {
                                md += `\`\`\`${api.rawType || 'text'}\n${api.requestBody}\n\`\`\`\n\n`
                            }
                        } else if (api.bodyType === 'form-data' && api.formData) {
                            const enabledForm = api.formData.filter(f => f.enabled && f.key)
                            if (enabledForm.length > 0) {
                                md += `| Key | Value | Type |\n| --- | --- | --- |\n`
                                enabledForm.forEach(f => {
                                    md += `| ${f.key} | ${f.value} | ${f.type || 'text'} |\n`
                                })
                                md += `\n`
                            }
                        } else if (api.bodyType === 'urlencoded' && api.urlencoded) {
                            const enabledUrl = api.urlencoded.filter(f => f.enabled && f.key)
                            if (enabledUrl.length > 0) {
                                md += `| Key | Value |\n| --- | --- |\n`
                                enabledUrl.forEach(f => {
                                    md += `| ${f.key} | ${f.value} |\n`
                                })
                                md += `\n`
                            }
                        }
                    }

                    // Examples
                    if (api.responseExamples && api.responseExamples.length > 0) {
                        md += `#### Response Examples\n`
                        api.responseExamples.forEach(ex => {
                            const statusClass = ex.statusCode >= 500 ? '5xx' : ex.statusCode >= 400 ? '4xx' : ex.statusCode >= 300 ? '3xx' : '2xx'
                            md += `##### Example: ${ex.title} <span class="status-code status-${statusClass}">${ex.statusCode}</span>\n`
                            if (ex.description) md += `${ex.description}\n\n`
                            
                            if (ex.headers && ex.headers.length > 0) {
                                md += `**Response Headers:**\n`
                                md += `| Header | Value |\n| --- | --- |\n`
                                ex.headers.forEach(h => {
                                    md += `| ${h.key} | ${h.value} |\n`
                                })
                                md += `\n`
                            }

                            if (ex.body) {
                                try {
                                    const formatted = JSON.stringify(JSON.parse(ex.body), null, 2)
                                    md += `\`\`\`json\n${formatted}\n\`\`\`\n\n`
                                } catch (e) {
                                    md += `\`\`\`text\n${ex.body}\n\`\`\`\n\n`
                                }
                            }
                            md += `\n`
                        })
                    }
                })
                md += `\n<div style="page-break-after: always;"></div>\n\n`
            })
        }

        setMarkdown(md)
    }, [project, folders, apis, markdown])

    const handleEditorChange = useCallback((val: string) => {
        setMarkdown(val)
    }, [])

    const handleRecompile = async () => {
        if (!markdown || isCompiling) return
        setIsCompiling(true)
        try {
            const result = await (window as any).electronAPI.previewDocPdf(markdown)
            if (result.success && result.data) {
                if (pdfUrl) URL.revokeObjectURL(pdfUrl)
                const blob = new Blob([result.data], { type: 'application/pdf' })
                const url = URL.createObjectURL(blob)
                setPdfUrl(url)
            } else {
                alert(`Compilation failed: ${result.error}`)
            }
        } catch (err) {
            console.error('PDF Preview Error:', err)
        } finally {
            setIsCompiling(false)
        }
    }

    // Keyboard shortcut for recompiling (Ctrl+S or Cmd+S)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault()
                handleRecompile()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [markdown, isCompiling]) // Re-bind if these change, though handleRecompile uses current state

    // Initial compilation
    useEffect(() => {
        if (markdown && !pdfUrl && !isCompiling) {
            handleRecompile()
        }
    }, [markdown, pdfUrl, isCompiling])

    const handleExportPdf = async () => {
        if (!markdown || isExporting) return
        setIsExporting(true)
        try {
            const fileName = `${project?.name || 'api'}-docs.pdf`
            const result = await (window as any).electronAPI.generateDocPdf(markdown, fileName)
            if (result.success) {
                // Success
            } else if (result.error !== 'Cancelled') {
                alert(`Export failed: ${result.error}`)
            }
        } catch (err) {
            console.error('PDF Export Error:', err)
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0A0A0A' }}>
            {/* Header */}
            <div style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                padding: '12px 24px', borderBottom: '1px solid #1F1F1F', background: '#0F0F0F' 
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button 
                        onClick={() => setShowApiDocumentation(false)}
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', 
                            background: 'transparent', border: '1px solid #2A2A2A', borderRadius: '8px', 
                            color: '#9CA3AF', fontSize: '13px', cursor: 'pointer' 
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                        </svg>
                        Back
                    </button>
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#FFFFFF' }}>
                        API Documentation Engine
                    </h2>
                </div>

                <button 
                    onClick={handleExportPdf}
                    disabled={isExporting}
                    style={{ 
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', 
                        background: '#FFFFFF', border: 'none', borderRadius: '8px', 
                        color: '#000000', fontSize: '13px', fontWeight: 600, cursor: isExporting ? 'wait' : 'pointer',
                        opacity: isExporting ? 0.7 : 1
                    }}
                >
                    {isExporting ? (
                        <div className="animate-spin" style={{ width: '14px', height: '14px', border: '2px solid #000', borderTopColor: 'transparent', borderRadius: '50%' }} />
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                    )}
                    {isExporting ? 'Exporting...' : 'Export as PDF'}
                </button>
            </div>

            {/* Split View */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Editor */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1F1F1F' }}>
                    <div style={{ 
                        padding: '8px 16px', background: '#151515', borderBottom: '1px solid #1F1F1F',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                        <div style={{ position: 'relative' }}>
                            <button 
                                onClick={() => setEditorMenuOpen(!editorMenuOpen)}
                                style={{ 
                                    background: 'transparent', border: 'none', color: '#6B7280', 
                                    fontSize: '11px', fontWeight: 600, padding: 0, cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase', 
                                    letterSpacing: '0.05em' 
                                }}
                            >
                                {editorType === 'markdown' ? 'MARKDOWN editor' : 'Normal editor'}
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6"/></svg>
                            </button>
                            {editorMenuOpen && (
                                <div style={{ 
                                    position: 'absolute', top: '100%', left: 0, zIndex: 60, background: '#1A1A1A', 
                                    border: '1px solid #2A2A2A', borderRadius: '4px', marginTop: '8px', width: '150px',
                                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)'
                                }}>
                                    <button
                                        onClick={() => { setEditorType('markdown'); setEditorMenuOpen(false); }}
                                        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', color: '#D1D5DB', fontSize: '11px', cursor: 'pointer' }}
                                    >
                                        MARKDOWN editor
                                    </button>
                                    <button
                                        onClick={() => { setEditorType('normal'); setEditorMenuOpen(false); }}
                                        style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', color: '#D1D5DB', fontSize: '11px', cursor: 'pointer' }}
                                    >
                                        Normal editor
                                    </button>
                                </div>
                            )}
                        </div>
                        <button 
                            onClick={handleRecompile}
                            disabled={isCompiling}
                            style={{ 
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', 
                                background: isCompiling ? 'transparent' : '#1F1F1F', border: '1px solid #2A2A2A', 
                                borderRadius: '6px', color: '#FFFFFF', fontSize: '11px', fontWeight: 600, 
                                cursor: isCompiling ? 'wait' : 'pointer', transition: '150ms ease'
                            }}
                        >
                            {isCompiling ? (
                                <div className="animate-spin" style={{ width: '10px', height: '10px', border: '1.5px solid #fff', borderTopColor: 'transparent', borderRadius: '50%' }} />
                            ) : (
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                                </svg>
                            )}
                            {isCompiling ? 'Compiling PDF...' : 'Recompile PDF'}
                        </button>
                    </div>

                    {!markdown && (folders === undefined || apis === undefined) ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0F0F0F', gap: '16px' }}>
                            <div className="animate-spin" style={{ width: '32px', height: '32px', border: '3px solid #1F1F1F', borderTopColor: '#FFFFFF', borderRadius: '50%' }} />
                            <span style={{ fontSize: '13px', color: '#6B7280' }}>Generating initial documentation...</span>
                        </div>
                    ) : editorType === 'markdown' ? (
                        <textarea 
                            value={markdown}
                            onChange={(e) => setMarkdown(e.target.value)}
                            style={{ 
                                flex: 1, padding: '24px', background: '#0F0F0F', color: '#D1D5DB', 
                                border: 'none', resize: 'none', outline: 'none', 
                                fontFamily: 'monospace', fontSize: '13px', lineHeight: 1.6
                            }}
                            placeholder="# Start writing documentation..."
                        />
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                            <NormalEditor 
                                content={markdown}
                                onChange={handleEditorChange}
                                folders={folders || []}
                                apis={apis || []}
                            />
                        </div>
                    )}
                </div>

                {/* Preview */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#111111', overflow: 'hidden' }}>
                    <div style={{ padding: '8px 16px', background: '#151515', borderBottom: '1px solid #1F1F1F' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PDF Live Preview</span>
                    </div>
                    {pdfUrl ? (
                        <iframe 
                            src={pdfUrl} 
                            style={{ width: '100%', height: '100%', border: 'none' }}
                            title="PDF Preview"
                        />
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                            <div className="animate-spin" style={{ width: '32px', height: '32px', border: '3px solid #1F1F1F', borderTopColor: '#FFFFFF', borderRadius: '50%' }} />
                            <span style={{ fontSize: '13px', color: '#6B7280' }}>Preparing PDF Preview...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
