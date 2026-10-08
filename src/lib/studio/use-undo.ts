'use client'

import { useCallback, useRef, useState } from 'react'

// ── taking one step back ────────────────────────────────────────────────────
//
// A canvas is a place where things are moved, joined and let go of by hand,
// and a hand slips. This keeps the way back from each of those: not a copy of
// the board at every moment, but one function per step that puts the one thing
// it changed back as it was.
//
// Only what can be put back exactly is kept. Deleting is not in here: a deleted
// row cannot be made again with the same identity, and an undo that quietly
// makes a near-enough copy is worse than no undo at all.

export interface UndoStep {
  /** Named as the thing that happened, for "undo the move". */
  label: string
  /** Puts that one change back. Runs with recording held off. */
  back: () => void
}

/** How many steps back it is possible to go. */
export const UNDO_DEPTH = 50

export interface Undo {
  /** Keeps the way back from something about to happen. */
  remember: (label: string, back: () => void) => void
  /** Takes the last step back. Does nothing when there is nothing to undo. */
  undo: () => void
  /** What undoing would put back now, or null. */
  next: string | null
}

export function useUndo(depth = UNDO_DEPTH): Undo {
  const steps = useRef<UndoStep[]>([])
  // Undoing is itself a change, and would otherwise be remembered as one more
  // step back to itself. While a step runs, nothing is recorded.
  const running = useRef(false)
  const [next, setNext] = useState<string | null>(null)

  const remember = useCallback((label: string, back: () => void) => {
    if (running.current) return
    steps.current = [...steps.current, { label, back }].slice(-depth)
    setNext(label)
  }, [depth])

  const undo = useCallback(() => {
    const step = steps.current[steps.current.length - 1]
    if (!step) return
    steps.current = steps.current.slice(0, -1)
    setNext(steps.current[steps.current.length - 1]?.label ?? null)
    running.current = true
    try {
      step.back()
    } finally {
      // After the call, not in it: an undo whose own change lands in a later
      // tick (a save answering, say) must not be recorded either.
      window.setTimeout(() => { running.current = false }, 0)
    }
  }, [])

  return { remember, undo, next }
}
