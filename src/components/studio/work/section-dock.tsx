'use client'

// studio/src/components/work/section-dock.tsx — every part of this piece,
// without leaving it.
//
// Floating and centred at the bottom, the same glass as the formatting
// toolbar at the top but never covering the page's own chrome: a small bar
// of numbered marks for wherever the parts are, and the arrow beside them
// opens the same storyline the map used to be its own separate page — now a
// panel that rises above the bar instead. Picking a part in it scrolls the
// writing view to that part and focuses it; nothing here ever navigates
// anywhere, because the writing module only ever has the one page.

import { useEffect, useState } from 'react'
import { AnimatePresence, motion as m } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { useDockAway } from '@/components/shell/page-shell'
import { DOCK_DESKTOP_MIN } from '@/components/shell/dock'
import { Storyline } from '@/components/studio/work/storyline'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import type { Thread, TreeNode } from '@/lib/studio/node-types'

export function SectionDock({
  parts,
  threads,
  focusedId,
  onSelect,
  onReorder,
  onEditBeat,
  onOpenThread,
  onRemove,
  onExpanded,
  disabled = false,
}: {
  parts: TreeNode[]
  threads: Thread[]
  /** Whichever part's editor currently has the caret, if any. */
  focusedId: string | null
  onSelect: (id: string) => void
  onReorder: (ids: string[]) => void
  onEditBeat: (id: string, beat: string) => void
  onOpenThread?: (id: string) => void
  onRemove?: (part: TreeNode) => void
  /** Told when the storyline panel opens and closes, so whatever it would
   *  rise over on a narrow screen (the rail) can step aside. */
  onExpanded?: (open: boolean) => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [expanded, setExpanded] = useState(false)
  const dockAway = useDockAway()
  useEffect(() => {
    onExpanded?.(expanded)
    return () => { if (expanded) onExpanded?.(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const jump = (id: string) => {
    onSelect(id)
    setExpanded(false)
  }

  return (
    <div
      className="section-dock"
      data-dock-away={dockAway || undefined}
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 40,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
      }}
    >
      {/* Below the Dock's breakpoint the Dock is along the bottom too (44px
         seats, 4px padding, max(14px, safe area) off the edge — dock.tsx),
         and this was underneath it at the top of the page. It stands above
         the Dock there and comes down when the Dock steps away. The marks
         are a finger's size on a phone. */}
      <style>{`
        .section-dock { bottom: 16px; transition: bottom .2s ease; }
        .section-dock-mark { width: 24px; height: 24px; }
        @media (max-width: ${DOCK_DESKTOP_MIN - 1}px) {
          .section-dock { bottom: calc(max(14px, env(safe-area-inset-bottom)) + 54px + 10px); }
          .section-dock[data-dock-away] { bottom: max(14px, env(safe-area-inset-bottom)); }
          .section-dock-mark { width: 34px; height: 34px; }
        }
      `}</style>
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            key="section-dock-panel"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{
              width: 'min(960px, calc(100vw - 24px))', maxHeight: '54vh', overflowY: 'auto',
              background: t.containerBg, border: `1px solid ${t.divider}`,
              borderRadius: radius.card, boxShadow: t.containerShadow, padding: 20,
            }}
          >
            <Storyline
              parts={parts}
              threads={threads}
              onReorder={onReorder}
              onEditBeat={onEditBeat}
              onSelect={jump}
              onOpenThread={onOpenThread}
              onRemove={onRemove}
              disabled={disabled}
            />
          </m.div>
        )}
      </AnimatePresence>

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 999,
          background: alpha(t.cardBg, 0.86), backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
          border: `1px solid ${t.divider}`, boxShadow: t.shadow,
          maxWidth: 'calc(100vw - 24px)', overflowX: 'auto',
        }}
      >
        {parts.map((part, i) => {
          const focused = part.id === focusedId
          const done = part.status === 'done'
          const tone = focused ? t.tide : done ? t.verdant : t.textMuted
          return (
            <button
              key={part.id}
              type="button"
              onClick={() => jump(part.id)}
              title={part.title || `Part ${i + 1}`}
              aria-label={`Jump to ${part.title || `part ${i + 1}`}`}
              aria-current={focused || undefined}
              className="section-dock-mark"
              style={{
                borderRadius: 999, padding: 0, border: 'none', cursor: 'pointer',
                flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                ...canvasType.chip, fontSize: 11, color: tone,
                background: focused || done ? alpha(tone, 0.16) : 'transparent',
                transition: 'background-color 140ms ease, color 140ms ease',
              }}
            >
              {i + 1}
            </button>
          )
        })}

        <span aria-hidden style={{ width: 1, height: 16, flexShrink: 0, background: t.divider }} />

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Hide the other sections' : 'See every section'}
          aria-expanded={expanded}
          title={expanded ? 'Hide the other sections' : 'See every section'}
          className="section-dock-mark"
          style={{
            borderRadius: 999, padding: 0, border: 'none', cursor: 'pointer', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: expanded ? alpha(t.textPrimary, 0.1) : 'transparent', color: t.textMuted,
          }}
        >
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 200ms ease' }}
          >
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
