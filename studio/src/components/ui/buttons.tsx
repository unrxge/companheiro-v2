'use client'

import { motion as m } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { fonts, radius } from '@/lib/design-tokens'

type Size = 'sm' | 'md' | 'lg'

interface BaseProps {
  children: React.ReactNode
  onClick?: () => void
  href?: string
  disabled?: boolean
  loading?: boolean
  loadingLabel?: string
  full?: boolean
  size?: Size
  ariaLabel?: string
  style?: React.CSSProperties
  type?: 'button' | 'submit'
}

const PAD: Record<Size, string> = { sm: '8px 14px', md: '11px 18px', lg: '14px 24px' }
const FS: Record<Size, number> = { sm: 12, md: 13, lg: 15 }

function base(size: Size, full: boolean, disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: full ? '100%' : undefined,
    padding: PAD[size],
    borderRadius: radius.field,
    border: 'none',
    fontFamily: fonts.ui,
    fontWeight: 600,
    fontSize: FS[size],
    letterSpacing: '-0.01em',
    lineHeight: 1.2,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    transition: 'opacity 0.15s ease, background-color 0.2s ease, color 0.2s ease',
  }
}

function Pressable({ style, disabled, href, onClick, children, ariaLabel, type = 'button' }: BaseProps & { style: React.CSSProperties }) {
  const hover = disabled ? {} : { scale: 1.015 }
  const tap = disabled ? {} : { scale: 0.985 }
  if (href && !disabled) {
    return (
      <m.a href={href} aria-label={ariaLabel} style={style} whileHover={hover} whileTap={tap} onClick={onClick}>
        {children}
      </m.a>
    )
  }
  return (
    <m.button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel} style={style} whileHover={hover} whileTap={tap}>
      {children}
    </m.button>
  )
}

/** Ember with white text. One per surface: the thing you came here to do. */
export function PrimaryButton(props: BaseProps) {
  const { t } = useTheme()
  const { size = 'md', full = false, disabled = false, loading = false, loadingLabel, children, style } = props
  return (
    <Pressable {...props} disabled={disabled || loading} style={{ ...base(size, full, disabled || loading), backgroundColor: t.ember, color: '#ffffff', ...style }}>
      {loading ? loadingLabel ?? children : children}
    </Pressable>
  )
}

/** Ink on paper, paper on coal. Secondary actions, form submits, "capture". */
export function QuietButton(props: BaseProps) {
  const { t } = useTheme()
  const { size = 'md', full = false, disabled = false, loading = false, loadingLabel, children, style } = props
  return (
    <Pressable {...props} disabled={disabled || loading} style={{ ...base(size, full, disabled || loading), backgroundColor: t.inverseBg, color: t.inverseText, ...style }}>
      {loading ? loadingLabel ?? children : children}
    </Pressable>
  )
}

/** Outlined, low emphasis. "Change", "Cancel", "Test again". */
export function GhostButton(props: BaseProps) {
  const { t } = useTheme()
  const { size = 'md', full = false, disabled = false, loading = false, loadingLabel, children, style } = props
  return (
    <Pressable
      {...props}
      disabled={disabled || loading}
      style={{ ...base(size, full, disabled || loading), backgroundColor: 'transparent', color: t.textSecondary, boxShadow: `inset 0 0 0 1px ${t.divider}`, ...style }}
    >
      {loading ? loadingLabel ?? children : children}
    </Pressable>
  )
}

/** Red outline. Only for destructive confirms. */
export function DangerButton(props: BaseProps) {
  const { t } = useTheme()
  const { size = 'md', full = false, disabled = false, loading = false, loadingLabel, children, style } = props
  return (
    <Pressable
      {...props}
      disabled={disabled || loading}
      style={{ ...base(size, full, disabled || loading), backgroundColor: t.soft.danger, color: t.danger, ...style }}
    >
      {loading ? loadingLabel ?? children : children}
    </Pressable>
  )
}
