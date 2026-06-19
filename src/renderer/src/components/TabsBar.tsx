import React, { useRef, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useAllProjectApis } from '@/hooks/useApis'
import { METHOD_COLORS } from '@/types'

export function TabsBar() {
    const { openTabs, activeTabId, setActiveTab, closeTab, currentProjectId, apiDrafts } = useAppStore()
    const { data: allApis } = useAllProjectApis(currentProjectId)
    const containerRef = useRef<HTMLDivElement>(null)

    // Scroll active tab into view
    useEffect(() => {
        if (!containerRef.current) return
        const activeEl = containerRef.current.querySelector('[data-active="true"]') as HTMLElement
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        }
    }, [activeTabId, openTabs.length])

    if (openTabs.length === 0) return null

    return (
        <div ref={containerRef} className="flex flex-row overflow-x-auto border-b border-[#1A1A1A] bg-[#0A0A0A]" style={{ height: '36px', flexShrink: 0, padding: '0 8px', gap: '4px', alignItems: 'center' }}>
            {openTabs.map(tab => {
                const isActive = tab.id === activeTabId
                const isDocs = tab.type === 'docs'
                let name = tab.name || 'Unknown'
                let method = tab.method
                let hasDraft = false

                if (!isDocs && tab.apiId) {
                    const api = allApis?.find(a => a.id === tab.apiId)
                    const draft = apiDrafts[tab.apiId]
                    name = draft?.name || api?.name || 'Loading...'
                    method = draft?.method || api?.method || 'GET'
                    if (draft && !draft.saved) {
                        hasDraft = true
                    }
                }

                return (
                    <div
                        key={tab.id}
                        data-active={isActive}
                        onClick={() => setActiveTab(tab.id)}
                        onMouseDown={(e) => {
                            if (e.button === 1) closeTab(tab.id) // Middle click to close
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            height: '28px',
                            padding: '0 10px',
                            borderRadius: '6px',
                            background: isActive ? '#1F1F1F' : 'transparent',
                            color: isActive ? '#FFFFFF' : '#8A8A8A',
                            cursor: 'pointer',
                            transition: 'all 150ms ease',
                            border: '1px solid',
                            borderColor: isActive ? '#2A2A2A' : 'transparent',
                            minWidth: 'fit-content',
                            gap: '8px',
                            userSelect: 'none'
                        }}
                        onMouseEnter={e => {
                            if (!isActive) {
                                e.currentTarget.style.background = '#141414'
                                e.currentTarget.style.color = '#A1A1A1'
                            }
                        }}
                        onMouseLeave={e => {
                            if (!isActive) {
                                e.currentTarget.style.background = 'transparent'
                                e.currentTarget.style.color = '#8A8A8A'
                            }
                        }}
                    >
                        {isDocs ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                        ) : (
                            <span style={{ fontSize: '9px', fontWeight: 700, color: (METHOD_COLORS[method as any] || METHOD_COLORS.GET).text }}>
                                {method}
                            </span>
                        )}

                        <span style={{ fontSize: '11px', fontWeight: 500, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {name}
                        </span>

                        <div className="tab-close-btn-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px', height: '16px', position: 'relative' }}>
                            {hasDraft ? (
                                <div className="tab-draft-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#F59E0B' }} />
                            ) : null}
                            
                            <button
                                className="tab-close-btn"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    closeTab(tab.id)
                                }}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: 'none',
                                    background: 'transparent',
                                    color: 'inherit',
                                    opacity: hasDraft ? 0 : 0.5,
                                    cursor: 'pointer',
                                    transition: '150ms ease',
                                    borderRadius: '4px'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.opacity = '1'
                                    e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                                    if (hasDraft) {
                                        const dot = e.currentTarget.parentElement?.querySelector('.tab-draft-dot') as HTMLElement
                                        if (dot) dot.style.opacity = '0'
                                    }
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.opacity = hasDraft ? '0' : '0.5'
                                    e.currentTarget.style.background = 'transparent'
                                    if (hasDraft) {
                                        const dot = e.currentTarget.parentElement?.querySelector('.tab-draft-dot') as HTMLElement
                                        if (dot) dot.style.opacity = '1'
                                    }
                                }}
                            >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
