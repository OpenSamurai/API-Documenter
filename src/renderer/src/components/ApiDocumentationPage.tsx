import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { db } from '@/db'
import { useLiveQuery } from 'dexie-react-hooks'
import { NormalEditor } from './NormalEditor'
import { DocEngineSidebar } from './DocEngineSidebar'

interface DocSection {
    id: string
    title: string
    type: 'cover' | 'folder' | 'custom'
    visible: boolean
    content?: string
}

export function ApiDocumentationPage() {
    const { currentProjectId, setShowApiDocumentation } = useAppStore()
    const [markdown, setMarkdown] = useState('')
    const [isExporting, setIsExporting] = useState(false)
    const [isCompiling, setIsCompiling] = useState(false)
    const [pdfUrl, setPdfUrl] = useState<string | null>(null)
    const [editorType, setEditorType] = useState<'markdown' | 'normal'>('normal')
    const [editorMenuOpen, setEditorMenuOpen] = useState(false)

    const [sections, setSections] = useState<DocSection[]>([])
    const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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

    // Sync sections when folders/project load or change (REACTIVE)
    useEffect(() => {
        if (!project || folders === undefined) return

        setSections(prev => {
            const newSections: DocSection[] = []

            // 1. Maintain or initialize core sections
            const coverSection = prev.find(s => s.id === 'cover') || { id: 'cover', title: 'Cover Page', type: 'cover', visible: true }
            const tocSection = prev.find(s => s.id === 'toc') || { id: 'toc', title: 'Table of Contents', type: 'toc', visible: true }
            newSections.push(coverSection, tocSection)

            // 2. Process folders with collision detection
            const nameCounts: Record<string, number> = {}
            const processedFolders = folders.map(f => {
                const cleanName = f.name.replace(/^(Folder:)\s*/i, '').trim()
                nameCounts[cleanName] = (nameCounts[cleanName] || 0) + 1
                return { ...f, cleanName }
            })

            const activeDuplicates: Record<string, number> = {}
            processedFolders.forEach(folder => {
                let displayTitle = folder.cleanName
                if (nameCounts[folder.cleanName] > 1) {
                    activeDuplicates[folder.cleanName] = (activeDuplicates[folder.cleanName] || 0) + 1
                    displayTitle = `${folder.cleanName} (${activeDuplicates[folder.cleanName]})`
                }

                // Preserve visibility if it already existed
                const existing = prev.find(s => s.id === `folder-${folder.id}`)
                newSections.push({
                    id: `folder-${folder.id}`,
                    title: displayTitle,
                    type: 'folder',
                    visible: existing ? existing.visible : true
                })
            })

            // 3. Keep custom pages
            const customPages = prev.filter(s => s.type === 'custom')
            newSections.push(...customPages)

            // Avoid infinite loops by only updating if something actually changed (title or new sections)
            const titlesChanged = prev.length !== newSections.length ||
                newSections.some((ns, i) => prev[i]?.title !== ns.title || prev[i]?.id !== ns.id)

            return titlesChanged ? newSections : prev
        })

        // On first load, set active section if none
        if (activeSectionId === null && sections.length > 0) {
            setActiveSectionId(sections[0].id)
        }
    }, [project, folders])

    // Track which section IDs have been processed into the markdown already
    const processedSectionIds = useRef<Set<string>>(new Set())

    const generateSectionMarkdown = useCallback((section: DocSection, folders: any[], apis: any[], project: any) => {
        let md = ''
        if (section.id === 'cover' && project) {
            md += `<div style="height: 85vh; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; font-family: sans-serif;">\n`
            md += `  <h1 style="font-size: 3.5rem; margin-bottom: 0.5rem; color: #111827;">${project.name}</h1>\n`
            md += `  <p style="font-size: 1.5rem; color: #4B5563; margin-bottom: 2rem;">Comprehensive API Reference Documentation</p>\n`
            md += `  <div style="width: 60px; height: 4px; background: #3B82F6; margin-bottom: 2rem;"></div>\n`
            md += `  <p style="font-size: 1.1rem; color: #6B7280;">Version: 1.0.0</p>\n`
            md += `  <p style="font-size: 1.1rem; color: #6B7280;">Date: ${new Date().toLocaleDateString()}</p>\n`
            md += `</div>\n`
            md += `<div style="page-break-after: always;"></div>\n\n`
        } else if (section.id === 'toc') {
            // TOC is NOT rendered in the editor; it is injected at compile time only
            return ''
        } else if (section.type === 'folder' && folders) {
            const folderIdValue = section.id.replace('folder-', '')
            const folder = folders.find(f => f.id === folderIdValue)
            if (folder) {
                md += `<h2 id="${section.id}">Folder: ${section.title}</h2>\n`
                if (folder.description) md += `${folder.description}\n\n`
                const folderApis = apis?.filter(a => a.folderId === folder.id) || []
                folderApis.forEach(api => {
                    const apiId = `api-${api.id}`
                    md += `<h3 id="${apiId}">Endpoint: ${api.name}</h3>\n`
                    md += `<div><strong>Method:</strong> <span class="method method-${api.method}">${api.method}</span> &nbsp;&nbsp; <strong>Path:</strong> <code>${api.path}</code></div>\n\n`
                    if (api.description) md += `${api.description}\n\n`
                    const params = api.urlParams?.filter((p: any) => p.enabled && p.key) || []
                    if (params.length > 0) {
                        md += `#### Query Parameters\n| Parameter | Value | Description |\n| --- | --- | --- |\n`
                        params.forEach((p: any) => { md += `| ${p.key} | ${p.value || '-'} | - |\n` })
                        md += `\n`
                    }
                    const headers = api.headers?.filter((h: any) => h.enabled && h.key) || []
                    if (headers.length > 0) {
                        md += `#### Request Headers\n| Header | Value | Description |\n| --- | --- | --- |\n`
                        headers.forEach((h: any) => { md += `| ${h.key} | ${h.value} | - |\n` })
                        md += `\n`
                    }
                    if (api.bodyType !== 'none') {
                        md += `#### Request Body (${api.bodyType}${api.rawType ? `: ${api.rawType}` : ''})\n`
                        if (api.bodyType === 'raw' && api.requestBody) {
                            try {
                                if (api.rawType === 'json') md += `\`\`\`json\n${JSON.stringify(JSON.parse(api.requestBody), null, 2)}\n\`\`\`\n\n`
                                else md += `\`\`\`${api.rawType || 'text'}\n${api.requestBody}\n\`\`\`\n\n`
                            } catch (e) { md += `\`\`\`${api.rawType || 'text'}\n${api.requestBody}\n\`\`\`\n\n` }
                        }
                    }
                    if (api.responseExamples?.length) {
                        md += `#### Response Examples\n`
                        api.responseExamples.forEach((ex: any) => {
                            const sc = ex.statusCode >= 500 ? '5xx' : ex.statusCode >= 400 ? '4xx' : ex.statusCode >= 300 ? '3xx' : '2xx'
                            md += `##### Example: ${ex.title} <span class="status-code status-${sc}">${ex.statusCode}</span>\n`
                            if (ex.body) {
                                try { md += `\`\`\`json\n${JSON.stringify(JSON.parse(ex.body), null, 2)}\n\`\`\`\n\n` }
                                catch (e) { md += `\`\`\`text\n${ex.body}\n\`\`\`\n\n` }
                            }
                        })
                    }
                })
                md += `\n<div style="page-break-after: always;"></div>\n\n`
            }
        }
        return md
    }, [])

    // Generate TOC HTML for compile-time injection
    const generateTocForCompile = useCallback((src: string) => {
        const items: { level: number, id: string, text: string }[] = []

        if (src) {
            // Hybrid regex to find:
            // 1. HTML style: <h2 id="folder-1">Folder: Title</h2>
            // 2. MD style:   ## Folder: Title
            // Note: gm flags for multiline markdown matching
            const combinedRegex = /(?:<(h[23])\b[^>]*?id=["']([^"']+)["'][^>]*?>([\s\S]*?)<\/h\1>)|(?:^(#{2,3})\s+(?:Folder:|Endpoint:)\s*(.*)$)/gim

            let match
            while ((match = combinedRegex.exec(src)) !== null) {
                let level = 0
                let id = ""
                let rawText = ""

                if (match[1]) {
                    // HTML match
                    level = match[1].toLowerCase() === 'h2' ? 2 : 3
                    id = match[2]
                    rawText = match[3]
                } else if (match[4]) {
                    // Markdown match
                    level = match[4].length // ## is 2, ### is 3
                    rawText = match[5]
                    // Slugify if no ID (for links to work if PDF engine supports it, or just for structure)
                    id = rawText.toLowerCase().replace(/[^a-z0-9]+/g, '-')
                }

                // Clean the text
                const cleanText = rawText.replace(/<[^>]+>/g, '').replace(/^(Folder:|Endpoint:)\s*/i, '').trim()
                if (cleanText && !cleanText.toLowerCase().includes('table of contents')) {
                    items.push({ level, id, text: cleanText })
                }
            }
        }

        // NO FALLBACK: If nothing in MD, TOC is empty (per user request: MD is source of truth)
        if (items.length === 0) return ''

        let tocMd = `<div id="toc-section" class="toc-container">\n`
        tocMd += `  <div class="toc-title-bar">\n`
        tocMd += `    <h2>Table of Contents</h2>\n`
        tocMd += `  </div>\n`
        tocMd += `  <div class="toc-list">\n`

        let folderCount = 0
        let currentFolderGroupOpen = false

        items.forEach((item) => {
            if (item.level === 2) {
                if (currentFolderGroupOpen) tocMd += `      </div>\n    </div>\n`
                folderCount++
                tocMd += `    <div class="toc-folder-group">\n`
                tocMd += `      <div class="toc-folder-item">\n`
                tocMd += `        <span class="toc-folder-number">${folderCount.toString().padStart(2, '0')}</span>\n`
                tocMd += `        <a href="#${item.id}" class="toc-folder-link">${item.text}</a>\n`
                tocMd += `      </div>\n`
                tocMd += `      <div class="toc-endpoints-container">\n`
                currentFolderGroupOpen = true
            } else if (item.level === 3 && currentFolderGroupOpen) {
                tocMd += `        <div class="toc-endpoint-item">\n`
                tocMd += `          <span class="toc-endpoint-bullet">•</span>\n`
                tocMd += `          <a href="#${item.id}" class="toc-endpoint-link">${item.text}</a>\n`
                tocMd += `        </div>\n`
            }
        })

        if (currentFolderGroupOpen) tocMd += `      </div>\n    </div>\n`
        tocMd += `  </div>\n`
        tocMd += `</div>\n`
        tocMd += `\n<div style="page-break-after: always;"></div>\n\n`
        return tocMd
    }, [])

    const [docSource, setDocSource] = useState({ cover: '', content: '' })

    // Generate markdown template from sections (INCREMENTAL)
    useEffect(() => {
        if (!project || folders === undefined || apis === undefined || sections.length === 0) return

        let newCover = docSource.cover
        let newContent = docSource.content
        const currentIds = new Set(sections.map(s => s.id))
        let addedSomething = false

        // Determine if we are doing initial generation or incremental update
        if (newCover === '' && newContent === '') {
            // Initial load
            sections.forEach(section => {
                if (!section.visible) return
                const md = generateSectionMarkdown(section, folders, apis, project)
                if (section.id === 'cover') newCover = md
                else if (section.id !== 'toc') newContent += md
                processedSectionIds.current.add(section.id)
            })
            setDocSource({ cover: newCover, content: newContent })
            setMarkdown(newContent) // Editor starts with content
        } else {
            // Incremental check: find sections that are NOT in processedSectionIds but ARE in folders/sections
            sections.forEach(section => {
                if (section.visible && !processedSectionIds.current.has(section.id)) {
                    // New section detected!
                    const md = generateSectionMarkdown(section, folders, apis, project)
                    if (section.id === 'cover') newCover = md
                    else if (section.id !== 'toc') newContent += '\n' + md
                    processedSectionIds.current.add(section.id)
                    addedSomething = true
                }
            })

            if (addedSomething) {
                setDocSource({ cover: newCover, content: newContent })
                setMarkdown(newContent)
            }
        }

        // Also clean up processed IDs that no longer exist in sections
        processedSectionIds.current.forEach((id: string) => {
            if (!currentIds.has(id) && id !== 'cover' && id !== 'toc') {
                processedSectionIds.current.delete(id)
            }
        })

    }, [project, folders, apis, sections])

    const handleEditorChange = useCallback((val: string) => {
        setMarkdown(val)
        if (activeSectionId === 'cover') {
            setDocSource(prev => ({ ...prev, cover: val }))
        } else {
            setDocSource(prev => ({ ...prev, content: val }))
        }
    }, [activeSectionId])

    // Update editor markdown when switching between cover and content
    useEffect(() => {
        if (activeSectionId === 'cover') {
            setMarkdown(docSource.cover)
        } else {
            setMarkdown(docSource.content)
        }
    }, [activeSectionId])

    // Inject TOC and assemble parts for PDF compilation
    const getMarkdownForCompile = useCallback(() => {
        const tocSection = sections.find(s => s.id === 'toc')
        const showToc = tocSection?.visible

        // Use the absolute latest content from the markdown state (editor) for current TOC
        const tocContent = showToc ? generateTocForCompile(markdown) : ''

        // Assemble precisely: Cover + TOC + Content
        // docSource.cover already includes its own page break at the end
        return docSource.cover + tocContent + markdown
    }, [docSource, markdown, sections, generateTocForCompile])

    const handleRecompile = async () => {
        if (!markdown || isCompiling) return
        setIsCompiling(true)
        try {
            const compileMd = getMarkdownForCompile()
            const result = await (window as any).electronAPI.previewDocPdf(compileMd)
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

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault()
                handleRecompile()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [markdown, isCompiling])

    const handleExportPdf = async () => {
        if (!markdown || isExporting) return
        setIsExporting(true)
        try {
            const compileMd = getMarkdownForCompile()
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
        setSections(prev => prev.map(s => s.id === id ? { ...s, visible: !s.visible } : s))
        setMarkdown('')
    }

    const handleSelectSection = (id: string) => {
        setActiveSectionId(id)
    }

    const handleAddCustomPage = () => {
        const title = prompt('Enter page title:')
        if (title) {
            const newId = `custom-${Date.now()}`
            setSections(prev => [...prev, { id: newId, title, type: 'custom', visible: true, content: `# ${title}\n\nStart writing...` }])
            setMarkdown('')
        }
    }

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
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                        </svg>
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
                    style={{
                        position: 'absolute', top: '50%', left: sidebarCollapsed ? '0' : '260px',
                        transform: 'translateY(-50%)', zIndex: 110,
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
                <div style={{
                    width: sidebarCollapsed ? '0' : '260px',
                    overflow: 'hidden',
                    transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    flexShrink: 0
                }}>
                    <DocEngineSidebar
                        sections={sections}
                        activeSectionId={activeSectionId}
                        onToggleSection={handleToggleSection}
                        onSelectSection={handleSelectSection}
                        onAddCustomPage={handleAddCustomPage}
                    />
                </div>

                {/* Editor & Preview Split */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                    {/* Editor Container */}
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
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                                </button>
                                {editorMenuOpen && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, zIndex: 60, background: '#1A1A1A',
                                        border: '1px solid #2A2A2A', borderRadius: '4px', marginTop: '8px', width: '150px',
                                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.4)'
                                    }}>
                                        <button onClick={() => { setEditorType('markdown'); setEditorMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', color: '#D1D5DB', fontSize: '11px', cursor: 'pointer' }}>MARKDOWN</button>
                                        <button onClick={() => { setEditorType('normal'); setEditorMenuOpen(false); }} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', background: 'transparent', border: 'none', color: '#D1D5DB', fontSize: '11px', cursor: 'pointer' }}>NORMAL</button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {editorType === 'markdown' ? (
                            <textarea
                                value={markdown}
                                onChange={(e) => setMarkdown(e.target.value)}
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
        </div>
    )
}
