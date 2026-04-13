import { METHOD_COLORS } from '@/types'
import type { HttpMethod } from '@/types'

interface Props { method: HttpMethod; size?: 'sm' | 'md' }

export function MethodBadge({ method, size = 'sm' }: Props) {
    const px = size === 'sm' ? '6px' : '10px'
    const py = size === 'sm' ? '2px' : '4px'
    const fs = size === 'sm' ? '9px' : '10px'
    const colors = METHOD_COLORS[method] || METHOD_COLORS.GET

    return (
        <span className="font-mono font-bold uppercase whitespace-nowrap"
            style={{
                fontSize: fs, lineHeight: 1, letterSpacing: '0.05em',
                padding: `${py} ${px}`,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                color: colors.text,
                background: colors.bg
            }}>
            {method}
        </span>
    )
}
