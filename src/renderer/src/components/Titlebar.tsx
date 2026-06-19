import React, { useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { UnsavedChangesModal } from './UnsavedChangesModal'

interface Props { isOnline: boolean }

export function Titlebar({ isOnline }: Props) {
    const [pendingAppClose, setPendingAppClose] = useState(false)

    const handleCloseClick = () => {
        const draftsCount = Object.keys(useAppStore.getState().apiDrafts).length
        if (draftsCount > 0) {
            setPendingAppClose(true)
        } else {
            window.electronAPI?.close()
        }
    }

    return (
        <header
            className="drag"
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1001,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                userSelect: 'none',
                height: 'var(--topbar-h)', background: '#0A0A0A', borderBottom: '1px solid #1A1A1A'
            }}
        >
            {/* ── Left: Brand Identity ── */}
            <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: '14px', paddingLeft: '20px' }}>
                <div style={{
                    width: '22px', height: '22px', borderRadius: '6px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#FFFFFF', boxShadow: '0 0 12px rgba(255,255,255,0.1)'
                }}>
                    <span style={{ fontSize: '12px', fontWeight: 900, color: '#000000', lineHeight: 1 }}>A</span>
                </div>
                <div className="flex items-center gap-2.5">
                    <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '-0.02em', color: '#FFFFFF' }}>API Documenter</span>
                    <span style={{
                        fontSize: '9px', fontWeight: 800, padding: '2px 6px',
                        borderRadius: '5px', background: '#111', border: '1px solid #222',
                        color: '#444', textTransform: 'uppercase', letterSpacing: '0.05em'
                    }}>
                        PRO
                    </span>
                </div>
            </div>

            {/* Empty Center */}
            <div />

            {/* ── Right: System Actions ── */}
            <div className="no-drag" style={{ display: 'flex', alignItems: 'center', height: '100%', paddingRight: '0' }}>
                {/* Status Indicator */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '0 20px', fontSize: '10px',
                    fontWeight: 700, color: '#444', textTransform: 'uppercase',
                    letterSpacing: '0.1em', borderRight: '1px solid #1A1A1A', height: '60%'
                }}>
                    <div style={{
                        width: '6px', height: '6px', borderRadius: '999px',
                        background: isOnline ? '#10B981' : '#F59E0B',
                        boxShadow: isOnline ? '0 0 8px rgba(16,185,129,0.4)' : 'none'
                    }} />
                    {isOnline ? 'Cloud Sync active' : 'Local Mode'}
                </div>

                {/* Window Controls */}
                <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                    <WinBtn onClick={() => window.electronAPI?.minimize()}>
                        <svg width="10" height="1"><rect width="10" height="1" fill="currentColor" /></svg>
                    </WinBtn>
                    <WinBtn onClick={() => window.electronAPI?.maximize()}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="1" y="1" width="8" height="8" rx="1.5" /></svg>
                    </WinBtn>
                    <WinBtn onClick={handleCloseClick} danger>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" /></svg>
                    </WinBtn>
                </div>
            </div>

            {pendingAppClose && (
                <UnsavedChangesModal
                    onComplete={() => window.electronAPI?.close()}
                    onCancel={() => setPendingAppClose(false)}
                />
            )}
        </header>
    )
}

function WinBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
    return (
        <button
            onClick={onClick}
            style={{
                width: '46px', height: 'var(--topbar-h)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: '#555',
                transition: 'all 150ms ease'
            }}
            onMouseEnter={e => {
                if (danger) { e.currentTarget.style.background = '#E11D48'; e.currentTarget.style.color = '#FFFFFF' }
                else { e.currentTarget.style.background = '#1A1A1A'; e.currentTarget.style.color = '#FFFFFF' }
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#555'
            }}
        >
            {children}
        </button>
    )
}
