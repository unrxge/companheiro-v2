'use client'

// studio/src/components/work/rail.tsx — the right rail and the drawer behind it.
//
// Everything about the vision lives here: what the thing is for, the rules, the
// threads, the companion. None of it belongs in the middle of the page, which
// is where the work is made. Same rail at every altitude, so it is learned once.
//
// Follows the tool rail in the main app: circular icons pinned to the right
// edge, a panel that opens beside them, one open at a time.

import { useEffect, type ReactNode } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'

export type RailKey = 'intent' | 'rules' | 'threads' | 'companion'

const icon = (path: ReactNode) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
)

export const RAIL_TOOLS: { key: RailKey; label: string; icon: ReactNode }[] = [
  { key: 'intent', label: 'what this is for', icon: icon(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" /></>) },
  { key: 'rules', label: 'the rules', icon: icon(<><path d="M5 4h14v16H5z" /><line x1="8.5" y1="9" x2="15.5" y2="9" /><line x1="8.5" y1="13" x2="15.5" y2="13" /><line x1="8.5" y1="17" x2="12" y2="17" /></>) },
  { key: 'threads', label: 'what runs across it', icon: icon(<><line x1="7" y1="3" x2="7" y2="21" /><path d="M7 8h6a3 3 0 0 1 3 3" /><path d="M7 15h5a3 3 0 0 0 3-3" /></>) },
  { key: 'companion', label: 'talk it through', icon: icon(<><path d="M20 14a3 3 0 0 1-3 3H9l-4 3V6a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3z" /></>) },
]

export function Rail({
  open,
  onOpen,
  counts,
  hidden = false,
}: {
  open: RailKey | null
  onOpen: (key: RailKey | null) => void
  /** A small number on an icon, when there is something in it worth knowing. */
  counts?: Partial<Record<RailKey, number>>
  hidden?: boolean
}) {
  const { t } = useTheme()
  if (hidden) return null

  return (
    <div
      style={{
        position: 'fixed', right: 14, top: '50%', transform: 'translateY(-50%)',
        zIndex: 40, display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      {RAIL_TOOLS.map((tool) => {
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
              width: 38, height: 38, borderRadius: 999, padding: 0,
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
    <aside
      aria-label={title}
      style={{
        position: 'fixed', right: 62, top: 64, bottom: 16, width: 'min(420px, calc(100vw - 96px))',
        zIndex: 39, display: 'flex', flexDirection: 'column', overflow: 'hidden',
        background: t.containerBg, border: `1px solid ${t.divider}`,
        borderRadius: radius.card, boxShadow: t.containerShadow,
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          padding: '14px 16px', borderBottom: `1px solid ${alpha(t.textPrimary, 0.08)}`,
          flexShrink: 0,
        }}
      >
        <span style={{ ...canvasType.label, color: t.textMuted }}>{title}</span>
        <button
          type="button"
          aria-label="close this panel"
          onClick={onClose}
          style={{
            ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none',
            cursor: 'pointer', padding: 4,
          }}
        >
          ✕
        </button>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>{children}</div>
    </aside>
  )
}
