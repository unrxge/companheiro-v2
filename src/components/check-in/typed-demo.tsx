'use client'

// The walk's first example, typed: the box appears empty, the words are
// typed into it a letter at a time with a caret, Send is pressed (seen), and
// the box empties as the words go up into the conversation (`onSent`).
// Shown, never typed into.

import { useEffect, useState } from 'react'
import { motion as m, useReducedMotion } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { PrimaryButton } from '@/components/ui/buttons'
import { TYPED } from '@/lib/check-in-tour'

export function TypedDemo({ text, onSent }: { text: string; onSent: () => void }) {
  const { t } = useTheme()
  const reduce = useReducedMotion() ?? false
  const [shown, setShown] = useState(reduce ? text.length : 0)
  const [pressing, setPressing] = useState(false)

  useEffect(() => {
    if (reduce) { const id = window.setTimeout(onSent, 400); return () => clearTimeout(id) }
    const timers: number[] = []
    for (let i = 1; i <= text.length; i++) timers.push(window.setTimeout(() => setShown(i), TYPED.leadMs + i * TYPED.charMs))
    const typedAt = TYPED.leadMs + text.length * TYPED.charMs
    timers.push(window.setTimeout(() => setPressing(true), typedAt + 250))
    timers.push(window.setTimeout(onSent, typedAt + TYPED.sendMs))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, reduce])

  const done = shown >= text.length
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        aria-label="An example, typed"
        style={{
          width: '100%', boxSizing: 'border-box', minHeight: 84, backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`,
          borderRadius: 12, padding: '12px 14px', fontFamily: 'var(--font-geist-sans)', fontSize: 16, fontWeight: 500,
          color: t.textPrimary, lineHeight: 1.65,
        }}
      >
        {shown === 0 ? <span style={{ color: t.textMuted }}>Begin typing…</span> : text.slice(0, shown)}
        {!done && <m.span aria-hidden animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.9, repeat: Infinity }} style={{ display: 'inline-block', width: 2, height: '1.1em', marginLeft: 1, verticalAlign: 'text-bottom', background: t.textPrimary }} />}
      </div>
      <m.div animate={{ scale: pressing ? 0.96 : 1, opacity: done ? 1 : 0.45 }} transition={{ duration: 0.18 }}>
        <PrimaryButton full size="lg">Send</PrimaryButton>
      </m.div>
    </div>
  )
}
