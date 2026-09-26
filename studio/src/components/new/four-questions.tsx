'use client'

// studio/src/components/new/four-questions.tsx — lane H (10.2). The second way
// in: the four questions one at a time, each answered typed or by voice,
// `next`; the last one reads `read it`. Answers live in the parent so a
// switch back to the brief and forth loses nothing.

import { useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { TextArea } from '@/components/ui/field'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { MicButton } from '@/components/ui/mic-button'
import { useDictation } from '@/lib/use-dictation'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { type as typeRoles } from '@/lib/design-tokens'
import { FOUR_QUESTIONS } from '@/lib/studio/concept'

export type FourAnswers = [string, string, string, string]

export function FourQuestions({
  answers,
  onChange,
  onRead,
  busy,
  error,
}: {
  answers: FourAnswers
  onChange(next: FourAnswers): void
  /** Called with the answers as they stand, dictation still being punctuated included. */
  onRead(latest: FourAnswers): void
  busy: boolean
  error: string | null
}) {
  const { t } = useTheme()
  const [index, setIndex] = useState(() => {
    const firstEmpty = answers.findIndex((a) => !a.trim())
    return firstEmpty === -1 ? 3 : firstEmpty
  })
  const answersRef = useRef(answers)
  answersRef.current = answers
  // The question that was open when recording started: punctuated segments
  // arrive a moment after the last word, so a `next` pressed mid-sentence must
  // not move them onto the following answer.
  const dictIndexRef = useRef(index)

  const setAnswer = (i: number, text: string) => {
    const next = [...answersRef.current] as FourAnswers
    next[i] = text
    answersRef.current = next
    onChange(next)
  }

  const { isRecording, interimText, handleRecordToggle, finish } = useDictation({
    onAppend: (text) => {
      const i = dictIndexRef.current
      const cur = answersRef.current[i]
      setAnswer(i, cur.trim() ? `${cur.replace(/\s+$/, '')} ${text}` : text)
    },
    getContext: () => answersRef.current[dictIndexRef.current].slice(-200),
  })

  const toggleRecording = () => {
    if (!isRecording) dictIndexRef.current = index
    handleRecordToggle()
  }

  const last = index === FOUR_QUESTIONS.length - 1
  const current = answers[index]
  // Words still being punctuated count: they belong to the question that was
  // open when recording started.
  const pendingHere = dictIndexRef.current === index ? interimText : ''
  const canAdvance = (current.trim().length > 0 || pendingHere.trim().length > 0) && !busy

  // Stop the mic and fold whatever it was still punctuating into its answer.
  const settleDictation = () => {
    const tail = finish()
    if (!tail) return
    const i = dictIndexRef.current
    const cur = answersRef.current[i]
    setAnswer(i, cur.trim() ? `${cur.replace(/\s+$/, '')} ${tail}` : tail)
  }

  const go = (next: number) => {
    settleDictation()
    setIndex(next)
  }

  const advance = () => {
    if (!canAdvance) return
    if (last) {
      settleDictation()
      onRead(answersRef.current)
    } else go(index + 1)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div aria-hidden style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {FOUR_QUESTIONS.map((_, i) => (
          <span
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: i === index ? t.textPrimary : 'transparent',
              boxShadow: `inset 0 0 0 1px ${i === index ? t.textPrimary : t.textMuted}`,
              transition: 'background-color 150ms ease',
            }}
          />
        ))}
      </div>
      <h2 style={{ ...typeRoles.h2, color: t.textPrimary }}>{FOUR_QUESTIONS[index]}</h2>
      <TextArea
        key={index}
        value={current}
        // Dictation shows below the box rather than in it, so typing doesn't
        // take it over: it keeps settling onto the end of the answer.
        onChange={(v) => setAnswer(index, v)}
        placeholder="In your words"
        ariaLabel={FOUR_QUESTIONS[index]}
        voice
        minRows={4}
        maxHeight={480}
        disabled={busy}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            advance()
          }
        }}
      />
      {interimText && (
        <div style={{ ...canvasType.small, color: t.textMuted, fontStyle: 'italic', marginTop: -8 }}>{interimText}</div>
      )}
      {error && <div style={{ ...canvasType.meta, color: t.danger }}>{error}</div>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <MicButton recording={isRecording} onToggle={toggleRecording} disabled={busy} size={44} />
          <span style={{ ...canvasType.meta, color: t.textMuted }}>{isRecording ? 'Listening' : 'Type or speak'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {index > 0 && (
            <GhostButton onClick={() => go(index - 1)} disabled={busy}>
              Back
            </GhostButton>
          )}
          <PrimaryButton onClick={advance} disabled={!canAdvance} loading={busy && last} loadingLabel="Reading it">
            {last ? 'Read it' : 'Next'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
