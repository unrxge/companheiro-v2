'use client'

// studio/src/components/compass/catch-row.tsx — one catch (8.6, D-056; lane D):
// the companion's sentence and `right · wrong` while unmarked; read-only with
// its date once marked wrong (the "where you said the companion was wrong" list).

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import type { Catch } from '@/lib/studio/types'
import { shortDate } from '@/components/canvas/blocks/fallback-block'
import { RowFrame, Verb, Verbs } from '@/components/compass/entry-row'

export function CatchRow({
  item,
  onMark,
  busy = false,
}: {
  item: Catch
  onMark?: (catchId: string, mark: 'right' | 'wrong') => Promise<void>
  busy?: boolean
}) {
  const { t } = useTheme()
  const unmarked = item.mark === null
  return (
    <RowFrame>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        {unmarked && <i aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.ember, flexShrink: 0, alignSelf: 'center' }} />}
        <span style={{ ...canvasType.label, color: t.textMuted }}>{unmarked ? 'to mark' : `marked ${item.mark}`}</span>
        <span style={{ ...canvasType.meta, color: t.textMuted }}>{shortDate(item.marked_at ?? item.created_at)}</span>
      </div>
      <div style={{ ...canvasType.small, color: t.textPrimary, marginTop: 4, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{item.sentence}</div>
      {item.decision_text && (
        <div style={{ ...canvasType.meta, color: t.textMuted, marginTop: 4, wordBreak: 'break-word' }}>you said: “{item.decision_text}”</div>
      )}
      {unmarked && onMark && (
        <Verbs>
          <Verb primary disabled={busy} onClick={() => void onMark(item.id, 'right')}>
            that&apos;s right
          </Verb>
          <Verb disabled={busy} onClick={() => void onMark(item.id, 'wrong')}>
            that&apos;s wrong
          </Verb>
        </Verbs>
      )}
    </RowFrame>
  )
}
