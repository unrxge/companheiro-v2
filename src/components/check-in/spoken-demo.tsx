'use client'

// The walk's second example, said out loud: the microphone is tapped, it
// records (rings breathing out of it, a small live level), the words arrive
// in the box as they are spoken, the newest still settling, and then the
// recording stops and Send appears. Shown, never pressed.

import { useEffect, useState } from 'react'
import { AnimatePresence, motion as m, useReducedMotion } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { MicButton } from '@/components/ui/mic-button'
import { PrimaryButton } from '@/components/ui/buttons'
import { type as typeRoles } from '@/lib/design-tokens'

import { SPOKEN } from '@/lib/check-in-tour'

const { tapMs: TAP_MS, wordMs: WORD_MS, settleMs: SETTLE_MS } = SPOKEN

export function SpokenDemo({ words }: { words: string }) {
  const { t } = useTheme()
  const reduce = useReducedMotion() ?? false
  const all = words.split(' ')
  const [heard, setHeard] = useState(reduce ? all.length : 0)
  const [phase, setPhase] = useState<'waiting' | 'recording' | 'done'>(reduce ? 'done' : 'waiting')

  useEffect(() => {
    if (reduce) return
    const timers: number[] = []
    timers.push(window.setTimeout(() => setPhase('recording'), TAP_MS))
    all.forEach((_, i) => timers.push(window.setTimeout(() => setHeard(i + 1), TAP_MS + 300 + i * WORD_MS)))
    timers.push(window.setTimeout(() => setPhase('done'), TAP_MS + 300 + all.length * WORD_MS + SETTLE_MS))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words, reduce])

  const recording = phase === 'recording'
  const said = all.slice(0, heard)

  return (
    <>
      <div style={{ position: 'relative', width: 80, height: 80 }}>
        {/* the tap, seen landing */}
        {phase === 'waiting' && !reduce && (
          <m.span
            aria-hidden
            initial={{ opacity: 0, scale: 1.6 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [1.6, 0.8, 0.8, 0.8] }}
            transition={{ duration: TAP_MS / 1000, times: [0, 0.45, 0.8, 1] }}
            style={{ position: 'absolute', left: '50%', top: '50%', width: 34, height: 34, marginLeft: -17, marginTop: -17, borderRadius: '50%', background: 'rgba(255,255,255,0.35)', zIndex: 2, pointerEvents: 'none' }}
          />
        )}
        {/* recording: rings breathing out of the button */}
        {recording && !reduce && [0, 1, 2].map((i) => (
          <m.span
            key={i}
            aria-hidden
            initial={{ opacity: 0.5, scale: 1 }}
            animate={{ opacity: 0, scale: 1.9 }}
            transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1.5px solid ${t.ember}`, pointerEvents: 'none' }}
          />
        ))}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <MicButton recording={recording} onToggle={() => {}} size={80} />
        </div>
      </div>

      <div style={{ height: 22, display: 'flex', alignItems: 'center', gap: 10 }}>
        <AnimatePresence mode="wait">
          {recording ? (
            <m.div key="rec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...typeRoles.eyebrow, color: t.textMuted }}>Recording</span>
              {/* a small live level */}
              <span aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 3, height: 16 }}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <m.span
                    key={i}
                    animate={reduce ? undefined : { height: [4, 14, 6, 12, 4] }}
                    transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
                    style={{ width: 3, height: 6, borderRadius: 2, background: t.ember }}
                  />
                ))}
              </span>
            </m.div>
          ) : phase === 'done' ? (
            <m.span key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ ...typeRoles.eyebrow, color: t.textMuted }}>Said</m.span>
          ) : null}
        </AnimatePresence>
      </div>

      <div
        aria-label="An example, said out loud"
        style={{
          width: '100%', boxSizing: 'border-box', minHeight: 84, backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`,
          borderRadius: 12, padding: '12px 14px', fontFamily: 'var(--font-geist-sans)', fontSize: 16, fontWeight: 500,
          color: t.textPrimary, lineHeight: 1.65,
        }}
      >
        {said.map((w, i) => (
          <m.span
            key={i}
            initial={reduce ? false : { opacity: 0, filter: 'blur(3px)' }}
            animate={{ opacity: i === said.length - 1 && recording ? 0.55 : 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.25 }}
          >
            {w}{i < said.length - 1 ? ' ' : ''}
          </m.span>
        ))}
        {said.length === 0 && <span style={{ color: t.textMuted }}>Your words will appear here…</span>}
      </div>

      <AnimatePresence>
        {phase === 'done' && (
          <m.div key="send" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%' }}>
            <PrimaryButton full size="lg">Send</PrimaryButton>
          </m.div>
        )}
      </AnimatePresence>
    </>
  )
}
