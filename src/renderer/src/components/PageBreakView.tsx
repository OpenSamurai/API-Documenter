import React, { useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'

export const PageBreakView = (props: any) => {
  const [hovered, setHovered] = useState(false)

  const deleteNode = () => {
    props.deleteNode()
  }

  return (
    <NodeViewWrapper 
      className="page-break-node-wrapper" 
      style={{ margin: '40px 0', position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div 
        style={{ 
          height: '0', 
          borderTop: '2px dashed #00DE90', 
          width: '100%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <div style={{
          position: 'absolute',
          background: '#111',
          padding: '4px 14px',
          border: '1px solid #00DE90',
          borderRadius: '999px',
          fontSize: '10px',
          fontWeight: 800,
          color: '#00DE90',
          letterSpacing: '0.15em',
          whiteSpace: 'nowrap',
          textTransform: 'uppercase',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          zIndex: 10
        }}>
          <span>PAGE BREAK</span>
          
          {hovered && (
            <button
              onClick={deleteNode}
              style={{
                background: '#F87171',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '9px',
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                marginLeft: '8px'
              }}
              title="Remove Page Break"
            >
              REMOVE
            </button>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  )
}
