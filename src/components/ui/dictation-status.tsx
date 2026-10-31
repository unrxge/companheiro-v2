'use client'

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion as m } from 'motion/react'

/**
 * What the microphone is doing, said out loud, for while no words are on
 * screen: "Listening" with bars that move with the voice and the time so far,
 * then "Writing out what you said" until the words arrive.
 *
 * The bars and the clock are moved by hand in an animation frame, never
 * through React state, so listening costs the page nothing (re-rendering on
 * every word is what used to freeze phones).
 */
const BARS = 5
// The middle bars rise most, like a voice meter.
const WEIGHT = [0.55, 0.8, 1, 0.8, 0.55]

export function DictationStatus({
  recording,
  transcribing,
  partial = '',
  getLevel,
  color = '#aaa59c',
  accent = '#ece9e2',
}: {
  recording: boolean
  transcribing: boolean
  /** The words so far, while they are being written out. */
  partial?: string
  getLevel: () => number
  color?: string
  accent?: string
}) {
  const bars = useRef<Array<HTMLSpanElement | null>>([])
  const clock = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!recording) return
    const started = Date.now()
    let smooth = 0
    let frame = 0
    const tick = () => {
      smooth = smooth * 0.7 + getLevel() * 0.3
      bars.current.forEach((el, i) => {
        if (!el) return
        const wobble = 0.85 + 0.15 * Math.sin(Date.now() / 140 + i * 1.7)
        el.style.transform = `scaleY(${Math.max(0.15, Math.min(1, smooth * WEIGHT[i] * wobble * 1.6))})`
      })
      if (clock.current) {
        const s = Math.floor((Date.now() - started) / 1000)
        clock.current.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [recording, getLevel])

  const label = { fontFamily: 'var(--font-geist-sans)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' as const, fontWeight: 600, color }

  return (
    <AnimatePresence mode="wait">
      {recording ? (
        <m.div
          key="listening"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
        >
          <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28 }}>
            {Array.from({ length: BARS }, (_, i) => (
              <span
                key={i}
                ref={(el) => { bars.current[i] = el }}
                style={{ width: 4, height: 28, borderRadius: 2, background: accent, transform: 'scaleY(0.15)', transition: 'transform 80ms linear' }}
              />
            ))}
          </div>
          <span style={label}>
            Listening · <span ref={clock}>0:00</span>
          </span>
          <span style={{ ...label, letterSpacing: 0, textTransform: 'none', fontWeight: 400, fontSize: 12, opacity: 0.8 }}>
            Take your time. Your words appear when you stop.
          </span>
        </m.div>
      ) : transcribing ? (
        <m.div
          key="writing"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%' }}
        >
          <span style={label}>Writing out what you said</span>
          {partial ? (
            <p style={{ margin: 0, width: '100%', fontFamily: 'var(--font-geist-sans)', fontSize: 16, fontWeight: 500, lineHeight: 1.65, color: accent, opacity: 0.75 }}>
              {partial}
              <m.span aria-hidden animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity }}> ▍</m.span>
            </p>
          ) : (
          <div aria-hidden style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 0.8, 0.55].map((w, i) => (
              <m.span
                key={i}
                style={{ display: 'block', height: 10, width: `${w * 100}%`, borderRadius: 5, background: accent }}
                animate={{ opacity: [0.08, 0.22, 0.08] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
              />
            ))}
          </div>
          )}
        </m.div>
      ) : null}
    </AnimatePresence>
  )
}
