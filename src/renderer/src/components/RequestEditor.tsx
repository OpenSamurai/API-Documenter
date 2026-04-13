import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useApi, useUpdateApi } from '@/hooks/useApis'
import { useFolder } from '@/hooks/useFolders'
import { useEnvironments } from '@/hooks/useEnvironments'
import { useAppStore } from '@/stores/appStore'
import { KeyValueEditor } from './KeyValueEditor'
import { CodeEditor } from './CodeEditor'
import { ResponseViewer } from './ResponseViewer'
import { ResponsePanel } from './ResponsePanel'
import { VariableInput } from './VariableInput'
import type { HttpResponse } from './ResponsePanel'
import { METHOD_COLORS } from '@/types'
import type { HttpMethod, BodyType, RawType, EditorTab, KeyValuePair, ResponseExample } from '@/types'
import { v4 as uuid } from 'uuid'

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']
const BODY_TYPES: { v: BodyType; l: string }[] = [
    { v: 'none', l: 'None' },
    { v: 'form-data', l: 'Form Data' },
    { v: 'urlencoded', l: 'x-www-form-urlencoded' },
    { v: 'raw', l: 'Raw' }
]

const RAW_TYPES: { v: RawType; l: string }[] = [
    { v: 'json', l: 'JSON' },
    { v: 'text', l: 'Text' },
    { v: 'html', l: 'HTML' },
    { v: 'xml', l: 'XML' }
]

const MIN_TOP = 300
const MIN_BOTTOM = 150

interface Props { apiId: string }

