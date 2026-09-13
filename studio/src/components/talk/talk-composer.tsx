'use client'

// studio/src/components/talk/talk-composer.tsx — the talk composer (8.1): the
// copied Composer (textarea + MicButton + send) with useDictation (Web Speech →
// /api/punctuate, words verified unchanged). Typing is always allowed, any length;
// no timer, no counter, nothing asks the person to sort. `autoDictate` starts
// recording on mount (the pill's press-and-hold, the phone bar's hold).

import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { Composer } from '@/components/conversation/thread'
import { useDictation } from '@/lib/use-dictation'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { TALK_COPY } from '@/lib/studio/talk/prompts'

export type TalkInput = 'typed' | 'voice'

export function TalkComposer({
  onSend,
  disabled = false,
  autoDictate = false,
  placeholder = TALK_COPY.placeholder,
  autoFocus = false,
}: {
  onSend: (text: string, input: TalkInput) => void
  disabled?: boolean
  autoDictate?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  const { t } = useTheme()
  const [value, setValue] = useState('')
  const valueRef = useRef('')
  const voiceUsed = useRef(false)
  valueRef.current = value

  const { isRecording, interimText, handleRecordToggle, stopRecording, clearInterim } = useDictation({
    onAppend: (text) => {
      voiceUsed.current = true
      setValue((v) => (v.trim().length > 0 ? `${v.replace(/\s+$/, '')} ${text}` : text))
    },
    getContext: () => valueRef.current.slice(-200),
  })

  // start dictating once, on mount, when asked to
  const toggleRef = useRef(handleRecordToggle)
  toggleRef.current = handleRecordToggle
  const started = useRef(false)
  useEffect(() => {
    if (!autoDictate || started.current) return
    started.current = true
    toggleRef.current()
  }, [autoDictate])

  // never leave the microphone on after the composer unmounts
  const stopRef = useRef(stopRecording)
  stopRef.current = stopRecording
  useEffect(() => () => { stopRef.current() }, [])

  const send = () => {
    const text = value.trim()
    if (!text || disabled) return
    if (isRecording) stopRecording()
    const input: TalkInput = voiceUsed.current ? 'voice' : 'typed'
    voiceUsed.current = false
    setValue('')
    clearInterim()
    onSend(text, input)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Composer
        value={value}
        onChange={(v) => { setValue(v); clearInterim() }}
        onSend={send}
        disabled={disabled}
        placeholder={placeholder}
        recording={isRecording}
        onToggleRecording={handleRecordToggle}
        sendLabel={TALK_COPY.send}
        autoFocus={autoFocus}
      />
      {isRecording && interimText && (
        <p aria-live="polite" style={{ ...canvasType.small, color: t.textMuted, margin: 0, whiteSpace: 'pre-wrap' }}>
          {interimText}
        </p>
      )}
    </div>
  )
}
