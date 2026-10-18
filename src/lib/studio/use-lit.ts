'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WebFocus, WebKind } from '@/lib/studio/web-focus'

// ── asking what this one is connected to ────────────────────────────────────
//
// With a mouse the question is asked by resting on something, and unasked by
// moving away: no press, nothing to undo, no state to leave behind.
//
// Resting means resting. A pointer crossing the board lights nothing, however
// many cards it passes over: it has to stay on one for a moment first. Without
// that, moving about the project — or dragging the ground to reach the cards at
// the far end — set off a flicker of lit and dimmed webs with every card
// crossed. Leaving is given a short grace for the same reason, so a pointer
// slipping across the gap between two blocks does not drop the answer and
// bring it back.
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
/** How long a mouse has to stay still on a block before it is a question. */
const DWELL_MS = 380
/** How far a resting mouse may drift and still be resting. */
const DRIFT = 5
/** How long the answer outlasts the pointer leaving, for gaps and edges. */
const LEAVE_MS = 140

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
  /** Lights this from outside the gesture (the example tour), or nothing. */
  show: (focus: WebFocus | null) => void
}

export function useLit(enabled = true): Lit {
  const [focus, setFocus] = useState<WebFocus | null>(null)
  const timer = useRef<number | null>(null)
  const from = useRef<{ x: number; y: number } | null>(null)
  /** A mouse on a block, waiting to have rested long enough. */
  const dwell = useRef<number | null>(null)
  const dwellAt = useRef<{ x: number; y: number } | null>(null)
  /** The answer, waiting out its grace after the pointer left. */
  const leaving = useRef<number | null>(null)
  /** A hold just answered the question; the tap that ends it means nothing else. */
  const held = useRef(false)

  const stopTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
    from.current = null
  }, [])

  const stopDwell = useCallback(() => {
    if (dwell.current !== null) window.clearTimeout(dwell.current)
    dwell.current = null
    dwellAt.current = null
  }, [])

  const stopLeaving = useCallback(() => {
    if (leaving.current !== null) window.clearTimeout(leaving.current)
    leaving.current = null
  }, [])

  const clear = useCallback(() => {
    stopTimer()
    stopDwell()
    stopLeaving()
    setFocus(null)
  }, [stopTimer, stopDwell, stopLeaving])

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

  useEffect(() => () => { stopTimer(); stopDwell(); stopLeaving() }, [stopTimer, stopDwell, stopLeaving])

  const bind = useCallback((kind: WebKind, id: string) => ({
    'data-lit': id,
    onPointerEnter: (e: React.PointerEvent) => {
      if (!enabled || e.pointerType !== 'mouse') return
      // A button held down is a drag — of the ground, to reach the far end of
      // the project, or of a card — and nobody is asking anything mid-drag.
      if (e.buttons !== 0) return
      stopLeaving()
      stopDwell()
      dwellAt.current = { x: e.clientX, y: e.clientY }
      dwell.current = window.setTimeout(() => {
        dwell.current = null
        dwellAt.current = null
        setFocus({ kind, id })
      }, DWELL_MS)
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (!enabled || e.pointerType !== 'mouse') return
      // Not yet rested on: nothing to take back.
      stopDwell()
      stopLeaving()
      leaving.current = window.setTimeout(() => {
        leaving.current = null
        setFocus((cur) => (cur && cur.kind === kind && cur.id === id ? null : cur))
      }, LEAVE_MS)
    },
    onPointerDown: (e: React.PointerEvent) => {
      held.current = false
      if (e.pointerType === 'mouse') {
        // Pressing is acting on the block, not asking about it.
        if (enabled) clear()
        return
      }
      if (!enabled) return
      from.current = { x: e.clientX, y: e.clientY }
      stopTimer()
      timer.current = window.setTimeout(() => {
        timer.current = null
        held.current = true
        setFocus({ kind, id })
      }, HOLD_MS)
    },
    onPointerMove: (e: React.PointerEvent) => {
      // A mouse still moving about the block has not come to rest on it: the
      // wait starts again from where it settles.
      if (e.pointerType === 'mouse' && dwell.current !== null && dwellAt.current) {
        const at = dwellAt.current
        if (Math.abs(e.clientX - at.x) > DRIFT || Math.abs(e.clientY - at.y) > DRIFT) {
          window.clearTimeout(dwell.current)
          dwellAt.current = { x: e.clientX, y: e.clientY }
          dwell.current = window.setTimeout(() => {
            dwell.current = null
            dwellAt.current = null
            setFocus({ kind, id })
          }, DWELL_MS)
        }
        return
      }
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
  }), [enabled, stopTimer, stopDwell, stopLeaving, clear])

  const show = useCallback((next: WebFocus | null) => {
    stopTimer()
    stopDwell()
    stopLeaving()
    setFocus(next)
  }, [stopTimer, stopDwell, stopLeaving])

  return { focus, bind, clear, show }
}
