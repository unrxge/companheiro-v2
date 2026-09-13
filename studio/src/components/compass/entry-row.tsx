'use client'

// studio/src/components/compass/entry-row.tsx — one compass entry in the drawer
// / sheet (8.7; lane D): the kind as a mono label, the statement in the person's
// words, the evidence quotes with their dates, and the verbs the section allows
// (forget · restore · done · let go). Also home to the small text verb every
// compass row uses. No scores, no counts.

import { useState, type ReactNode } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType, line } from '@/lib/studio/canvas-tokens'
import type { CompassDecideRequest, CompassEntry, CompassEvidence } from '@/lib/studio/types'
import { shortDate } from '@/components/canvas/blocks/fallback-block'

export const KIND_LABEL: Record<CompassEntry['kind'], string> = {
  refusal: 'refusal',
  non_negotiable: 'non-negotiable',
  commitment: 'commitment',
  drift: 'drift',
}

export type EntryVerb = 'forget' | 'restore' | 'done' | 'let go'

/** A plain text verb on the drawer's surface: quiet at rest, ink on hover. */
export function Verb({
  children,
  onClick,
  disabled = false,
  primary = false,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  const { t } = useTheme()
  const [hot, setHot] = useState(false)
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      style={{
        ...canvasType.small,
        fontWeight: 500,
        color: disabled ? t.textMuted : primary || hot ? t.textPrimary : t.textSecondary,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: disabled ? 'default' : 'pointer',
        lineHeight: 1.2,
        opacity: disabled ? 0.5 : 1,
        transition: 'color 120ms ease',
      }}
    >
      {children}
    </button>
  )
}

/** `verb · verb` row. */
export function Verbs({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>{children}</div>
}

export function EvidenceList({ evidence, max = 3 }: { evidence: CompassEvidence[]; max?: number }) {
  const { t } = useTheme()
  const rows = evidence.filter((e) => e.quote?.trim()).slice(-max)
  if (rows.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      {rows.map((e, i) => (
        <div key={`${e.entry_id}-${i}`} style={{ ...canvasType.small, color: t.textSecondary, wordBreak: 'break-word' }}>
          “{e.quote.trim()}”
          {e.at && <span style={{ ...canvasType.meta, color: t.textMuted, marginLeft: 8 }}>{shortDate(e.at)}</span>}
        </div>
      ))}
    </div>
  )
}

export function RowFrame({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  const { t } = useTheme()
  return (
    <div style={{ padding: '12px 0', borderTop: `1px solid ${line.onPaper(t)}`, opacity: muted ? 0.7 : 1 }}>{children}</div>
  )
}

export function EntryRow({
  entry,
  verbs,
  onDecide,
  busy = false,
  muted = false,
}: {
  entry: CompassEntry
  verbs: EntryVerb[]
  onDecide: (entryId: string, req: CompassDecideRequest) => Promise<void>
  busy?: boolean
  muted?: boolean
}) {
  const { t } = useTheme()
  const commitment = entry.kind === 'commitment'
  const meta: string[] = []
  if (commitment && entry.created_at) meta.push(`said ${shortDate(entry.created_at)}`)
  if (entry.resolution === 'done' && entry.resolved_at) meta.push(`done ${shortDate(entry.resolved_at)}`)
  if (entry.resolution === 'let_go' && entry.resolved_at) meta.push(`let go ${shortDate(entry.resolved_at)}`)
  if (entry.status === 'dormant' && entry.forgotten_at) meta.push(`forgotten ${shortDate(entry.forgotten_at)}`)
  if (entry.status === 'dormant' && entry.rejection_note === 'expired') meta.push('expired unconfirmed')
  if (entry.status === 'active' && !commitment && entry.last_reinforced_at) meta.push(`last heard ${shortDate(entry.last_reinforced_at)}`)

  return (
    <RowFrame muted={muted}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ ...canvasType.label, color: t.textMuted, flexShrink: 0 }}>{KIND_LABEL[entry.kind]}</span>
        {meta.length > 0 && <span style={{ ...canvasType.meta, color: t.textMuted }}>{meta.join(' · ')}</span>}
      </div>
      <div
        style={{
          ...canvasType.words,
          fontSize: 15,
          color: t.textPrimary,
          marginTop: 4,
          wordBreak: 'break-word',
          textDecoration: entry.resolution === 'done' ? 'line-through' : undefined,
          opacity: entry.resolution ? 0.6 : 1,
        }}
      >
        {entry.statement}
      </div>
      {!commitment && <EvidenceList evidence={entry.evidence} />}
      {verbs.length > 0 && (
        <Verbs>
          {verbs.includes('done') && (
            <Verb primary disabled={busy} onClick={() => void onDecide(entry.id, { action: 'resolve', resolution: 'done' })}>
              done
            </Verb>
          )}
          {verbs.includes('let go') && (
            <Verb disabled={busy} onClick={() => void onDecide(entry.id, { action: 'resolve', resolution: 'let_go' })}>
              let go
            </Verb>
          )}
          {verbs.includes('forget') && (
            <Verb disabled={busy} onClick={() => void onDecide(entry.id, { action: 'forget' })}>
              forget
            </Verb>
          )}
          {verbs.includes('restore') && (
            <Verb primary disabled={busy} onClick={() => void onDecide(entry.id, { action: 'restore' })}>
              restore
            </Verb>
          )}
        </Verbs>
      )}
    </RowFrame>
  )
}
