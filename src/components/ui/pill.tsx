'use client'

import { useTheme } from '@/components/theme/theme-provider'
import { fonts, type MeaningKey } from '@/lib/design-tokens'

/**
 * A small coloured label. Colour means something (arc, status, danger);
 * `neutral` is for counts and metadata. `dot` prefixes a 6px circle.
 * `solid` inverts to a filled pill (selected state in choosers).
 */
export function Pill({
  hue = 'neutral',
  children,
  dot = false,
  solid = false,
  onClick,
  selected,
  size = 'sm',
  style,
}: {
  hue?: MeaningKey | 'neutral'
  children: React.ReactNode
  dot?: boolean
  solid?: boolean
  onClick?: () => void
  selected?: boolean
  size?: 'sm' | 'md'
  style?: React.CSSProperties
}) {
  const { t } = useTheme()
  const color = hue === 'neutral' ? t.textSecondary : t[hue]
  const bg = hue === 'neutral' ? t.cardBgInner : t.soft[hue]
  const isSolid = solid || selected
  const s: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: fonts.ui,
    fontSize: size === 'sm' ? 11 : 12,
    fontWeight: 600,
    letterSpacing: '0.04em',
    lineHeight: 1.2,
    padding: size === 'sm' ? '4px 10px' : '7px 14px',
    borderRadius: 999,
    whiteSpace: 'nowrap',
    color: isSolid ? '#ffffff' : color,
    backgroundColor: isSolid ? (hue === 'neutral' ? t.inverseBg : t[hue]) : bg,
    border: 'none',
    cursor: onClick ? 'pointer' : undefined,
    transition: 'background-color 0.15s ease, color 0.15s ease',
    ...style,
  }
  const inner = (
    <>
      {dot && <i style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'currentColor', display: 'inline-block' }} />}
      {children}
    </>
  )
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={selected} style={s}>
        {inner}
      </button>
    )
  }
  return <span style={s}>{inner}</span>
}
