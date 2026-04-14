import { useAppStore } from '@/stores/appStore'
import { useEffect, useState } from 'react'

export function StatusBar() {
    const { setShowCookieManager, isOnline, proxyConnection } = useAppStore()
    const [version, setVersion] = useState<string>('')

    useEffect(() => {
        (window as any).electronAPI.getAppVersion().then(setVersion)
    }, [])

    return (
        <div style={{
            height: '28px',
            background: '#0A0A0A',
            borderTop: '1px solid #1F1F1F',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            fontSize: '10px',
            fontWeight: 600,
            color: '#6B7280',
            userSelect: 'none',
            zIndex: 100
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? '#10B981' : '#EF4444' }} />
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{isOnline ? 'Online' : 'Offline'}</span>
                </div>

                <div style={{ width: '1px', height: '12px', background: '#1F1F1F' }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Workspace: </span>
                    <span style={{ color: '#A1A1A1' }}>{proxyConnection?.connected ? 'Cloud Connected' : 'Local Only'}</span>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button 
                    onClick={() => setShowCookieManager(true)}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#6B7280',
                        fontSize: '10px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        transition: '0.2s'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.color = '#FFF'
                        e.currentTarget.style.background = '#1A1A1A'
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.color = '#6B7280'
                        e.currentTarget.style.background = 'none'
                    }}
                >
                    Cookies
                </button>
                <span style={{ opacity: 0.5 }}>{version}</span>
            </div>
        </div>
    )
}
