'use client'

import { motion as m } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { Atmosphere } from '@/components/shell/atmosphere'
import { Dock } from '@/components/shell/dock'
import { IconButton } from '@/components/ui/icon-button'
import { ThemeToggleButton } from '@/components/ui/theme-toggle-button'
import { fonts, motion, radius, shell, type as typeRoles, widths, type Mood } from '@/lib/design-tokens'

// ── PageShell ────────────────────────────────────────────────────────────────
/**
 * Every screen starts here: atmosphere behind, a centred page column, the dock
 * in front. `fill` makes the column a fixed-height flex column for tool-like
 * pages (board, write) so their container can scroll internally.
 */
export function PageShell({
  mood = 'neutral',
  intensity = 1,
  maxWidth = widths.page,
  fill = false,
  dock = true,
  children,
}: {
  mood?: Mood
  intensity?: number
  maxWidth?: number
  fill?: boolean
  dock?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100dvh',
        height: fill ? '100dvh' : undefined,
        display: fill ? 'flex' : undefined,
        flexDirection: fill ? 'column' : undefined,
        overflow: fill ? 'hidden' : undefined,
        background: shell.ink,
      }}
    >
      <Atmosphere mood={mood} intensity={intensity} />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth,
          margin: '0 auto',
          padding: fill ? '24px 24px 0' : '24px 24px 112px',
          display: fill ? 'flex' : undefined,
          flexDirection: fill ? 'column' : undefined,
          flex: fill ? 1 : undefined,
          minHeight: fill ? 0 : undefined,
        }}
      >
        {children}
      </div>
      {dock && <Dock />}
    </div>
  )
}

// ── PageHeader ───────────────────────────────────────────────────────────────
/**
 * Sits directly on the shell: no card chrome of its own. Title is Fraunces
 * (it's the app addressing the person, or the person's own title). Actions
 * are the small circular buttons; the theme toggle is on by default.
 */
export function PageHeader({
  eyebrow = 'Companheiro',
  title,
  subtitle,
  back,
  actions,
  themeToggle = true,
  size = 'lg',
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** href or handler for a back arrow. Prefer the dock; use this for sub-flows. */
  back?: string | (() => void)
  actions?: React.ReactNode
  themeToggle?: boolean
  size?: 'lg' | 'md'
}) {
  const { theme, toggle } = useTheme()
  const titleStyle = size === 'lg' ? typeRoles.display : { ...typeRoles.h2, fontSize: '24px' }
  return (
    <m.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: motion.enterMs / 1000, ease: 'easeOut' }}
      style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexShrink: 0 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, minWidth: 0, flex: 1 }}>
        {back && (
          <div style={{ paddingBottom: 6 }}>
            {typeof back === 'string' ? (
              <IconButton href={back} ariaLabel="Back">
                <BackArrow />
              </IconButton>
            ) : (
              <IconButton onClick={back} ariaLabel="Back">
                <BackArrow />
              </IconButton>
            )}
          </div>
        )}
        <div style={{ minWidth: 0 }}>
          {eyebrow && <p style={{ ...typeRoles.eyebrow, color: shell.muted, marginBottom: 10 }}>{eyebrow}</p>}
          <h1 style={{ ...titleStyle, color: shell.text, textWrap: 'balance' as never }}>{title}</h1>
          {subtitle && <p style={{ ...typeRoles.small, color: shell.muted, marginTop: 8, fontFamily: fonts.ui }}>{subtitle}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, paddingBottom: 4 }}>
        {actions}
        {themeToggle && <ThemeToggleButton theme={theme} onToggle={toggle} />}
      </div>
    </m.header>
  )
}

function BackArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={shell.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

// ── Container ────────────────────────────────────────────────────────────────
/** Bone or coal. Never coloured. Holds the cards. */
export function Container({
  children,
  padding = 24,
  fill = false,
  flush = false,
  style,
}: {
  children: React.ReactNode
  padding?: number | string
  /** Flex column that fills remaining height and lets children scroll. */
  fill?: boolean
  /** Square off the bottom corners against the viewport edge. */
  flush?: boolean
  style?: React.CSSProperties
}) {
  const { t } = useTheme()
  return (
    <m.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: motion.enterMs / 1000, delay: 0.1, ease: 'easeOut' }}
      style={{
        backgroundColor: t.containerBg,
        boxShadow: t.containerShadow,
        borderRadius: flush ? `${radius.container}px ${radius.container}px 0 0` : radius.container,
        padding,
        transition: 'background-color 0.3s ease',
        display: fill ? 'flex' : undefined,
        flexDirection: fill ? 'column' : undefined,
        flex: fill ? 1 : undefined,
        minHeight: fill ? 0 : undefined,
        overflow: fill ? 'hidden' : undefined,
        ...style,
      }}
    >
      {children}
    </m.section>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────
/** Paper. The only place text lives. Shadow, no border. */
export function Card({
  children,
  padding = 20,
  inner = false,
  style,
  onClick,
  as = 'div',
}: {
  children: React.ReactNode
  padding?: number | string
  /** Slightly deeper paper for cards nested inside a card. */
  inner?: boolean
  style?: React.CSSProperties
  onClick?: () => void
  as?: 'div' | 'section' | 'article' | 'button'
}) {
  const { t } = useTheme()
  const Tag = as as 'div'
  return (
    <Tag
      onClick={onClick}
      style={{
        backgroundColor: inner ? t.cardBgInner : t.cardBg,
        boxShadow: inner ? 'none' : t.shadow,
        borderRadius: inner ? radius.widget : radius.card,
        padding,
        transition: 'background-color 0.3s ease',
        border: 'none',
        textAlign: 'left',
        font: 'inherit',
        color: 'inherit',
        cursor: onClick ? 'pointer' : undefined,
        width: as === 'button' ? '100%' : undefined,
        ...style,
      }}
    >
      {children}
    </Tag>
  )
}

// ── Eyebrow ──────────────────────────────────────────────────────────────────
export function Eyebrow({ children, style, onShell = false }: { children: React.ReactNode; style?: React.CSSProperties; onShell?: boolean }) {
  const { t } = useTheme()
  return <p style={{ ...typeRoles.eyebrow, color: onShell ? shell.muted : t.textMuted, ...style }}>{children}</p>
}

// ── Divider ──────────────────────────────────────────────────────────────────
export function Divider({ style }: { style?: React.CSSProperties }) {
  const { t } = useTheme()
  return <div style={{ height: 1, backgroundColor: t.divider, ...style }} />
}
