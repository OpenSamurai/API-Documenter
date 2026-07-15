import { useRef, useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';

export function SidebarResizer() {
    const { setSidebarWidth } = useAppStore();
    const isResizing = useRef(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            let newWidth = e.clientX - 48; // 48 is ActivityBar width
            if (newWidth < 200) newWidth = 200;
            if (newWidth > 800) newWidth = 800;
            setSidebarWidth(newWidth);
        };
        const handleMouseUp = () => {
            if (isResizing.current) {
                isResizing.current = false;
                document.body.style.cursor = 'default';
            }
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
    }, [setSidebarWidth]);

    return (
        <div
            style={{
                width: '4px',
                background: 'transparent',
                cursor: 'col-resize',
                zIndex: 100,
                position: 'relative',
                marginLeft: '-2px',
                marginRight: '-2px'
            }}
            onMouseDown={(e) => {
                e.preventDefault();
                isResizing.current = true;
                document.body.style.cursor = 'col-resize';
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#3F3F46'}
            onMouseLeave={e => { if(!isResizing.current) e.currentTarget.style.background = 'transparent' }}
        />
    );
}
