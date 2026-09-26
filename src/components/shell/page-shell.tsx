'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { motion as m } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { Atmosphere } from '@/components/shell/atmosphere'
import { Dock } from '@/components/shell/dock'
import { IconButton } from '@/components/ui/icon-button'
import { ThemeToggleButton } from '@/components/ui/theme-toggle-button'
import { fonts, motion, radius, shell, type as typeRoles, widths, type Mood } from '@/lib/design-tokens'

/** How a PageHeader lets its PageShell know which element to watch. */
const HeaderSlot = createContext<((el: HTMLElement | null) => void) | null>(null)

/** True while the page's header is off screen and the Dock has stepped aside with it. */
const DockAway = createContext(false)
export const useDockAway = () => useContext(DockAway)

/** Is any part of this element on screen? True until it can be measured. */
function useInView(el: HTMLElement | null): boolean {
  const [inView, setInView] = useState(true)
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const watch = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
    watch.observe(el)
    return () => watch.disconnect()
  }, [el])
  return inView
}

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
  const [header, setHeader] = useState<HTMLElement | null>(null)
  const headerInView = useInView(header)
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
      <style>{`
        .page-col { padding: 24px 20px 96px; }
        @media (min-width: 720px) { .page-col { padding: ${dock ? 84 : 28}px 24px 48px; } }
        /* Standalone (home-screen) launch only, not a normal Safari tab: the
           status bar is drawn translucent over the page (black-translucent +
           viewport-fit=cover in layout.tsx), so the header's top line needs
           real clearance below it that a plain browser tab already has from
           Safari's own chrome and doesn't need added on top of. */
        @media (max-width: 719px) and (display-mode: standalone) {
          .page-col { padding-top: calc(env(safe-area-inset-top, 20px) + 24px); }
        }
        .page-col.page-col-fill { padding-bottom: 0; }
        @media (max-width: 719px) { .page-col.page-col-fill { padding-bottom: 76px; } }
      `}</style>
      <div
        className={`page-col${fill ? ' page-col-fill' : ''}`}
        style={{
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth,
          margin: '0 auto',
          display: fill ? 'flex' : undefined,
          flexDirection: fill ? 'column' : undefined,
          flex: fill ? 1 : undefined,
          minHeight: fill ? 0 : undefined,
        }}
      >
        <HeaderSlot.Provider value={setHeader}>
          <DockAway.Provider value={!headerInView}>{children}</DockAway.Provider>
        </HeaderSlot.Provider>
      </div>
      {dock && <Dock inPage away={!headerInView} />}
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
  const watchedBy = useContext(HeaderSlot)
  const titleStyle = size === 'lg' ? typeRoles.display : { ...typeRoles.h2, fontSize: '24px' }
  return (
    <m.header
      ref={watchedBy}
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
