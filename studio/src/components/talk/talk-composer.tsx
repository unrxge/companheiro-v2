'use client'

// studio/src/components/talk/talk-composer.tsx — the talk composer (8.1): the
// copied Composer (textarea + MicButton + send) with useDictation (Web Speech →
// /api/punctuate, words verified unchanged). Typing is always allowed, any length;
// no timer, no counter, nothing asks the person to sort. `autoDictate` starts
// recording on mount (the pill's press-and-hold, the phone bar's hold).

import { useEffect, useRef, useState } from 'react'
import { Composer } from '@/components/conversation/thread'
import { useDictation } from '@/lib/use-dictation'
import { joinText } from '@/lib/dictation-text'
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
  const [value, setValue] = useState('')
  const valueRef = useRef('')
  const voiceUsed = useRef(false)
  valueRef.current = value

  const { isRecording, interimText, handleRecordToggle, clearInterim, finish } = useDictation({
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

  // (useDictation turns the microphone off itself when the composer unmounts.)

  // What the box shows: typed text plus dictation still being punctuated,
  // which can still change as the sentence goes on.
  const shown = joinText(value, interimText)

  const send = () => {
    if (disabled || !shown.trim()) return
    const spoken = finish()
    const text = joinText(value, spoken).trim()
    const input: TalkInput = voiceUsed.current || spoken ? 'voice' : 'typed'
    voiceUsed.current = false
    setValue('')
    onSend(text, input)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Composer
        value={shown}
        onChange={(v) => {
          // Typing takes whatever dictation was showing into the text; it was still spoken.
          if (interimText) voiceUsed.current = true
          setValue(v)
          clearInterim()
        }}
        onSend={send}
        disabled={disabled}
        placeholder={placeholder}
        recording={isRecording}
        onToggleRecording={handleRecordToggle}
        sendLabel={TALK_COPY.send}
        autoFocus={autoFocus}
      />
    </div>
  )
}
