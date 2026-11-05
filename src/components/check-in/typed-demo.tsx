'use client'

// The walk's first example. Typed: the box appears empty and the words are
// typed into it a letter at a time with a caret, and it stops there, Send
// waiting. Sending (the next step): the words are already in the box, Send is
// pressed (seen) and the box empties as they go up into the conversation
// (`onSent`). Shown, never typed into.

import { useEffect, useState } from 'react'
import { motion as m, useReducedMotion } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { PrimaryButton } from '@/components/ui/buttons'
import { TYPED } from '@/lib/check-in-tour'

export function TypedDemo({ text, onSent, send = false }: { text: string; onSent: () => void; /** Already typed: press Send and let the words go. */ send?: boolean }) {
  const { t } = useTheme()
  const reduce = useReducedMotion() ?? false
  const [shown, setShown] = useState(reduce || send ? text.length : 0)
  const [pressing, setPressing] = useState(false)

  useEffect(() => {
    if (send) {
      const timers = [
        window.setTimeout(() => setPressing(true), reduce ? 100 : TYPED.pauseMs),
        window.setTimeout(onSent, reduce ? 300 : TYPED.pauseMs + TYPED.sendMs),
      ]
      return () => timers.forEach(clearTimeout)
    }
    if (reduce) return
    const timers: number[] = []
    for (let i = 1; i <= text.length; i++) timers.push(window.setTimeout(() => setShown(i), TYPED.leadMs + i * TYPED.charMs))
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