export function RequestEditor({ apiId }: Props) {
    const { data: api } = useApi(apiId)
    const { data: folder } = useFolder(api?.folderId || null)
    const { currentProjectId, currentEnvironmentId, activeEditorTab, setActiveEditorTab } = useAppStore()
    const { data: environments } = useEnvironments(currentProjectId)
    const updateApi = useUpdateApi()

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [method, setMethod] = useState<HttpMethod>('GET')
    const [path, setPath] = useState('')
    const [urlParams, setUrlParams] = useState<KeyValuePair[]>([])
    const [headers, setHeaders] = useState<KeyValuePair[]>([])
    const [bodyType, setBodyType] = useState<BodyType>('none')
    const [rawType, setRawType] = useState<RawType>('json')
    const [formData, setFormData] = useState<KeyValuePair[]>([])
    const [urlencoded, setUrlencoded] = useState<KeyValuePair[]>([])
    const [requestBody, setRequestBody] = useState('')
    const [responses, setResponses] = useState<ResponseExample[]>([])
    const [saved, setSaved] = useState(true)
    const [methodDd, setMethodDd] = useState(false)
    const [rawTypeDd, setRawTypeDd] = useState(false)
    const ignoreSync = useRef(false)
    const latestStateRef = useRef({ path: '', method: 'GET' as HttpMethod, urlParams: [] as KeyValuePair[], headers: [] as KeyValuePair[], bodyType: 'none' as BodyType, rawType: 'json' as RawType, formData: [] as KeyValuePair[], urlencoded: [] as KeyValuePair[], requestBody: '' })

    useEffect(() => {
        latestStateRef.current = { path, method, urlParams, headers, bodyType, rawType, formData, urlencoded, requestBody }
    }, [path, method, urlParams, headers, bodyType, rawType, formData, urlencoded, requestBody])

    // ── Live response state ──
    const [liveResponse, setLiveResponse] = useState<HttpResponse | null>(null)
    const [sending, setSending] = useState(false)

    // ── Resizable panel state ──
    const containerRef = useRef<HTMLDivElement>(null)
    const [splitPct, setSplitPct] = useState(() => {
        const saved = localStorage.getItem('response-panel-pct')
        return saved ? parseFloat(saved) : 65
    })
    const [dragging, setDragging] = useState(false)
    const [dividerHover, setDividerHover] = useState(false)
    const [responseCollapsed, setResponseCollapsed] = useState(false)

    useEffect(() => {
        if (!api) return
        setName(api.name); setDescription(api.description); setMethod(api.method)
        setPath(api.path); setUrlParams(api.urlParams || []); setHeaders(api.headers || [])
        setBodyType(api.bodyType); setRequestBody(api.requestBody)
        setRawType(api.rawType || 'json')
        setFormData(api.formData || [])
        setUrlencoded(api.urlencoded || [])
        setResponses(api.responseExamples || []); setSaved(true)
        setLiveResponse(null)
    }, [api])

    useEffect(() => {
        if (!api) return
        const dirty = name !== api.name || description !== api.description || method !== api.method || path !== api.path ||
            JSON.stringify(urlParams) !== JSON.stringify(api.urlParams) || JSON.stringify(headers) !== JSON.stringify(api.headers) ||
            bodyType !== api.bodyType || requestBody !== api.requestBody ||
            rawType !== (api.rawType || 'json') ||
            JSON.stringify(formData) !== JSON.stringify(api.formData || []) ||
            JSON.stringify(urlencoded) !== JSON.stringify(api.urlencoded || []) ||
            JSON.stringify(responses) !== JSON.stringify(api.responseExamples)
        setSaved(!dirty)
    }, [api, name, description, method, path, urlParams, headers, bodyType, requestBody, responses, rawType, formData, urlencoded])

    const save = useCallback(async () => {
        if (!api) return
        await updateApi.mutateAsync({
            id: api.id, name, description, method, path, urlParams, headers,
            bodyType, rawType, formData, urlencoded, requestBody,
            responseExamples: responses, version: (api.version || 0) + 1
        })
        setSaved(true)
    }, [api, name, description, method, path, urlParams, headers, bodyType, rawType, formData, urlencoded, requestBody, responses, updateApi])

    const updateContentType = useCallback((type: BodyType, rType: RawType) => {
        setHeaders(prev => {
            const h = [...prev]
            const idx = h.findIndex(x => x.key.toLowerCase() === 'content-type')
            let val = ''
            if (type === 'urlencoded') val = 'application/x-www-form-urlencoded'
            else if (type === 'form-data') val = 'multipart/form-data'
            else if (type === 'raw') {
                if (rType === 'json') val = 'application/json'
                else if (rType === 'xml') val = 'application/xml'
                else if (rType === 'html') val = 'text/html'
                else val = 'text/plain'
            }

            if (val) {
                if (idx > -1) {
                    if (h[idx].value !== val) h[idx] = { ...h[idx], value: val, enabled: true }
                } else {
                    h.push({ id: uuid(), key: 'Content-Type', value: val, enabled: true })
                }
            } else if (idx > -1) {
                h.splice(idx, 1)
            }
            latestStateRef.current.headers = h
            return h
        })
    }, [])

    const handlePathChange = useCallback((newPath: string) => {
        setPath(newPath)
        latestStateRef.current.path = newPath
        if (ignoreSync.current) return

        ignoreSync.current = true
        const queryIndex = newPath.indexOf('?')
        if (queryIndex !== -1) {
            const queryString = newPath.substring(queryIndex + 1)
            const pairs = queryString.split('&').filter(p => p)
            const newParams: KeyValuePair[] = pairs.map(p => {
                const [k, v] = p.split('=')
                try {
                    return {
                        id: uuid(),
                        key: decodeURIComponent(k || ''),
                        value: decodeURIComponent(v || ''),
                        enabled: true
                    }
                } catch (e) {
                    return { id: uuid(), key: k || '', value: v || '', enabled: true }
                }
            })
            setUrlParams(newParams)
        } else {
            setUrlParams([])
        }
        ignoreSync.current = false
    }, [])

    const handleParamsChange = useCallback((newParams: KeyValuePair[]) => {
        setUrlParams(newParams)
        latestStateRef.current.urlParams = newParams
        if (ignoreSync.current) return

        ignoreSync.current = true
        setPath(currentPath => {
            const queryIndex = currentPath.indexOf('?')
            const base = queryIndex === -1 ? currentPath : currentPath.substring(0, queryIndex)
            const enabled = newParams.filter(p => p.enabled && (p.key || p.value))

            let newPath = base
            if (enabled.length > 0) {
                const qs = enabled.map(p => {
                    const k = encodeURIComponent(p.key)
                    const v = encodeURIComponent(p.value)
                    return `${k}=${v}`
                }).join('&')
                newPath = `${base}?${qs}`
            }
            latestStateRef.current.path = newPath
            return newPath
        })
        ignoreSync.current = false
    }, [])

    const handleHeadersChange = useCallback((v: KeyValuePair[]) => { setHeaders(v); latestStateRef.current.headers = v }, [])
    const handleFormDataChange = useCallback((v: KeyValuePair[]) => { setFormData(v); latestStateRef.current.formData = v }, [])
    const handleUrlencodedChange = useCallback((v: KeyValuePair[]) => { setUrlencoded(v); latestStateRef.current.urlencoded = v }, [])
    const handleRequestBodyChange = useCallback((v: string) => { setRequestBody(v); latestStateRef.current.requestBody = v }, [])

    const handleBodyTypeChange = useCallback((v: BodyType) => {
        setBodyType(v);
        latestStateRef.current.bodyType = v;
        updateContentType(v, latestStateRef.current.rawType)
    }, [updateContentType])

    const handleRawTypeChange = useCallback((v: RawType) => {
        setRawType(v);
        latestStateRef.current.rawType = v;
        updateContentType(latestStateRef.current.bodyType, v)
    }, [updateContentType])

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() }
            if ((e.ctrlKey || e.metaKey) && e.key === 'j') { e.preventDefault(); setResponseCollapsed(c => !c) }
        }
        window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
    }, [save])

    // ── Drag to resize ──
    const onDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault(); setDragging(true)
    }, [])

    useEffect(() => {
        if (!dragging) return
        const onMove = (e: MouseEvent) => {
            if (!containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()
            const y = e.clientY - rect.top
            const h = rect.height
            const pct = Math.max(MIN_TOP / h * 100, Math.min((h - MIN_BOTTOM) / h * 100, (y / h) * 100))
            setSplitPct(pct)
        }
        const onUp = () => {
            setDragging(false)
            localStorage.setItem('response-panel-pct', String(splitPct))
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    }, [dragging, splitPct])

    // ── Variable Resolution ──
    const variablesMap = useMemo(() => {
        const activeEnv = environments?.find(e => e.id === currentEnvironmentId)
        const globals = environments?.find(e => e.isGlobal)
        let vars: Record<string, string> = {}
        if (globals?.variables) {
            try { vars = { ...vars, ...JSON.parse(globals.variables) } } catch (e) { /* ignore */ }
        }
        if (activeEnv?.variables) {
            try { vars = { ...vars, ...JSON.parse(activeEnv.variables) } } catch (e) { /* ignore */ }
        }
        return vars
    }, [environments, currentEnvironmentId])

    const resolveVariables = useCallback((text: string) => {
        if (!text) return text
        return text.replace(/\{\{(.+?)\}\}/g, (_, key) => variablesMap[key.trim()] || `{{${key}}}`)
    }, [variablesMap])

    // ── Send HTTP request ──
    const sendRequest = useCallback(async () => {
        if (sending) return
        setSending(true); setLiveResponse(null); setResponseCollapsed(false)

        const { path: rPath, method: rMethod, urlParams: rParams, headers: rHeaders, bodyType: rBodyType, rawType: rRawType, formData: rFormData, urlencoded: rUrlencoded, requestBody: rRequestBody } = latestStateRef.current

        // Strip existing query string from path to prevent duplication
        const queryIndex = rPath.indexOf('?')
        const basePath = queryIndex === -1 ? rPath : rPath.substring(0, queryIndex)
        let fullUrl = resolveVariables(basePath)

        if (!/^https?:\/\//i.test(fullUrl) && fullUrl.length > 0) {
            fullUrl = 'https://' + fullUrl
        }

        const enabledParams = rParams.filter(p => p.enabled && p.key)
        if (enabledParams.length > 0) {
            const qs = enabledParams.map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(resolveVariables(p.value))}`).join('&')
            fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs
        }

        const hdrs: Record<string, string> = {}
        rHeaders.filter(h => h.enabled && h.key).forEach(h => {
            hdrs[h.key] = resolveVariables(h.value)
        })

        let body: string | undefined
        let formFields: { key: string, value: string, type: 'text' | 'file' }[] | undefined
        const processedBody = resolveVariables(rRequestBody)

        if (rBodyType === 'raw') {
            body = processedBody
            if (!hdrs['Content-Type'] && !hdrs['content-type']) {
                const ct = rRawType === 'json' ? 'application/json' :
                    rRawType === 'xml' ? 'application/xml' :
                        rRawType === 'html' ? 'text/html' : 'text/plain'
                hdrs['Content-Type'] = ct
            }
        } else if (rBodyType === 'form-data') {
            formFields = rFormData.filter(p => p.enabled && p.key).map(p => ({
                key: p.key,
                value: p.type === 'file' ? p.value : resolveVariables(p.value),
                type: (p.type as 'text' | 'file') || 'text'
            }))
            if (!hdrs['Content-Type'] && !hdrs['content-type']) {
                hdrs['Content-Type'] = 'multipart/form-data'
            }
        } else if (rBodyType === 'urlencoded') {
            const params = new URLSearchParams()
            rUrlencoded.filter(p => p.enabled && p.key).forEach(p => {
                params.append(p.key, resolveVariables(p.value))
            })
            body = params.toString()
            if (!hdrs['Content-Type'] && !hdrs['content-type']) {
                hdrs['Content-Type'] = 'application/x-www-form-urlencoded'
            }
        }


        try {
            const res = await (window as any).electronAPI.sendHttpRequest({
                url: fullUrl,
                method: rMethod,
                headers: hdrs,
                body,
                formFields
            })
            setLiveResponse(res)
        } finally {
            setSending(false)
        }
    }, [path, method, urlParams, headers, bodyType, rawType, formData, urlencoded, requestBody, sending, environments, currentEnvironmentId, resolveVariables])

    const saveAsExample = (status: number, body: string, resHeaders: Record<string, string>) => {
        const headerPairs: KeyValuePair[] = Object.entries(resHeaders).map(([k, v]) => ({ id: uuid(), key: k, value: v, enabled: true }))
        const now = Date.now()
        const example: ResponseExample = {
            id: uuid(), statusCode: status,
            title: `${status} Response`,
            description: `${status} response`,
            body,
            headers: headerPairs,
            metadata: {
                contentType: resHeaders['content-type'] || 'application/json',
                isDefault: responses.length === 0,
                deprecated: false,
                responseTime: liveResponse?.time,
                responseSize: liveResponse?.size
            },
            createdAt: now, updatedAt: now
        }
        setResponses([...responses, example])
    }

    if (!api) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#0A0A0A' }}>
            <span style={{ fontSize: '12px', color: '#6B7280' }}>Loading…</span>
        </div>
    )

    const tabs: { key: EditorTab; label: string; count?: number }[] = [
        { key: 'params', label: 'Params', count: urlParams.filter(p => p.enabled && p.key).length },
        { key: 'headers', label: 'Headers', count: headers.filter(h => h.enabled && h.key).length },
        { key: 'body', label: 'Body' },
        { key: 'responses', label: 'Responses', count: responses.length }
    ]

    const showResponse = liveResponse || sending

    return (
        <div ref={containerRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0A0A0A', userSelect: dragging ? 'none' : 'auto' }}>

            {/* ═══════════════════════════════════════════════
          TOP: REQUEST BUILDER
          ═══════════════════════════════════════════════ */}
            <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: showResponse && !responseCollapsed ? `${splitPct}%` : '100%', minHeight: MIN_TOP }}>

                {/* ── Endpoint Bar ── */}
                <div style={{ flexShrink: 0, padding: '20px 24px 0 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ flex: 1 }}>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="Endpoint name"
                                className="w-full"
                                style={{ background: 'transparent', border: 'none', fontSize: '18px', fontWeight: 600, color: '#FFFFFF', outline: 'none', letterSpacing: '-0.02em', marginBottom: '4px' }} />
                            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Add a description…"
                                className="w-full"
                                style={{ background: 'transparent', border: 'none', fontSize: '13px', color: '#6B7280', outline: 'none' }} />
                        </div>
                    </div>


                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#111111', border: '1px solid #1F1F1F', borderRadius: '12px', padding: '12px' }}>

                        {/* Method dropdown */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <button onClick={() => setMethodDd(!methodDd)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'monospace', fontWeight: 700, fontSize: '12px',
                                    background: METHOD_COLORS[method].bg,
                                    border: `1px solid ${METHOD_COLORS[method].border}`,
                                    borderRadius: '10px', padding: '8px 14px',
                                    color: METHOD_COLORS[method].text,
                                    transition: '150ms ease', minWidth: '85px'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.2)' }}
                                onMouseLeave={e => { e.currentTarget.style.filter = 'none' }}>
                                {method}
                                <svg width="8" height="5" viewBox="0 0 8 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="1,1 4,4 7,1" /></svg>
                            </button>
                            {methodDd && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setMethodDd(false)} />
                                    <div className="fade-in"
                                        style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: '8px', background: '#111111', border: '1px solid #2A2A2A', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: '4px', minWidth: '140px', animation: 'fadeUp 150ms ease' }}>
                                        {METHODS.map(m => (
                                            <button key={m} onClick={() => { setMethod(m); setMethodDd(false) }}
                                                style={{
                                                    display: 'block', width: '100%', textAlign: 'left', fontFamily: 'monospace', fontWeight: 700, fontSize: '12px',
                                                    padding: '8px 12px', borderRadius: '8px',
                                                    color: METHOD_COLORS[m].text,
                                                    background: method === m ? METHOD_COLORS[m].bg : 'transparent',
                                                    transition: '150ms ease', border: 'none', cursor: 'pointer'
                                                }}
                                                onMouseEnter={e => { e.currentTarget.style.background = METHOD_COLORS[m].bg }}
                                                onMouseLeave={e => { if (method !== m) e.currentTarget.style.background = 'transparent' }}>
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* URL Input */}
                        <VariableInput
                            value={path}
                            onChange={handlePathChange}
                            variables={variablesMap}
                            placeholder="https://api.example.com/endpoint"
                            onKeyDown={e => e.key === 'Enter' && sendRequest()}
                            style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px', background: '#0F0F0F', border: '1px solid #2A2A2A', borderRadius: '10px', height: '40px', transition: '150ms ease' }}
                        />

                        {/* Send */}
                        <button onClick={sendRequest} disabled={sending}
                            style={{ flexShrink: 0, fontWeight: 600, fontSize: '13px', border: '1px solid #FFFFFF', borderRadius: '10px', padding: '0 20px', height: '40px', color: '#FFFFFF', background: 'transparent', transition: '150ms ease', opacity: sending ? 0.5 : 1, cursor: 'pointer' }}
                            onMouseEnter={e => { if (!sending) { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#000000' } }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#FFFFFF' }}
                            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)' }}
                            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}>
                            {sending ? 'Sending…' : 'Send'}
                        </button>

                        {/* Save */}
                        {folder?.role !== 'viewer' && (
                            <button onClick={save} disabled={saved || updateApi.isPending}
                                style={{ flexShrink: 0, fontSize: '12px', fontWeight: 500, padding: '0 12px', height: '40px', borderRadius: '10px', color: (saved && !updateApi.isPending) ? '#6B7280' : '#FFFFFF', border: (saved && !updateApi.isPending) ? '1px solid transparent' : '1px solid #2A2A2A', background: 'transparent', transition: '150ms ease', cursor: (saved && !updateApi.isPending) ? 'default' : 'pointer' }}
                                onMouseEnter={e => { if (!saved || updateApi.isPending) { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#000000' } }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = (saved && !updateApi.isPending) ? '#6B7280' : '#FFFFFF' }}>
                                {updateApi.isPending ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Tabs ── */}
                <div style={{ flexShrink: 0, padding: '16px 24px 0 24px', borderBottom: '1px solid #1F1F1F' }}>
                    <div style={{ display: 'flex', gap: 0 }}>
                        {tabs.map(t => {
                            const isActive = activeEditorTab === t.key
                            return (
                                <button key={t.key} onClick={() => setActiveEditorTab(t.key)}
                                    style={{ position: 'relative', padding: '8px 16px 12px', fontSize: '14px', fontWeight: 500, color: isActive ? '#FFFFFF' : '#A1A1A1', background: 'transparent', border: 'none', transition: '200ms ease', cursor: 'pointer' }}
                                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#FFFFFF' }}
                                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#A1A1A1' }}>
                                    {t.label}
                                    {!!t.count && t.count > 0 && (
                                        <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, padding: '0 6px', borderRadius: '9999px', background: '#1F1F1F', color: '#9CA3AF' }}>{t.count}</span>
                                    )}
                                    <span style={{ position: 'absolute', bottom: 0, left: '16px', right: '16px', height: '2px', background: '#FFFFFF', borderRadius: '1px', opacity: isActive ? 1 : 0, transform: isActive ? 'scaleX(1)' : 'scaleX(0)', transition: 'opacity 200ms ease, transform 200ms ease' }} />
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* ── Tab Content ── */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', scrollBehavior: 'smooth' }}>
                    {activeEditorTab === 'params' && (
                        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <SectionHeader title="URL Parameters" sub="Query string parameters appended to the request URL" />
                            <KeyValueEditor pairs={urlParams} onChange={handleParamsChange} keyPlaceholder="Parameter" valuePlaceholder="Value" variables={variablesMap} />
                        </div>
                    )}
                    {activeEditorTab === 'headers' && (
                        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <SectionHeader title="Request Headers" sub="HTTP headers sent with the request" />
                            <KeyValueEditor pairs={headers} onChange={handleHeadersChange} keyPlaceholder="Header" valuePlaceholder="Value" variables={variablesMap} />
                        </div>
                    )}
                    {activeEditorTab === 'body' && (
                        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <SectionHeader title="Request Body" sub="Data sent in the request payload" />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {BODY_TYPES.map(bt => {
                                    const isAct = bodyType === bt.v
                                    return (
                                        <button key={bt.v} onClick={() => handleBodyTypeChange(bt.v)}
                                            style={{ fontSize: '11px', fontWeight: 500, padding: '6px 14px', borderRadius: '8px', background: isAct ? '#2A2A2A' : 'transparent', color: isAct ? '#FFFFFF' : '#6B7280', border: `1px solid ${isAct ? '#3A3A3A' : '#1F1F1F'}`, transition: '150ms ease', cursor: 'pointer' }}
                                            onMouseEnter={e => { if (!isAct) { e.currentTarget.style.background = '#151515'; e.currentTarget.style.color = '#FFFFFF' } }}
                                            onMouseLeave={e => { if (!isAct) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6B7280' } }}>
                                            {bt.l}
                                        </button>
                                    )
                                })}

                                {bodyType === 'raw' && (
                                    <div style={{ position: 'relative', marginLeft: 'auto' }}>
                                        <button onClick={() => setRawTypeDd(!rawTypeDd)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: '#A1A1A1', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
                                            {RAW_TYPES.find(r => r.v === rawType)?.l || 'JSON'}
                                            <svg width="8" height="5" viewBox="0 0 8 5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><polyline points="1,1 4,4 7,1" /></svg>
                                        </button>
                                        {rawTypeDd && (
                                            <>
                                                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setRawTypeDd(false)} />
                                                <div className="fade-in"
                                                    style={{ position: 'absolute', top: '100%', right: 0, zIndex: 50, marginTop: '8px', background: '#111111', border: '1px solid #2A2A2A', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: '4px', minWidth: '100px' }}>
                                                    {RAW_TYPES.map(r => (
                                                        <button key={r.v} onClick={() => { handleRawTypeChange(r.v); setRawTypeDd(false) }}
                                                            style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: '11px', fontWeight: 500, padding: '8px 12px', borderRadius: '6px', color: rawType === r.v ? '#FFFFFF' : '#9CA3AF', background: rawType === r.v ? '#1F1F1F' : 'transparent', border: 'none', cursor: 'pointer' }}>
                                                            {r.l}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {bodyType === 'raw' && (
                                <>
                                    <CodeEditor 
                                        value={requestBody} 
                                        onChange={handleRequestBodyChange} 
                                        language={rawType}
                                    />
                                </>
                            )}
                            {bodyType === 'form-data' && <KeyValueEditor pairs={formData} onChange={handleFormDataChange} keyPlaceholder="Field" valuePlaceholder="Value" variables={variablesMap} showTypeSelector />}
                            {bodyType === 'urlencoded' && <KeyValueEditor pairs={urlencoded} onChange={handleUrlencodedChange} keyPlaceholder="Key" valuePlaceholder="Value" variables={variablesMap} />}
                            {bodyType === 'none' && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 0', background: '#111111', border: '1px solid #1F1F1F', borderRadius: '12px' }}>
                                    <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>No body for this request</p>
                                </div>
                            )}
                        </div>
                    )}
                    {activeEditorTab === 'responses' && (
                        <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <SectionHeader title="Response Examples" sub="Document expected response payloads by status code" />
                            <ResponseViewer examples={responses} onChange={setResponses} />
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════
          DRAGGABLE DIVIDER
          ═══════════════════════════════════════════════ */}
            {showResponse && !responseCollapsed && (
                <div style={{
                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '6px', cursor: 'row-resize',
                    background: dragging || dividerHover ? '#1F1F1F' : 'transparent',
                    transition: dragging ? 'none' : 'background 100ms ease',
                    borderTop: '1px solid #1F1F1F'
                }}
                    onMouseDown={onDragStart}
                    onMouseEnter={() => setDividerHover(true)}
                    onMouseLeave={() => setDividerHover(false)}>
                    {/* Center drag indicator */}
                    <div style={{ display: 'flex', gap: '3px', opacity: dragging || dividerHover ? 0.8 : 0.3, transition: 'opacity 100ms ease' }}>
                        <span style={{ display: 'block', width: '4px', height: '2px', borderRadius: '9999px', background: '#6B7280' }} />
                        <span style={{ display: 'block', width: '4px', height: '2px', borderRadius: '9999px', background: '#6B7280' }} />
                        <span style={{ display: 'block', width: '4px', height: '2px', borderRadius: '9999px', background: '#6B7280' }} />
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════
          BOTTOM: RESPONSE PANEL
          ═══════════════════════════════════════════════ */}
            {showResponse && !responseCollapsed && (
                <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', height: `${100 - splitPct}%`, minHeight: MIN_BOTTOM, background: '#0F0F0F' }}>
                    {/* Sticky header */}
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: '40px', borderBottom: '1px solid #1F1F1F' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B7280' }}>Response</span>
                        <button onClick={() => setResponseCollapsed(true)}
                            style={{ fontSize: '10px', fontWeight: 500, padding: '4px 8px', borderRadius: '4px', color: '#6B7280', transition: '150ms ease', border: 'none', background: 'transparent', cursor: 'pointer' }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.background = '#1A1A1A' }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#6B7280'; e.currentTarget.style.background = 'transparent' }}>
                            Collapse ⌘J
                        </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', scrollBehavior: 'smooth' }}>
                        <ResponsePanel response={liveResponse} loading={sending} onSaveAsExample={folder?.role === 'viewer' ? undefined : saveAsExample} />
                    </div>
                </div>
            )}

            {/* Collapsed response toggle */}
            {showResponse && responseCollapsed && (
                <button onClick={() => setResponseCollapsed(false)}
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', width: '100%', fontSize: '11px', fontWeight: 500, padding: '8px 24px', borderTop: '1px solid #1F1F1F', borderBottom: 'none', borderLeft: 'none', borderRight: 'none', color: '#6B7280', background: '#0F0F0F', transition: '150ms ease', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#6B7280' }}>
                    <svg width="8" height="5" viewBox="0 0 8 5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><polyline points="1,4 4,1 7,4" /></svg>
                    Show Response {liveResponse?.status ? `· ${liveResponse.status} ${liveResponse.statusText} · ${liveResponse.time}ms` : ''}
                </button>
            )}

            {/* ── Status bar ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, fontSize: '10px', fontWeight: 500, padding: '6px 24px', borderTop: '1px solid #1F1F1F', color: '#6B7280', background: '#0A0A0A' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontFamily: 'monospace' }}>v{api.version}</span>
                    <span style={{ color: '#2A2A2A' }}>·</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#FFFFFF', opacity: api.syncStatus === 'synced' ? 1 : 0.3 }} />
                        {api.syncStatus}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {!saved && <span style={{ color: '#FFFFFF' }}>● Unsaved</span>}
                    <kbd style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontFamily: 'monospace', border: '1px solid #2A2A2A', color: '#6B7280' }}>Ctrl+S</kbd>
                </div>
            </div>
        </div>
    )
}

function SectionHeader({ title, sub }: { title: string; sub: string }) {
    return (
        <div style={{ marginBottom: '8px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'white', letterSpacing: '-0.01em', marginBottom: '4px', marginTop: 0 }}>{title}</h3>
            <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>{sub}</p>
        </div>
    )
}