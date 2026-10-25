'use client'

// studio/src/components/work/rail.tsx — the right rail and the drawer behind it.
//
// What the thing is for, the rules that can catch you, and the companion.
// The threads are NOT here: what runs across the work belongs beside the work,
// where it can be seen while looking at it. Same rail at every altitude.
//
// Follows the tool rail in the main app: circular icons pinned to the right
// edge, a panel that opens beside them, one open at a time.

import { useEffect, type ReactNode } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { DOCK_DESKTOP_MIN } from '@/components/shell/dock'
import { useDockAway } from '@/components/shell/page-shell'
import { useNarrow } from '@/components/studio/work/bits'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'

export type RailKey = 'intent' | 'concept' | 'rules' | 'tasks' | 'assistant' | 'companion'

const icon = (path: ReactNode) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
)

export const RAIL_TOOLS: { key: RailKey; label: string; icon: ReactNode }[] = [
  { key: 'intent', label: 'What this is for', icon: icon(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /></>) },
  { key: 'concept', label: 'The core concept', icon: icon(<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z" /></>) },
  { key: 'rules', label: 'The rules', icon: icon(<><path d="M5 4h14v16H5z" /><line x1="8.5" y1="9" x2="15.5" y2="9" /><line x1="8.5" y1="13" x2="15.5" y2="13" /><line x1="8.5" y1="17" x2="12" y2="17" /></>) },
  { key: 'tasks', label: 'Tasks', icon: icon(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 12l2 2 4-4" /></>) },
  { key: 'assistant', label: 'Writing assistant', icon: icon(<path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" />) },
  { key: 'companion', label: 'Talk it through', icon: icon(<><path d="M20 14a3 3 0 0 1-3 3H9l-4 3V6a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3z" /></>) },
]

/** What a part or a thread has to itself; the rest belong to a whole piece. */
export const PART_TOOLS: RailKey[] = ['intent', 'rules', 'companion']

/** A piece's writing page: the tools the Write page always had. The piece's
 *  rules sit inside the core concept tab (since 2026-10-17): what it is and
 *  what it holds to, in one place. What this is for and Talk it through are
 *  project tools; they live on the board, not beside a single piece's words. */
export const PIECE_TOOLS: RailKey[] = ['concept', 'tasks', 'assistant']

export function Rail({
  open,
  onOpen,
  counts,
  tools,
  hidden = false,
  bar = false,
}: {
  open: RailKey | null
  onOpen: (key: RailKey | null) => void
  /** A small number on an icon, when there is something in it worth knowing. */
  counts?: Partial<Record<RailKey, number>>
  /** Which tools to draw; all of them by default. */
  tools?: RailKey[]
  hidden?: boolean
  /** A row along the bottom, over the Dock (a phone): standing over the right
   *  edge there, it covered the words and held a margin open the whole way
   *  down. It comes down to the bottom when the Dock steps away. */
  bar?: boolean
}) {
  const { t } = useTheme()
  const dockAway = useDockAway()
  if (hidden) return null
  const size = bar ? 36 : 40

  return (
    <>
    {bar && (
      <style>{`
        .rail-bar { bottom: calc(max(14px, env(safe-area-inset-bottom)) + 54px + 10px); transition: bottom .2s ease; }
        .rail-bar[data-dock-away] { bottom: max(14px, env(safe-area-inset-bottom)); }
      `}</style>
    )}
    <div
      className={bar ? 'rail-bar' : undefined}
      data-dock-away={bar && dockAway ? true : undefined}
      style={bar ? {
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 40,
        display: 'flex', gap: 6, padding: '4px 6px', borderRadius: 999,
        background: alpha(t.cardBg, 0.86), backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: `1px solid ${t.divider}`, boxShadow: t.shadow, maxWidth: 'calc(100vw - 24px)',
      } : {
        position: 'fixed', right: 14, top: '50%', transform: 'translateY(-50%)',
        zIndex: 40, display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      {RAIL_TOOLS.filter((tool) => !tools || tools.includes(tool.key)).map((tool) => {
        const active = open === tool.key
        const count = counts?.[tool.key]
        return (
          <button
            key={tool.key}
            type="button"
            data-tour={`rail-${tool.key}`}
            aria-label={tool.label}
            aria-pressed={active}
            title={tool.label}
            onClick={() => onOpen(active ? null : tool.key)}
            style={{
              position: 'relative',
              width: size, height: size, borderRadius: 999, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              border: bar ? '1px solid transparent' : `1px solid ${active ? t.textMuted : shell.line}`,
              background: bar ? (active ? alpha(t.textPrimary, 0.12) : 'transparent') : active ? t.cardBg : shell.fill,
              color: active ? t.textPrimary : bar ? t.textSecondary : shell.muted,
              transition: 'background 140ms ease, color 140ms ease',
            }}
          >
            {tool.icon}
            {typeof count === 'number' && count > 0 && (
              <span
                aria-hidden
                style={{
                  position: 'absolute', top: -2, right: -2,
                  minWidth: 15, height: 15, padding: '0 4px', borderRadius: 999,
                  ...canvasType.chip, fontSize: 9, lineHeight: '15px', textAlign: 'center',
                  background: t.ochre, color: shell.ink,
                }}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
    </>
  )
}

/**
 * The board's own invitation to talk the vision through — bottom and
 * centred, not a small icon tucked into a corner pill, because the point is
 * to be found, not merely available. The mark is a north star: the thing a
 * conversation about vision is for, not a speech bubble like any other chat.
 */
export function CompanionLauncher({
  active, onClick, locked = false,
}: {
  active: boolean
  /** Handed the button itself, so what it opens can open out of it. */
  onClick: (from: HTMLElement | null) => void
  /** The plan does not carry it: greyed out, still there, and pressing it says which plan does. */
  locked?: boolean
}) {
  const { t } = useTheme()
  // Greyed, not hidden: the colour goes, the words and the place stay.
  const ink = locked ? alpha(shell.text, 0.5) : t.violet
  const edge = locked ? alpha(shell.text, 0.16) : active ? t.violet : alpha(t.violet, 0.4)
  return (
    <>
      {/* Below DOCK_DESKTOP_MIN, Dock claims bottom-centre too (44px seats +
         4px top/bottom padding, sitting max(14px, safe-area) off the edge —
         see dock.tsx). Clear that stack plus a visible gap; at and above the
         breakpoint Dock moves to the top, so this can sit at its normal 22px. */}
      <style>{`
        .companion-launcher { bottom: calc(max(14px, env(safe-area-inset-bottom)) + 52px + 14px); }
        @media (min-width: ${DOCK_DESKTOP_MIN}px) { .companion-launcher { bottom: 22px; } }
        /* A menu opened from a card low on the screen drops to where this
           stands, and its last rows were underneath it. It steps aside. */
        body:has([data-canvas-menu]) .companion-launcher { opacity: 0; pointer-events: none; }
        /* On a phone's canvas it stands in the bottom row beside the "+" (which
           holds the right), at the left rather than the middle. */
        @media (max-width: ${DOCK_DESKTOP_MIN - 1}px) {
          body:has([data-add-fan]) .companion-launcher { left: 14px !important; transform: none !important; padding: 12px 18px; gap: 8px; }
        }
      `}</style>
      <button
        type="button"
        aria-label={locked ? 'Talk through the vision: part of Direction' : 'Talk through the vision'}
        aria-pressed={active}
        title={locked ? 'Talk about the vision is part of Direction' : 'Talk about the vision'}
        data-locked={locked || undefined}
        data-tour="launcher"
        onClick={(e) => onClick(e.currentTarget)}
        className="companion-launcher"
        style={{
          position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 40,
          display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          // One line, always: placed at left 50%, it was only allowed half the
          // window's width and broke in two on a phone.
          whiteSpace: 'nowrap',
          padding: '13px 24px', borderRadius: 999,
          border: `1px solid ${edge}`,
          background: active && !locked ? t.violet : 'rgba(13,12,11,0.78)',
          backdropFilter: 'blur(18px) saturate(1.1)',
          color: active && !locked ? shell.ink : ink,
          boxShadow: locked ? 'none' : `0 10px 30px ${alpha(t.violet, active ? 0.4 : 0.2)}`,
          transition: 'background 160ms ease, color 160ms ease, box-shadow 160ms ease, opacity 160ms ease',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden>
          <path d="M12 2L14.6 9.4 22 12 14.6 14.6 12 22 9.4 14.6 2 12 9.4 9.4Z" />
        </svg>
        <span style={{ ...canvasType.label, textTransform: 'none', letterSpacing: 0, fontSize: 14, fontWeight: 600 }}>
          Talk about the vision
        </span>
        {locked && (
          <span style={{ ...canvasType.chip, padding: '2px 8px', borderRadius: 999, border: `1px solid ${alpha(shell.text, 0.22)}`, color: alpha(shell.text, 0.7) }}>
            Direction
          </span>
        )}
      </button>
    </>
  )
}

/** The panel the rail opens. Scrolls on its own; never pushes the work. */
export function Drawer({
  open,
  title,
  onClose,
  sheet = false,
  aboveBar = false,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  /** Rises from the bottom instead, so the words stay in view above it. */
  sheet?: boolean
  /** The rail's row of tools stands along the bottom (a phone), so the panel stops above it too. */
  aboveBar?: boolean
  children: ReactNode
}) {
  const { t } = useTheme()
  const dockAway = useDockAway()
  // A phone: the panel is the width of the screen, not a strip with a sliver
  // of page beside it.
  const narrow = useNarrow()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
    {/* Below the Dock breakpoint the Dock sits along the bottom, so the panel stops above it, unless the Dock has stepped away. */}
    <style>{`
      .rail-sheet { bottom: calc(max(14px, env(safe-area-inset-bottom)) + 52px + 14px); transition: bottom .2s ease; }
      .rail-sheet[data-dock-away] { bottom: 0; }
      /* The panel is as tall as what is in it, and no taller than the room above the Dock. */
      .rail-drawer { bottom: auto; max-height: calc(100dvh - 64px - max(14px, env(safe-area-inset-bottom)) - 66px); }
      .rail-drawer[data-dock-away] { max-height: calc(100dvh - 64px - 16px); }
      /* The row of tools stands over the Dock (46px tall, 64px up), and the panel stops above that. */
      .rail-drawer[data-above-bar] { max-height: calc(100dvh - 64px - max(14px, env(safe-area-inset-bottom)) - 120px); }
      .rail-drawer[data-above-bar][data-dock-away] { max-height: calc(100dvh - 64px - max(14px, env(safe-area-inset-bottom)) - 58px); }
      /* Beside the rail's icons, which are centred on the screen, the panel is centred on it too. */
      @media (min-width: ${DOCK_DESKTOP_MIN}px) {
        .rail-drawer, .rail-drawer[data-dock-away], .rail-drawer[data-above-bar], .rail-drawer[data-above-bar][data-dock-away] { top: 50%; transform: translateY(-50%); max-height: calc(100dvh - 128px); }
        .rail-sheet { bottom: 0; }
      }
    `}</style>
    <aside
      aria-label={title}
      data-tour="rail-panel"
      className={sheet ? 'rail-sheet' : 'rail-drawer'}
      data-dock-away={dockAway || undefined}
      data-above-bar={(aboveBar && !sheet) || undefined}
      style={{
        position: 'fixed', zIndex: 39, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: t.containerBg, border: `1px solid ${t.divider}`, boxShadow: t.containerShadow,
        ...(sheet
          ? { left: 0, right: 0, height: '50vh', borderRadius: '20px 20px 0 0' }
          : narrow
            ? { left: 8, right: 8, top: 64, borderRadius: radius.card }
            : { right: 62, width: 'min(420px, calc(100vw - 96px))', borderRadius: radius.card }),
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '18px 22px', borderBottom: `1px solid ${alpha(t.textPrimary, 0.08)}`,
          flexShrink: 0,
        }}
      >
        <span style={{ ...canvasType.label, color: t.textMuted }}>{title}</span>
        <button
          type="button"
          aria-label="Close this panel"
          onClick={onClose}
          style={{
            ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none',
            cursor: 'pointer', padding: 4,
          }}
        >
          ✕
        </button>
      </header>
      <div style={{ flex: sheet ? 1 : '0 1 auto', minHeight: 0, overflowY: 'auto', padding: 20 }}>{children}</div>
    </aside>
    </>
  )
}
