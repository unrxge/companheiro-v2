'use client'

// studio/src/components/canvas/blocks/rich/compass-block.tsx — the compass block
// on the canvas, read-only (6.2, D-053; lane D). Rows on cardBgInner: a mono
// kind column (REFUSAL · NON-NEGOTIABLE · OPEN · DRIFT) + the statement; at most
// six rows (3 refusals/non-negotiables by reinforcement, 2 open commitments,
// 1 drift); a first row `n waiting` with a tide dot when proposals wait, and
// `one thing to mark` with an ember dot when a catch is unmarked; footer
// `open →`. The verbs live only in the drawer / sheet.

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { splitCompass } from '@/lib/studio/compass-split'
import { useCatches, useCompass, useStore } from '@/lib/studio/hooks'
import type { CompassEntry } from '@/lib/studio/types'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'

export const KIND_WORD: Record<CompassEntry['kind'], string> = {
  refusal: 'refusal',
  non_negotiable: 'non-negotiable',
  commitment: 'open',
  drift: 'drift',
}

const byReinforcement = (a: CompassEntry, b: CompassEntry) =>
  b.reinforcement_count - a.reinforcement_count || a.created_at.localeCompare(b.created_at)

/** The six rows the compact block shows (pure so the sheet header can reuse it). */
export function compactRows(entries: CompassEntry[], now: Date = new Date()): CompassEntry[] {
  const split = splitCompass(entries, now)
  const held = split.active.filter((e) => e.kind === 'refusal' || e.kind === 'non_negotiable').sort(byReinforcement).slice(0, 3)
  const open = split.openCommitments.filter((e) => split.active.includes(e)).slice(0, 2)
  const drift = split.active.filter((e) => e.kind === 'drift').sort(byReinforcement).slice(0, 1)
  return [...held, ...open, ...drift]
}

export function CompassBlock({ phone }: BlockRendererProps<'compass'>) {
  const { t } = useTheme()
  const store = useStore()
  const compass = useCompass()
  const catches = useCatches()
  const pending = compass.filter((e) => e.status === 'pending').length
  const unmarked = catches.filter((c) => c.mark === null).length
  const rows = compactRows(compass)
  const empty = rows.length === 0 && pending === 0 && unmarked === 0

  const open = () => {
    store.set((s) => {
      s.drawer = { kind: 'compass' }
    })
  }

  const dotRow = (color: string, text: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <i aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
      <span style={{ ...canvasType.small, fontWeight: 500, color: t.textPrimary }}>{text}</span>
    </div>
  )

  return (
    <div>
      <div style={{ backgroundColor: t.cardBgInner, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pending > 0 && dotRow(t.tide, pending === 1 ? '1 waiting' : `${pending} waiting`)}
        {unmarked > 0 && dotRow(t.ember, 'one thing to mark')}
        {rows.map((e) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ ...canvasType.label, color: t.textMuted, width: 96, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {KIND_WORD[e.kind]}
            </span>
            <span style={{ ...canvasType.small, color: t.textPrimary, minWidth: 0, wordBreak: 'break-word' }}>{e.statement}</span>
          </div>
        ))}
        {empty && <span style={{ ...canvasType.small, color: t.textMuted }}>nothing here yet — it fills from what you say in talk</span>}
      </div>
      {!phone && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            type="button"
            data-no-drag
            onClick={(e) => {
              e.stopPropagation()
              open()
            }}
            style={{ ...canvasType.small, fontWeight: 500, color: t.textPrimary, background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1.2 }}
          >
            open →
          </button>
        </div>
      )}
    </div>
  )
}
