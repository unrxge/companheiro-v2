'use client'

// src/components/studio/surface/stage.tsx — the frame the canvases stand in.
//
// Full window, atmosphere behind, no bone container: at levels 3 and 2 the
// work is the page. Chrome floats over the canvas as glass, and everything on
// it is an icon — what a thing does is explained when you open it, not by a
// word sitting permanently above it taking up room.

import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion as m } from 'motion/react'
import { Atmosphere } from '@/components/shell/atmosphere'
import { DOCK_DESKTOP_MIN } from '@/components/shell/dock'
import { ThemeToggleButton } from '@/components/ui/theme-toggle-button'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { shell, type Mood } from '@/lib/design-tokens'

export function CanvasStage({
  mood = 'neutral',
  intensity = 0.55,
  header,
  children,
}: {
  mood?: Mood
  intensity?: number
  header?: ReactNode
  children: ReactNode
}) {
  return (
    <div style={{ position: 'relative', height: '100dvh', overflow: 'hidden', background: shell.ink }}>
      <Atmosphere mood={mood} intensity={intensity} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>{children}</div>
      {header && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 8 }}>{header}</div>}
    </div>
  )
}

/**
 * The bar across the top. `onUp` draws the way out of this level; `reveal`
 * is the panel the chevron beside the title opens, which is where a level
 * says what it is for.
 */
export function StageHeader({
  title,
  onUp,
  upLabel,
  reveal,
  actions,
  status,
}: {
  /** Omit when the level's identity now lives on the canvas itself. */
  title?: ReactNode
  onUp?: (el: HTMLElement | null) => void
  upLabel?: string
  reveal?: ReactNode
  actions?: ReactNode
  /** A quiet word beside the theme toggle: `saving…`, and nothing else. */
  status?: ReactNode
}) {
  const { t, theme, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const iconOnly = !title && !reveal && !actions

  return (
    <div className="stage-header-pad" style={{ pointerEvents: 'none' }}>
      {/* Below 720px the Dock sits at the bottom of the screen, so the pill
         can sit right under the status bar; at 720px and up the Dock takes
         over the top-centre, so the pill needs the same clearance PageShell
         reserves for it (page-shell.tsx: `${dock ? 84 : 28}px` at this same
         breakpoint) — otherwise a long title or the "Saving…" status can
         run under the Dock pill. */}
      <style>{`
        .stage-header-pad { padding: 14px 16px 0; }
        @media (min-width: ${DOCK_DESKTOP_MIN}px) { .stage-header-pad { padding-top: 84px; } }
      `}</style>
      <div
        data-hold
        style={{
          pointerEvents: 'auto',
          display: 'flex', alignItems: 'center', gap: 12,
          padding: iconOnly ? 10 : '10px 16px 10px 10px', borderRadius: 999,
          background: 'rgba(13,12,11,0.72)', backdropFilter: 'blur(18px) saturate(1.1)',
          border: `1px solid ${shell.line}`,
          maxWidth: 'fit-content',
        }}
      >
        {onUp && (
          <StageIcon label={upLabel ?? 'Back out a level'} onClick={(el) => onUp(el)}>
            <path d="M15 5l-7 7 7 7" />
          </StageIcon>
        )}

        {title && (
          <div style={{ ...canvasType.headingMd, color: shell.text, minWidth: 0, padding: '0 2px', maxWidth: '42vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </div>
        )}

        {reveal && (
          <StageIcon
            label={open ? 'Hide what this is for' : 'What this is for'}
            onClick={() => setOpen((v) => !v)}
            pressed={open}
            rotates
          >
            <path d="M6 9l6 6 6-6" />
          </StageIcon>
        )}

        {actions}
      </div>

      <AnimatePresence initial={false}>
        {open && reveal && (
          <m.div
            key="reveal"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            data-hold
            style={{
              pointerEvents: 'auto',
              marginTop: 8, maxWidth: 'min(640px, calc(100vw - 32px))',
              background: t.containerBg, border: `1px solid ${t.divider}`,
              borderRadius: 18, boxShadow: t.containerShadow,
              padding: 22, maxHeight: '54vh', overflowY: 'auto',
            }}
          >
            {reveal}
          </m.div>
        )}
      </AnimatePresence>

      {/* Its own corner, not sharing the identity pill on the left — a
         constant a person's eye learns once and finds anywhere. Same Dock
         clearance as the pill above, so it drops below the Dock at desktop
         widths instead of sitting under its right edge. */}
      <style>{`
        .stage-header-toggle { top: 14px; }
        @media (min-width: ${DOCK_DESKTOP_MIN}px) { .stage-header-toggle { top: 84px; } }
      `}</style>
      <div data-hold className="stage-header-toggle" style={{ position: 'absolute', right: 16, pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {status && (
          <span aria-live="polite" style={{ ...canvasType.chip, color: shell.muted }}>
            {status}
          </span>
        )}
        <ThemeToggleButton theme={theme} onToggle={toggle} />
      </div>
    </div>
  )
}

/** A round glass button. Its title is its whole explanation until you press it. */
export function StageIcon({
  label,
  onClick,
  pressed = false,
  badge,
  /** A chevron that should turn over when its panel opens. */
  rotates = false,
  children,
}: {
  label: string
  onClick: (el: HTMLElement | null) => void
  pressed?: boolean
  badge?: number
  rotates?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed || undefined}
      title={label}
      onClick={(e) => onClick(e.currentTarget)}
      style={{
        position: 'relative',
        width: 36, height: 36, borderRadius: 999, padding: 0, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        border: `1px solid ${pressed ? shell.line : 'transparent'}`,
        background: pressed ? shell.fill : 'transparent',
        color: pressed ? shell.text : shell.muted,
        transition: 'color 140ms ease, background 140ms ease',
      }}
    >
      <svg
        width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: rotates && pressed ? 'rotate(180deg)' : undefined, transition: 'transform 200ms ease' }}
      >
        {children}
      </svg>
      {typeof badge === 'number' && badge > 0 && (
        <span
          aria-hidden
          style={{
            position: 'absolute', top: -1, right: -1, minWidth: 14, height: 14, padding: '0 3px',
            borderRadius: 999, ...canvasType.chip, fontSize: 9, lineHeight: '14px', textAlign: 'center',
            background: shell.text, color: shell.ink,
          }}
        >
          {badge}
        </span>
      )}
    </button>
  )
}
