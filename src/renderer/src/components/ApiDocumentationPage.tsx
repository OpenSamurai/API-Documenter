import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAppStore } from '@/stores/appStore'
import { db } from '@/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { NormalEditor } from './NormalEditor'
import { DocEngineSidebar } from './DocEngineSidebar'

interface DocPage {
    id: string
    'sidebar-title': string
    position: number
    markdown: string
    type: 'cover' | 'folder' | 'custom'
    visible: boolean
}

export function ApiDocumentationPage() {
    const { currentProjectId, setShowApiDocumentation } = useAppStore()
    const [markdown, setMarkdown] = useState('')
    const [isExporting, setIsExporting] = useState(false)
    const [isCompiling, setIsCompiling] = useState(false)
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [editorType, setEditorType] = useState<'markdown' | 'normal'>('normal')
    const [editorMenuOpen, setEditorMenuOpen] = useState(false)

    const [pages, setPages] = useState<DocPage[]>([])
    const [isInitialized, setIsInitialized] = useState(false)
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [isNamingPage, setIsNamingPage] = useState(false)
    const [pendingTitle, setPendingTitle] = useState('')
    const sidebarRef = useRef<HTMLDivElement>(null)

    // Close sidebar on outside click or scroll
    useEffect(() => {
        const handleOutsideAction = (e: Event) => {
            if (sidebarCollapsed) return
            
            const target = e.target as HTMLElement
            // Don't close if clicking inside sidebar
            if (sidebarRef.current?.contains(target)) return
            // Don't close if clicking the toggle button (it has its own handler)
            if (target.closest('.sidebar-toggle-btn')) return

            setSidebarCollapsed(true)
        }

        if (!sidebarCollapsed) {
            document.addEventListener('mousedown', handleOutsideAction)
            window.addEventListener('wheel', handleOutsideAction, { passive: true })
        }

        return () => {
            document.removeEventListener('mousedown', handleOutsideAction)
            window.removeEventListener('wheel', handleOutsideAction)
        }
    }, [sidebarCollapsed])

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

    useEffect(() => {
        console.log('[ApiDoc] Data Sync:', { project, folders, apis })
    }, [project, folders, apis])

    // One-time initialization from Database
    useEffect(() => {
        if (isInitialized || !project || !folders || !apis) return

        console.log('[ApiDoc] Initializing docObject from DB...')

        const initialPages: DocPage[] = []
        
        // 1. Cover Page (Position 1)
        const coverPage: DocPage = {
            id: 'cover',
            'sidebar-title': 'Cover Page',
            position: 1,
            type: 'cover',
            visible: true,
            markdown: `
<div class="cover-page">
  <div class="cover-content">
    <div class="cover-badge">${project?.version || 'v1.0.0'}</div>
    <h1 class="cover-title">${project?.name || 'API Documentation'}</h1>
    <p class="cover-description">${project?.description || 'Complete technical reference and integration guide.'}</p>
    <div class="cover-footer">
      <div class="footer-item">
        <span class="label">Date</span>
        <span class="value">${new Date().toLocaleDateString()}</span>
      </div>
      <div class="footer-item">
        <span class="label">Status</span>
        <span class="value">Stable</span>
      </div>
    </div>
  </div>
</div>

<div style="page-break-after: always;"></div>
`
        }
        initialPages.push(coverPage)

        // 2. Pre-group APIs by folderId for O(1) lookup
        const apisByFolder = new Map<string, any[]>()
        apis.forEach(a => {
            const fid = a.folderId?.toString()
            if (fid) {
                if (!apisByFolder.has(fid)) apisByFolder.set(fid, [])
                apisByFolder.get(fid)!.push(a)
            }
        })

        // 3. Folders (Position 2+)
        folders.forEach((f, idx) => {
            const folderApis = apisByFolder.get(f.id.toString()) || []
            let md = `## Folder: ${f.name}\n\n`
            if (f.description) md += `${f.description}\n\n`

            folderApis.forEach(api => {
                md += `### Endpoint: ${api.name}\n\n`
                if (api.description) md += `${api.description}\n\n`
                
                md += '#### Request Details\n'
                md += `\`\`\`http\n${api.method} ${api.path}\n\`\`\`\n\n`

                // Headers
                const headers = api.headers?.filter((h: any) => h.enabled && h.key) || []
                if (headers.length > 0) {
                    md += `**Headers**\n\n| Name | Value | Description |\n| --- | --- | --- |\n`
                    headers.forEach((h: any) => {
                        md += `| ${h.key} | ${h.value || '-'} | - |\n`
                    })
                    md += `\n`
                }

                // Parameters (URL Params)
                const params = api.urlParams?.filter((p: any) => p.enabled && p.key) || []
                if (params.length > 0) {
                    md += `**Parameters**\n\n| Key | Value | Description |\n| --- | --- | --- |\n`
                    params.forEach((p: any) => {
                        md += `| ${p.key} | ${p.value || '-'} | - |\n`
                    })
                    md += `\n`
                }

                // Request Body
                if (api.bodyType === 'raw' && api.requestBody) {
                    md += `**Request Body (${api.rawType || 'json'})**\n`
                    md += `\`\`\`${api.rawType || 'json'}\n${api.requestBody}\n\`\`\`\n\n`
                } else if (api.bodyType === 'form-data') {
                    const fd = api.formData?.filter((p: any) => p.enabled && p.key) || []
                    if (fd.length > 0) {
                        md += `**Request Body (Form Data)**\n\n| Key | Value | Type |\n| --- | --- | --- |\n`
                        fd.forEach((p: any) => {
                            md += `| ${p.key} | ${p.value || '-'} | ${p.type || 'text'} |\n`
                        })
                        md += `\n`
                    }
                } else if (api.bodyType === 'urlencoded') {
                    const ue = api.urlencoded?.filter((p: any) => p.enabled && p.key) || []
                    if (ue.length > 0) {
                        md += `**Request Body (URL Encoded)**\n\n| Key | Value |\n| --- | --- |\n`
                        ue.forEach((p: any) => {
                            md += `| ${p.key} | ${p.value || '-'} |\n`
                        })
                        md += `\n`
                    }
                }

                // Response Examples
                if (api.responseExamples && api.responseExamples.length > 0) {
                    md += '#### Response Examples\n\n'
                    api.responseExamples.forEach((ex: any) => {
                        md += `**[${ex.statusCode}] ${ex.title || 'Response'}**\n`
                        if (ex.description) md += `${ex.description}\n\n`
                        md += `\`\`\`json\n${ex.body || ''}\n\`\`\`\n\n`
                    })
                }
            })
            md += `\n<div style="page-break-after: always;"></div>\n\n`

            initialPages.push({
                id: `folder-${f.id}`,
                'sidebar-title': `${f.name}${folderApis.length > 0 ? ` (${folderApis.length})` : ''}`,
                position: idx + 2,
                markdown: md,
                type: 'folder',
                visible: true
            })
        })

        setPages(initialPages)
        setIsInitialized(true)
        setActiveSectionId('cover')
    }, [project, folders, apis, isInitialized])

    // Initial load stabilization
    useEffect(() => {
        if (isInitialized && activeSectionId === null && pages.length > 0) {
            setActiveSectionId('cover')
        }
    }, [isInitialized, pages, activeSectionId])


    const handleEditorChange = useCallback((val: string) => {
        setMarkdown(val)
        if (!activeSectionId) return

        setPages(prev => prev.map(p => p.id === activeSectionId ? { ...p, markdown: val } : p))
    }, [activeSectionId])

    useEffect(() => {
        if (!activeSectionId) return
        const page = pages.find(p => p.id === activeSectionId)
        setMarkdown(page?.markdown || '')
    }, [activeSectionId, pages])

    const compileMd = useMemo(() => {
        const sortedPages = [...pages]
            .filter(p => p.visible)
            .sort((a, b) => a.position - b.position)

        if (sortedPages.length === 0) return ''

        // Generate TOC from all pages except the cover
        const items: { level: number, id: string, text: string }[] = []
        const combinedRegex = /^(#{1,3})\s+(.*)$/gim
        let match
        
        const tocSourceMarkdown = sortedPages
            .filter(p => p.type !== 'cover')
            .map(p => p.markdown)
            .join('\n\n')

        while ((match = combinedRegex.exec(tocSourceMarkdown)) !== null) {
            const level = match[1].length
            const rawText = match[2]
            const id = rawText.toLowerCase().replace(/[^a-z0-9]+/g, '-')
            const cleanText = rawText.replace(/^(Folder:|Endpoint:)\s*/i, '').trim()
            if (cleanText && !cleanText.toLowerCase().includes('table of contents')) {
                items.push({ level, id, text: cleanText })
            }
        }

        let tocMd = ''
        if (items.length > 0) {
            tocMd = `<div id="toc-section" class="toc-container">\n  <div class="toc-title-bar"><h2>Table of Contents</h2></div>\n  <div class="toc-list">\n`
            let folderCount = 0
            let currentFolderGroupOpen = false
            items.forEach((item) => {
                if (item.level <= 2) {
                    if (currentFolderGroupOpen) tocMd += `      </div>\n    </div>\n`
                    folderCount++
                    tocMd += `    <div class="toc-folder-group">\n      <div class="toc-folder-item"><span class="toc-folder-number">${folderCount.toString().padStart(2, '0')}</span><a href="#${item.id}" class="toc-folder-link">${item.text}</a></div>\n      <div class="toc-endpoints-container">\n`
                    currentFolderGroupOpen = true
                } else if (item.level === 3 && currentFolderGroupOpen) {
                    tocMd += `        <div class="toc-endpoint-item"><span class="toc-endpoint-bullet">•</span><a href="#${item.id}" class="toc-endpoint-link">${item.text}</a></div>\n`
                }
            })
            if (currentFolderGroupOpen) tocMd += `      </div>\n    </div>\n`
            tocMd += `  </div>\n</div>\n\n<div style="page-break-after: always;"></div>\n\n`
        }

        // Final assembly: Cover, TOC, all other pages
        const assembledParts: string[] = []
        sortedPages.forEach((p, idx) => {
            assembledParts.push(p.markdown)
            // Inject TOC after the 1st page (usually Cover)
            if (idx === 0 && tocMd) {
                assembledParts.push(tocMd)
            }
        })

        // If fewer than 2 pages, just append TOC at the end of what we have if not already added
        if (sortedPages.length < 2 && tocMd && assembledParts.length > 0) {
            assembledParts.push(tocMd)
        }

        return assembledParts.filter(Boolean).join('\n\n')
    }, [pages])

    const isCompilingRef = useRef(false)
    const needsRecompileRef = useRef(false)

    const handleRecompile = useCallback(async () => {
        if (!compileMd.trim()) return

        if (isCompilingRef.current) {
            // Queue a recompile for after the current one finishes
            needsRecompileRef.current = true
            return
        }
        
        isCompilingRef.current = true
        setIsCompiling(true)
        try {
            const result = await (window as any).electronAPI.previewDocPdf(compileMd)
            if (result.success && result.data) {
                const blob = new Blob([result.data], { type: 'application/pdf' })
                const url = URL.createObjectURL(blob)
                setPdfUrl(prev => {
                    if (prev) URL.revokeObjectURL(prev)
                    return url
                })
            } else {
                alert(`Compilation failed: ${result.error}`)
            }
        } catch (err) {
            console.error('PDF Preview Error:', err)
        } finally {
            isCompilingRef.current = false
            setIsCompiling(false)
            
            // If a change happened while compiling, compile again
            if (needsRecompileRef.current) {
                needsRecompileRef.current = false
                setTimeout(handleRecompile, 100)
            }
        }
    }, [compileMd])

    // Auto-compile PDF preview once initialized, with a debounce to avoid lag during typing
    useEffect(() => {
        if (!isInitialized || !compileMd.trim()) return

        const timeout = setTimeout(() => {
            handleRecompile()
        }, 1500) // 1.5s debounce for PDF generation

        return () => clearTimeout(timeout)
    }, [isInitialized, compileMd, handleRecompile])



    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault()
                handleRecompile()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleRecompile])

    const handleExportPdf = async () => {
        if (!compileMd.trim() || isExporting) return
        setIsExporting(true)
        try {
            const fileName = `${project?.name || 'api'}-docs.pdf`
            const result = await (window as any).electronAPI.generateDocPdf(compileMd, fileName)
            if (result.success) { /* Success Notification */ }
            else if (result.error !== 'Cancelled') { alert(`Export failed: ${result.error}`) }
        } catch (err) {
            console.error('PDF Export Error:', err)
        } finally {
            setIsExporting(false)
        }
    }

    const handleToggleSection = (id: string) => {
        setPages(prev => prev.map(p => p.id === id ? { ...p, visible: !p.visible } : p))
    }

    const handleSelectSection = (id: string) => {
        setActiveSectionId(id)
    }

    const handleAddCustomPage = useCallback(() => {
        setPendingTitle(`Untitled Page ${pages.filter(p => p.type === 'custom').length + 1}`)
        setIsNamingPage(true)
    }, [pages])

    const confirmAddPage = () => {
        const title = pendingTitle.trim() || 'Untitled Page'
        const newId = `custom-${Date.now()}`
        const maxPos = pages.length > 0 ? Math.max(...pages.map(p => p.position)) : 0
        
        const newPage: DocPage = {
            id: newId,
            'sidebar-title': title,
            position: maxPos + 1,
            type: 'custom',
            visible: true,
            markdown: `# ${title}\n\nStart writing your custom content here...\n\n<div style="page-break-after: always;"></div>`
        }

        setPages(prev => [...prev, newPage])
        setActiveSectionId(newId)
        setIsNamingPage(false)
        setPendingTitle('')
    }

    const handleReorderSection = useCallback((id: string, direction: 'up' | 'down') => {
        setPages(prev => {
            const sorted = [...prev].sort((a, b) => a.position - b.position)
            const index = sorted.findIndex(p => p.id === id)
            if (index < 0) return prev

            if (index === 1 && direction === 'up') return prev // Can't move before cover (Wait, index 1 is first after cover)
            if (index === 0) return prev // Can't move cover

            const targetIndex = direction === 'up' ? index - 1 : index + 1
            if (targetIndex < 1 || targetIndex >= sorted.length) return prev

            // Get the items and their target positions
            const currentItem = sorted[index]
            const targetItem = sorted[targetIndex]
            
            const currentPos = currentItem.position
            const targetPos = targetItem.position

            // Immutably swap the positions
            return prev.map(p => {
                if (p.id === currentItem.id) {
                    return { ...p, position: targetPos }
                }
                if (p.id === targetItem.id) {
                    return { ...p, position: currentPos }
                }
                return p
            })
        })
    }, [])

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100%',
            background: '#050505', color: '#FFFFFF', overflow: 'hidden',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            {/* Premium Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 24px', height: '64px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                background: 'rgba(15, 15, 15, 0.7)',
                backdropFilter: 'blur(12px)',
                zIndex: 100
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <button
                        onClick={() => setShowApiDocumentation(false)}
                        className="hover-fade"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
                            background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '10px', color: '#9CA3AF', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5" /><polyline points="12 19 5 12 12 5" /></svg>
                        Exit Builder
                    </button>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em' }}>
                            API Documentation Builder
                        </h2>
                        <span style={{ fontSize: '10px', color: '#4B5563', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {project?.name || 'Loading Project...'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ height: '24px', width: '1px', background: 'rgba(255, 255, 255, 0.1)', margin: '0 8px' }} />
                    <button
                        onClick={handleRecompile}
                        disabled={isCompiling}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px',
                            background: 'transparent', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '10px',
                            color: '#FFFFFF', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                        {isCompiling ? (
                            <div className="animate-spin" style={{ width: '14px', height: '14px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%' }} />
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
                        )}
                        {isCompiling ? 'Compiling...' : 'Recompile PDF'}
                    </button>
                    <button
                        onClick={handleExportPdf}
                        disabled={isExporting}
                        className="btn-primary-glow"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 24px',
                            background: '#FFFFFF', border: 'none', borderRadius: '10px',
                            color: '#000000', fontSize: '13px', fontWeight: 700,
                            cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            boxShadow: '0 4px 14px rgba(255, 255, 255, 0.2)'
                        }}
                    >
                        {isExporting ? (
                            <div className="animate-spin" style={{ width: '14px', height: '14px', border: '2px solid #000', borderTopColor: 'transparent', borderRadius: '50%' }} />
                        ) : (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                        )}
                        {isExporting ? 'Exporting...' : 'Export as PDF'}
                    </button>
                </div>
            </div>

            {/* Main Application Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
                {/* Sidebar Collapse Toggle */}
                <button
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    className="sidebar-toggle-btn"
                    style={{
                        position: 'absolute', top: '50%', left: sidebarCollapsed ? '0' : '260px',
                        transform: 'translateY(-50%)', zIndex: 130,
                        width: '16px', height: '48px', background: '#1A1A1A',
                        border: '1px solid rgba(255, 255, 255, 0.1)', borderLeft: 'none',
                        borderRadius: '0 8px 8px 0', color: '#6B7280', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        boxShadow: '4px 0 10px rgba(0,0,0,0.3)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'}
                    onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ transform: sidebarCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.3s' }}>
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>

                {/* Section Sidebar */}
                <div 
                    ref={sidebarRef}
                    style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: '260px',
                    zIndex: 120,
                    transform: sidebarCollapsed ? 'translateX(-100%)' : 'translateX(0)',
                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: sidebarCollapsed ? 'none' : '20px 0 50px rgba(0,0,0,0.5)',
                    background: '#0F0F0F',
                    overflow: 'hidden'
                }}>
                    <DocEngineSidebar
                        pages={pages}
                        activeSectionId={activeSectionId}
                        onToggleSection={handleToggleSection}
                        onSelectSection={handleSelectSection}
                        onAddCustomPage={handleAddCustomPage}
                        onReorderSection={handleReorderSection}
                    />
                </div>

                {/* Editor & Preview Split */}
                <div style={{ 
                    display: 'flex', 
                    flex: 1, 
                    overflow: 'hidden', 
                    width: '100%', 
                    marginLeft: 0, // Overlaid sidebar - no resizing
                    transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)' 
                }}>
                    {/* Editor Container */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #1F1F1F', minWidth: 0 }}>
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
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                                </button>
                                {editorMenuOpen && (
                                    <>
                                        <div 
                                            onClick={() => setEditorMenuOpen(false)}
                                            style={{
                                                position: 'fixed',
                                                inset: 0,
                                                zIndex: 190,
                                                background: 'transparent'
                                            }}
                                        />
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, zIndex: 200, background: '#1A1A1A',
                                            border: '1px solid #2A2A2A', borderRadius: '4px', marginTop: '8px', width: '150px',
                                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)'
                                        }}>
                                            <button onClick={() => { setEditorType('markdown'); setEditorMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', color: '#D1D5DB', fontSize: '11px', cursor: 'pointer' }}>MARKDOWN</button>
                                            <button onClick={() => { setEditorType('normal'); setEditorMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', color: '#D1D5DB', fontSize: '11px', cursor: 'pointer' }}>NORMAL</button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {editorType === 'markdown' ? (
                            <textarea
                                value={markdown}
                                onChange={(e) => handleEditorChange(e.target.value)}
                                style={{
                                    flex: 1, padding: '24px', background: '#0F0F0F', color: '#D1D5DB',
                                    border: 'none', resize: 'none', outline: 'none',
                                    fontFamily: 'monospace', fontSize: '13px', lineHeight: 1.6
                                }}
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

                    {/* Preview Container */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#111111', overflow: 'hidden' }}>
                        <div style={{ padding: '8px 16px', background: '#151515', borderBottom: '1px solid #1F1F1F' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>PDF Live Preview</span>
                        </div>
                        {pdfUrl ? (
                            <iframe src={pdfUrl} style={{ width: '100%', height: '100%', border: 'none' }} title="PDF Preview" />
                        ) : (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                                <div className="animate-spin" style={{ width: '32px', height: '32px', border: '3px solid #1F1F1F', borderTopColor: '#FFFFFF', borderRadius: '50%' }} />
                                <span style={{ fontSize: '13px', color: '#6B7280' }}>Preparing PDF Preview...</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Custom Page Title Modal */}
            {isNamingPage && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(0, 0, 0, 0.8)', backdropFilter: 'blur(8px)'
                }}>
                    <div style={{
                        width: '400px', background: '#111111', border: '1px solid #1F1F1F',
                        borderRadius: '16px', padding: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                        display: 'flex', flexDirection: 'column', gap: '20px'
                    }}>
                        <div>
                            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 700, color: '#FFFFFF' }}>New Document Page</h3>
                            <p style={{ margin: 0, fontSize: '13px', color: '#6B7280' }}>Give your custom page a descriptive title.</p>
                        </div>

                        <input
                            autoFocus
                            value={pendingTitle}
                            onChange={(e) => setPendingTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') confirmAddPage()
                                if (e.key === 'Escape') setIsNamingPage(false)
                            }}
                            placeholder="Enter title..."
                            style={{
                                width: '100%', padding: '12px 16px', background: '#0A0A0A',
                                border: '1px solid #2A2A2A', borderRadius: '10px',
                                color: '#FFFFFF', fontSize: '14px', outline: 'none'
                            }}
                        />

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setIsNamingPage(false)}
                                style={{
                                    padding: '10px 18px', background: 'transparent', border: 'none',
                                    color: '#6B7280', fontSize: '13px', fontWeight: 600, cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmAddPage}
                                style={{
                                    padding: '10px 24px', background: '#FFFFFF', border: 'none',
                                    color: '#000000', fontSize: '13px', fontWeight: 700,
                                    borderRadius: '10px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(255,255,255,0.1)'
                                }}
                            >
                                Create Page
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}