'use client'

// studio/src/components/talk/catch-line.tsx — the catch, after the reply (8.1,
// D-056): the sentence in the companion's voice with an ember marker (ember is the
// system's pencil, D-043) and two mono buttons, `that's right` · `that's wrong`.
// Marking is final; the marked sentence then reads as a plain companion line.

import { useState } from 'react'
import { motion as m } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { fonts } from '@/lib/design-tokens'
import { canvasType, line, motionSpec } from '@/lib/studio/canvas-tokens'
import { api } from '@/lib/studio/api-client'
import type { Catch } from '@/lib/studio/types'
import { TALK_COPY } from '@/lib/studio/talk/prompts'

export function CatchLine({ catch: row, onMarked }: { catch: Catch; onMarked?: (marked: Catch) => void }) {
  const { t } = useTheme()
  const [busy, setBusy] = useState<'right' | 'wrong' | null>(null)
  const [failed, setFailed] = useState(false)
  const marked = row.mark

  const mark = async (value: 'right' | 'wrong') => {
    if (busy || marked) return
    setBusy(value)
    setFailed(false)
    try {
      const { catch: updated } = await api.catches.mark(row.id, { mark: value })
      onMarked?.(updated)
    } catch {
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  const button = (value: 'right' | 'wrong', label: string) => (
    <button
      type="button"
      onClick={() => mark(value)}
      disabled={busy !== null}
      style={{
        ...canvasType.label,
        fontFamily: fonts.mono,
        color: busy === value ? t.textMuted : t.textSecondary,
        background: 'transparent',
        border: `1px solid ${line.onPaper(t)}`,
        borderRadius: 6,
        padding: '6px 10px',
        cursor: busy ? 'default' : 'pointer',
        transition: `color ${motionSpec.hoverMs}ms ease, border-color ${motionSpec.hoverMs}ms ease`,
      }}
    >
      {label}
    </button>
  )

  return (
    <m.div
      data-catch-line
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 14, position: 'relative' }}
    >
      <i
        aria-hidden
        style={{ position: 'absolute', left: 0, top: 9, width: 6, height: 6, borderRadius: '50%', backgroundColor: t.ember }}
      />
      <p style={{ fontFamily: fonts.ui, fontSize: 16, lineHeight: 1.65, margin: 0, color: t.textSecondary, whiteSpace: 'pre-wrap' }}>
        {row.sentence}
      </p>
      {marked ? (
        <span style={{ ...canvasType.meta, color: t.textMuted }}>{marked === 'right' ? TALK_COPY.markedRight : TALK_COPY.markedWrong}</span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {button('right', TALK_COPY.thatsRight)}
          {button('wrong', TALK_COPY.thatsWrong)}
          {failed && <span style={{ ...canvasType.meta, color: t.textMuted }}>{TALK_COPY.failed}</span>}
        </div>
      )}
    </m.div>
  )
}
