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
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'

export type RailKey = 'intent' | 'concept' | 'rules' | 'anchors' | 'tasks' | 'companion'

const icon = (path: ReactNode) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
)

export const RAIL_TOOLS: { key: RailKey; label: string; icon: ReactNode }[] = [
  { key: 'intent', label: 'What this is for', icon: icon(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /></>) },
  { key: 'concept', label: 'The core concept', icon: icon(<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5z" /></>) },
  { key: 'rules', label: 'The rules', icon: icon(<><path d="M5 4h14v16H5z" /><line x1="8.5" y1="9" x2="15.5" y2="9" /><line x1="8.5" y1="13" x2="15.5" y2="13" /><line x1="8.5" y1="17" x2="12" y2="17" /></>) },
  { key: 'anchors', label: 'Anchor lines', icon: icon(<path d="M6 4h12v16l-6-4-6 4z" />) },
  { key: 'tasks', label: 'Tasks', icon: icon(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 12l2 2 4-4" /></>) },
  { key: 'companion', label: 'Talk it through', icon: icon(<><path d="M20 14a3 3 0 0 1-3 3H9l-4 3V6a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3z" /></>) },
]

/** What a part or a thread has to itself; the rest belong to a whole piece. */
export const PART_TOOLS: RailKey[] = ['intent', 'rules', 'companion']

export function Rail({
  open,
  onOpen,
  counts,
  tools,
  hidden = false,
}: {
  open: RailKey | null
  onOpen: (key: RailKey | null) => void
  /** A small number on an icon, when there is something in it worth knowing. */
  counts?: Partial<Record<RailKey, number>>
  /** Which tools to draw; all of them by default. */
  tools?: RailKey[]
  hidden?: boolean
}) {
  const { t } = useTheme()
  if (hidden) return null

  return (
    <div
      style={{
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
            aria-label={tool.label}
            aria-pressed={active}
            title={tool.label}
            onClick={() => onOpen(active ? null : tool.key)}
            style={{
              position: 'relative',
              width: 40, height: 40, borderRadius: 999, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              border: `1px solid ${active ? t.textMuted : shell.line}`,
              background: active ? t.cardBg : shell.fill,
              color: active ? t.textPrimary : shell.muted,
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
  )
}

/**
 * The board's own invitation to talk the vision through — bottom and
 * centred, not a small icon tucked into a corner pill, because the point is
 * to be found, not merely available. The mark is a north star: the thing a
 * conversation about vision is for, not a speech bubble like any other chat.
 */
export function CompanionLauncher({
  active, onClick,
}: {
  active: boolean
  onClick: () => void
}) {
  const { t } = useTheme()
  return (
    <>
      {/* Below DOCK_DESKTOP_MIN, Dock claims bottom-centre too (44px seats +
         4px top/bottom padding, sitting max(14px, safe-area) off the edge —
         see dock.tsx). Clear that stack plus a visible gap; at and above the
         breakpoint Dock moves to the top, so this can sit at its normal 22px. */}
      <style>{`
        .companion-launcher { bottom: calc(max(14px, env(safe-area-inset-bottom)) + 52px + 14px); }
        @media (min-width: ${DOCK_DESKTOP_MIN}px) { .companion-launcher { bottom: 22px; } }
      `}</style>
      <button
        type="button"
        aria-label="Talk through the vision"
        aria-pressed={active}
        title="Talk it through"
        onClick={onClick}
        className="companion-launcher"
        style={{
          position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 40,
          display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          padding: '13px 24px', borderRadius: 999,
          border: `1px solid ${active ? t.violet : alpha(t.violet, 0.4)}`,
          background: active ? t.violet : 'rgba(13,12,11,0.78)',
          backdropFilter: 'blur(18px) saturate(1.1)',
          color: active ? shell.ink : t.violet,
          boxShadow: `0 10px 30px ${alpha(t.violet, active ? 0.4 : 0.2)}`,
          transition: 'background 160ms ease, color 160ms ease, box-shadow 160ms ease',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden>
          <path d="M12 2L14.6 9.4 22 12 14.6 14.6 12 22 9.4 14.6 2 12 9.4 9.4Z" />
        </svg>
        <span style={{ ...canvasType.label, textTransform: 'none', letterSpacing: 0, fontSize: 14, fontWeight: 600 }}>
          Talk about the vision
        </span>
      </button>
    </>
  )
}

/** The panel the rail opens. Scrolls on its own; never pushes the work. */
export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useTheme()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
    {/* Below the Dock breakpoint the Dock sits along the bottom, so the panel stops above it. */}
    <style>{`
      .rail-drawer { bottom: calc(max(14px, env(safe-area-inset-bottom)) + 52px + 14px); }
      @media (min-width: ${DOCK_DESKTOP_MIN}px) { .rail-drawer { bottom: 16px; } }
    `}</style>
    <aside
      aria-label={title}
      className="rail-drawer"
      style={{
        position: 'fixed', right: 62, top: 64, width: 'min(420px, calc(100vw - 96px))',
        zIndex: 39, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: t.containerBg, border: `1px solid ${t.divider}`,
        borderRadius: radius.card, boxShadow: t.containerShadow,
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
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20 }}>{children}</div>
    </aside>
    </>
  )
}
