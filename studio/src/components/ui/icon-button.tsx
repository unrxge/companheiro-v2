'use client'

import { motion as m } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { shell } from '@/lib/design-tokens'

/**
 * 36px circular icon button. `tone="shell"` (default) sits on the dark shell;
 * `tone="card"` sits on a container or card and follows the theme.
 * Children should use stroke="currentColor" so the tone sets the colour.
 */
export function IconButton({
  href,
  onClick,
  ariaLabel,
  children,
  tone = 'shell',
  size = 36,
  danger = false,
}: {
  href?: string
  onClick?: () => void
  ariaLabel: string
  children: React.ReactNode
  tone?: 'shell' | 'card'
  size?: number
  danger?: boolean
}) {
  const { t } = useTheme()
  const style: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    border: tone === 'shell' ? `1px solid ${shell.line}` : `1px solid ${t.divider}`,
    backgroundColor: tone === 'shell' ? shell.fill : t.cardBgInner,
    color: danger ? t.danger : tone === 'shell' ? shell.text : t.textSecondary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
    textDecoration: 'none',
  }

  if (href) {
    return (
      <m.a href={href} aria-label={ariaLabel} title={ariaLabel} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }} style={style}>
        {children}
      </m.a>
    )
  }

  return (
    <m.button type="button" onClick={onClick} aria-label={ariaLabel} title={ariaLabel} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.93 }} style={style}>
      {children}
    </m.button>
  )
}
