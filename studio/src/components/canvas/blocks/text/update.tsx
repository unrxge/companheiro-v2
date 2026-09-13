'use client'

// studio/src/components/canvas/blocks/text/update.tsx — the update block (6.2).
// The person's own words in `words`. The eyebrow (UPDATE · 12 SEP · 09:14 ·
// FROM TALK / POSTED) is the shell's, built from content.said_at and origin;
// the arrival chrome (dashed tide outline, marker, place · dismiss) is the
// shell's too. In place: a plain textarea (D-027). A stacked update is not
// rendered on its own — the timeline block lists it (D-035).

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { useStore } from '@/lib/studio/hooks'
import { useActions } from '@/components/canvas/actions'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'
import { shortDate, shortTime } from '@/components/canvas/blocks/fallback-block'
import type { UpdateContent } from '@/lib/studio/types'
import { finishEdit, InlineTextarea } from '@/components/canvas/blocks/text/note'

export const UPDATE_PLACEHOLDER = 'what happened'

/** `12 sep · 09:14 · from talk` — the update's meta line, lowercase (used by sheets and the dock). */
export function updateMeta(content: UpdateContent, createdAt: string): string {
  const at = content.said_at || createdAt
  const parts = [shortDate(at)]
  const time = shortTime(at)
  if (time) parts.push(time)
  parts.push(content.origin === 'talk' ? 'from talk' : 'posted')
  return parts.filter(Boolean).join(' · ')
}

export function UpdateWords({ text, color, mutedColor }: { text: string; color: string; mutedColor: string }) {
  return (
    <p style={{ ...canvasType.words, color: text ? color : mutedColor, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {text || UPDATE_PLACEHOLDER}
    </p>
  )
}

export function UpdateBlock({ block, editing }: BlockRendererProps<'update'>) {
  const { t } = useTheme()
  const store = useStore()
  const actions = useActions()
  const text = block.content.text

  if (editing) {
    return (
      <InlineTextarea
        initial={text}
        typeStyle={canvasType.words}
        color={t.textPrimary}
        placeholder={UPDATE_PLACEHOLDER}
        ariaLabel="update"
        onCommit={(v) => finishEdit(store, actions, block, { ...block.content, text: v.trim() })}
      />
    )
  }
  return <UpdateWords text={text} color={t.textPrimary} mutedColor={t.textMuted} />
}
