import React, { useMemo } from 'react'
import { NodeViewWrapper } from '@tiptap/react'

export const SmartTOCView = ({ editor }: any) => {
  const tocItems = useMemo(() => {
    const items: { level: number, text: string, id: string }[] = []
    
    if (!editor) return items

    editor.state.doc.descendants((node: any) => {
      if (node.type.name === 'heading') {
        const level = node.attrs.level
        const text = node.textContent
        const id = node.attrs.id || text.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        
        // Only include Folder (h2) and Endpoint (h3) in TOC
        if (level === 2 || level === 3) {
          items.push({ level, text, id })
        }
      }
    })
    
    return items
  }, [editor.state.doc])

  if (tocItems.length === 0) {
    return (
      <NodeViewWrapper className="smart-toc-empty">
        <div style={{ 
          padding: '20px', 
          border: '1px dashed #2A2A2A', 
          borderRadius: '8px',
          color: '#4B5563',
          fontSize: '13px',
          textAlign: 'center'
        }}>
          Table of Contents will appear here once you add Folders (H2) or Endpoints (H3).
        </div>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper className="smart-toc-container">
      <div style={{ 
        padding: '24px', 
        background: 'rgba(255, 255, 255, 0.03)', 
        border: '1px solid #1F1F1F', 
        borderRadius: '12px',
        margin: '20px 0 40px'
      }}>
        <h2 style={{ 
          margin: '0 0 16px', 
          fontSize: '18px', 
          fontWeight: 700, 
          color: '#FFFFFF',
          borderBottom: '1px solid #2A2A2A',
          paddingBottom: '8px'
        }}>
          Table of Contents
        </h2>
        <nav>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {tocItems.map((item, index) => {
              const isFolder = item.level === 2
              return (
                <li key={index} style={{ 
                  marginLeft: isFolder ? '0' : '24px',
                  marginBottom: '8px',
                  lineHeight: '1.4'
                }}>
                  <a 
                    href={`#${item.id}`} 
                    onClick={(e) => {
                      e.preventDefault()
                      const element = document.getElementById(item.id)
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth' })
                      }
                    }}
                    style={{ 
                      color: isFolder ? '#FFFFFF' : '#3B82F6',
                      textDecoration: 'none',
                      fontSize: isFolder ? '15px' : '14px',
                      fontWeight: isFolder ? 700 : 400,
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#60A5FA')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = isFolder ? '#FFFFFF' : '#3B82F6')}
                  >
                    {isFolder ? index + 1 + '. ' : '• '}
                    {item.text}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </NodeViewWrapper>
  )
}
