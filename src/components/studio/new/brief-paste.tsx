'use client'

// src/components/studio/new/brief-paste.tsx — lane H (10.2). The first way in:
// one large textarea (`paste a brief, a note to yourself, anything`), typed or
// dictated, then `read it`. Nothing here is saved anywhere.

import { useRef } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { TextArea } from '@/components/ui/field'
import { PrimaryButton } from '@/components/ui/buttons'
import { MicButton } from '@/components/ui/mic-button'
import { useDictation } from '@/lib/use-dictation'
import { canvasType } from '@/lib/studio/canvas-tokens'

export function BriefPaste({
  value,
  onChange,
  onRead,
  busy,
  error,
}: {
  value: string
  onChange(next: string): void
  /** Called with the brief as it stands, dictation still being punctuated included. */
  onRead(latest: string): void
  busy: boolean
  error: string | null
}) {
  const { t } = useTheme()
  const valueRef = useRef(value)
  valueRef.current = value

  const append = (text: string) => {
    const cur = valueRef.current
    const next = cur.trim() ? `${cur.replace(/\s+$/, '')} ${text}` : text
    valueRef.current = next
    onChange(next)
  }

  const { isRecording, interimText, handleRecordToggle, finish } = useDictation({
    onAppend: append,
    getContext: () => valueRef.current.slice(-200),
  })

  const canRead = (value.trim().length > 0 || interimText.trim().length > 0) && !busy

  // Stop the mic, fold whatever it was still punctuating into the brief, read.
  const read = () => {
    const tail = finish()
    if (tail) append(tail)
    onRead(valueRef.current)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TextArea
        value={value}
        // Dictation shows below the box rather than in it, so typing doesn't
        // take it over: it keeps settling onto the end of the brief.
        onChange={onChange}
        placeholder="Paste a brief, a note to yourself, anything"
        ariaLabel="A brief"
        voice
        minRows={8}
        maxHeight={640}
        disabled={busy}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canRead) {
            e.preventDefault()
            read()
          }
        }}
      />
      {interimText && (
        <div style={{ ...canvasType.small, color: t.textMuted, fontStyle: 'italic', marginTop: -8 }}>{interimText}</div>
      )}
      {error && <div style={{ ...canvasType.meta, color: t.danger }}>{error}</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MicButton recording={isRecording} onToggle={handleRecordToggle} disabled={busy} size={44} />
          <span style={{ ...canvasType.meta, color: t.textMuted }}>{isRecording ? 'Listening' : 'Type or speak'}</span>
        </div>
        <PrimaryButton onClick={read} disabled={!canRead} loading={busy} loadingLabel="Reading it">
          Read it
        </PrimaryButton>
      </div>
    </div>
  )
}
