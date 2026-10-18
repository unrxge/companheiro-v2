'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WebFocus, WebKind } from '@/lib/studio/web-focus'

// ── asking what this one is connected to ────────────────────────────────────
//
// With a mouse the question is asked by resting on something, and unasked by
// moving away: no press, nothing to undo, no state to leave behind.
//
// With a finger there is no resting. A tap already means something on every
// block here — it opens the piece, it opens the thread — so the question is
// asked by holding instead, which collides with nothing, and answered until
// the next tap anywhere else. The tap that ends the hold is swallowed, or
// holding a card would light its web and then walk straight into the piece.

/** How long a finger stays down before it is a question rather than a tap. */
const HOLD_MS = 320
/** A finger that travels further than this was going somewhere, not asking. */
const SLOP = 8

export interface Lit {
  /** What is being asked about, or null. */
  focus: WebFocus | null
  /** Props for the thing itself: spread onto its outermost element. */
  bind: (kind: WebKind, id: string) => {
    'data-lit': string
    onPointerEnter: (e: React.PointerEvent) => void
    onPointerLeave: (e: React.PointerEvent) => void
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
    onPointerCancel: (e: React.PointerEvent) => void
    onClickCapture: (e: React.MouseEvent) => void
  }
  clear: () => void
}

export function useLit(enabled = true): Lit {
  const [focus, setFocus] = useState<WebFocus | null>(null)
  const timer = useRef<number | null>(null)
  const from = useRef<{ x: number; y: number } | null>(null)
  /** A hold just answered the question; the tap that ends it means nothing else. */
  const held = useRef(false)

  const stopTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    from.current = null
  }, [])

  const clear = useCallback(() => {
    stopTimer()
    setFocus(null)
  }, [stopTimer])

  useEffect(() => {
    if (!enabled) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') clear() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [clear, enabled])

  // A tap anywhere that is not one of these blocks puts the board back.
  useEffect(() => {
    if (!enabled || !focus) return
    const away = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      const on = (e.target as HTMLElement | null)?.closest?.('[data-lit]')
      if (!on) clear()
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [clear, enabled, focus])

  useEffect(() => stopTimer, [stopTimer])

  const bind = useCallback((kind: WebKind, id: string) => ({
    'data-lit': id,
    onPointerEnter: (e: React.PointerEvent) => {
      if (!enabled || e.pointerType !== 'mouse') return
      setFocus({ kind, id })
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (!enabled || e.pointerType !== 'mouse') return
      setFocus((cur) => (cur && cur.kind === kind && cur.id === id ? null : cur))
    },
    onPointerDown: (e: React.PointerEvent) => {
      held.current = false
      if (!enabled || e.pointerType === 'mouse') return
      from.current = { x: e.clientX, y: e.clientY }
      stopTimer()
      timer.current = window.setTimeout(() => {
        timer.current = null
        held.current = true
        setFocus({ kind, id })
      }, HOLD_MS)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (timer.current === null || !from.current) return
      if (Math.abs(e.clientX - from.current.x) > SLOP || Math.abs(e.clientY - from.current.y) > SLOP) stopTimer()
    },
    onPointerUp: () => {
      stopTimer()
      // The click that ends a hold comes immediately after this. Past that
      // moment it never will, and a hold nobody tapped out of must not sit
      // there waiting to swallow something else.
      if (held.current) window.setTimeout(() => { held.current = false }, 400)
    },
    onPointerCancel: () => { stopTimer(); held.current = false },
    onClickCapture: (e: React.MouseEvent) => {
      if (!held.current) return
      held.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }), [enabled, stopTimer])

  return { focus, bind, clear }
}
