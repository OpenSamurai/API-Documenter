import React from 'react'

interface DocSection {
    id: string
    title: string
    type: 'cover' | 'toc' | 'folder' | 'custom'
    visible: boolean
}

interface DocEngineSidebarProps {
    sections: DocSection[]
    onToggleSection: (id: string) => void
    onSelectSection: (id: string) => void
    activeSectionId: string | null
    onAddCustomPage: () => void
}

export function DocEngineSidebar({ 
    sections, 
    onToggleSection, 
    onSelectSection, 
    activeSectionId,
    onAddCustomPage 
}: DocEngineSidebarProps) {
    return (
        <aside style={{ 
            width: '260px', 
            background: '#0F0F0F', 
            borderRight: '1px solid #1F1F1F',
            display: 'flex',
            flexDirection: 'column',
            height: '100%'
        }}>
            {/* Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid #1A1A1A' }}>
                <h3 style={{ margin: 0, fontSize: '11px', fontWeight: 800, color: '#4B5563', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    Document Structure
                </h3>
            </div>

            {/* Sections List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {sections.map(section => (
                        <div 
                            key={section.id}
                            onClick={() => onSelectSection(section.id)}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '10px', 
                                padding: '10px 12px',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                background: activeSectionId === section.id ? '#1A1A1A' : 'transparent',
                                transition: '150ms ease',
                                opacity: section.visible ? 1 : 0.5
                            }}
                            onMouseEnter={e => { if (activeSectionId !== section.id) e.currentTarget.style.background = '#151515' }}
                            onMouseLeave={e => { if (activeSectionId !== section.id) e.currentTarget.style.background = 'transparent' }}
                        >
                            {/* Visibility Toggle */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); onToggleSection(section.id); }}
                                style={{ 
                                    background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                                    color: section.visible ? '#3B82F6' : '#4B5563', display: 'flex', alignItems: 'center'
                                }}
                            >
                                {section.visible ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                )}
                            </button>

                            <span style={{ 
                                fontSize: '13px', 
                                fontWeight: activeSectionId === section.id ? 600 : 500,
                                color: activeSectionId === section.id ? '#FFFFFF' : '#9CA3AF',
                                flex: 1,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}>
                                {section.title}
                            </span>

                            {/* Section Icon */}
                            <div style={{ color: '#4B5563', opacity: 0.6 }}>
                                {section.type === 'cover' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>}
                                {section.type === 'toc' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}
                                {section.type === 'folder' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>}
                                {section.type === 'custom' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="9" y2="9"/><line x1="8" y1="9" x2="8" y2="9"/></svg>}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Add Custom Page Button */}
                <button 
                    onClick={onAddCustomPage}
                    style={{ 
                        width: '100%', marginTop: '16px', padding: '10px',
                        background: 'rgba(255, 255, 255, 0.03)', border: '1px dashed #2A2A2A',
                        borderRadius: '8px', color: '#6B7280', fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        transition: '150ms ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.color = '#FFFFFF' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'; e.currentTarget.style.color = '#6B7280' }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Add Custom Page
                </button>
            </div>

            {/* Document Settings */}
            <div style={{ padding: '20px', borderTop: '1px solid #1A1A1A', background: '#0A0A0A' }}>
                <p style={{ margin: '0 0 12px', fontSize: '10px', fontWeight: 800, color: '#444', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                    PDF Settings
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Page Numbers</span>
                        <input type="checkbox" defaultChecked />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Dark Theme</span>
                        <input type="checkbox" />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Header/Footer</span>
                        <input type="checkbox" defaultChecked />
                    </div>
                </div>
            </div>
        </aside>
    )
}
