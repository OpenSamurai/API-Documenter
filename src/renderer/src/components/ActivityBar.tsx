import { useAppStore } from '@/stores/appStore'

export function ActivityBar() {
    const { activeSidebarTab, setActiveSidebarTab } = useAppStore()

    return (
        <div style={{
            width: '48px', height: '100%', background: '#050505',
            borderRight: '1px solid #1A1A1A', display: 'flex', flexDirection: 'column',
            alignItems: 'center', paddingTop: '16px', gap: '16px'
        }}>
            <ActivityItem 
                icon="folder" 
                isActive={activeSidebarTab === 'explorer'} 
                onClick={() => setActiveSidebarTab('explorer')} 
            />
            <ActivityItem 
                icon="git" 
                isActive={activeSidebarTab === 'git'} 
                onClick={() => setActiveSidebarTab('git')} 
            />
        </div>
    )
}

function ActivityItem({ icon, isActive, onClick }: { icon: string, isActive: boolean, onClick: () => void }) {
    return (
        <div onClick={onClick} className="group relative" style={{
            width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: isActive ? '#FFFFFF' : '#6B7280', transition: '150ms ease'
        }}>
            {/* Active Indication Left Border */}
            {isActive && (
                <div style={{ position: 'absolute', left: 0, top: '4px', bottom: '4px', width: '2px', background: '#3B82F6', borderRadius: '0 2px 2px 0' }} />
            )}

            <div style={{ transition: 'color 150ms ease', color: isActive ? '#FFFFFF' : '#4B5563' }}
                onMouseEnter={e => e.currentTarget.style.color = '#FFFFFF'}
                onMouseLeave={e => e.currentTarget.style.color = isActive ? '#FFFFFF' : '#4B5563'}>
                {icon === 'folder' ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="18" cy="18" r="3"></circle>
                        <circle cx="6" cy="6" r="3"></circle>
                        <path d="M13 6h3a2 2 0 0 1 2 2v7"></path>
                        <line x1="6" y1="9" x2="6" y2="21"></line>
                    </svg>
                )}
            </div>
        </div>
    )
}
