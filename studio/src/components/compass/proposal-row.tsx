'use client'

// studio/src/components/compass/proposal-row.tsx — a pending compass proposal
// (8.7, D-053, D-058; lane D): the proposed statement, the evidence quotes with
// dates, and `confirm · correct · reject`. `correct` opens the statement in a
// field (the proposed one is kept on the row for the record). Nothing becomes
// active without one of these verbs.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { TextArea } from '@/components/ui/field'
import { canvasType } from '@/lib/studio/canvas-tokens'
import type { CompassDecideRequest, CompassEntry } from '@/lib/studio/types'
import { shortDate } from '@/components/canvas/blocks/fallback-block'
import { EvidenceList, KIND_LABEL, RowFrame, Verb, Verbs } from '@/components/compass/entry-row'

export function ProposalRow({
  entry,
  onDecide,
  busy = false,
}: {
  entry: CompassEntry
  onDecide: (entryId: string, req: CompassDecideRequest) => Promise<void>
  busy?: boolean
}) {
  const { t } = useTheme()
  const [correcting, setCorrecting] = useState(false)
  const [statement, setStatement] = useState(entry.statement || entry.proposed_statement)
  const proposed = entry.proposed_statement || entry.statement

  const saveCorrection = async () => {
    const text = statement.trim()
    if (!text) return
    await onDecide(entry.id, { action: 'correct', statement: text })
    setCorrecting(false)
  }

  return (
    <RowFrame>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <i aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.tide, flexShrink: 0, alignSelf: 'center' }} />
        <span style={{ ...canvasType.label, color: t.textMuted }}>{KIND_LABEL[entry.kind]}</span>
        <span style={{ ...canvasType.meta, color: t.textMuted }}>proposed {shortDate(entry.created_at)}</span>
      </div>

      {correcting ? (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <TextArea value={statement} onChange={setStatement} ariaLabel="corrected statement" minRows={2} autoFocus />
          <div style={{ ...canvasType.meta, color: t.textMuted }}>it proposed: “{proposed}”</div>
          <Verbs>
            <Verb primary disabled={busy || !statement.trim()} onClick={() => void saveCorrection()}>
              save
            </Verb>
            <Verb disabled={busy} onClick={() => { setCorrecting(false); setStatement(entry.statement || proposed) }}>
              cancel
            </Verb>
          </Verbs>
        </div>
      ) : (
        <>
          <div style={{ ...canvasType.words, fontSize: 15, color: t.textPrimary, marginTop: 4, wordBreak: 'break-word' }}>{proposed}</div>
          <EvidenceList evidence={entry.evidence} />
          <Verbs>
            <Verb primary disabled={busy} onClick={() => void onDecide(entry.id, { action: 'confirm' })}>
              confirm
            </Verb>
            <Verb disabled={busy} onClick={() => setCorrecting(true)}>
              correct
            </Verb>
            <Verb disabled={busy} onClick={() => void onDecide(entry.id, { action: 'reject' })}>
              reject
            </Verb>
          </Verbs>
        </>
      )}
    </RowFrame>
  )
}
