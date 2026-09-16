'use client'

// studio/src/components/new/brief-paste.tsx — lane H (10.2). The first way in:
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
  onRead(): void
  busy: boolean
  error: string | null
}) {
  const { t } = useTheme()
  const valueRef = useRef(value)
  valueRef.current = value

  const { isRecording, interimText, handleRecordToggle, clearInterim } = useDictation({
    onAppend: (text) => {
      const cur = valueRef.current
      const next = cur.trim() ? `${cur.replace(/\s+$/, '')} ${text}` : text
      valueRef.current = next
      onChange(next)
    },
    getContext: () => valueRef.current.slice(-200),
  })

  const canRead = value.trim().length > 0 && !busy

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TextArea
        value={value}
        onChange={(v) => {
          clearInterim()
          onChange(v)
        }}
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
            onRead()
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
        <PrimaryButton onClick={onRead} disabled={!canRead} loading={busy} loadingLabel="Reading it">
          Read it
        </PrimaryButton>
      </div>
    </div>
  )
}
