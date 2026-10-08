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

interface UndoStep {
  id: number
  /** Named as the thing that happened, for "undo the move". */
  label: string
  /** Puts that one change back. Runs with recording held off. */
  back: () => void
  /** The thing it is about, so every step about it can be dropped at once
   *  when that thing stops existing. */
  subject?: string
}

/** How many steps back it is possible to go. */
export const UNDO_DEPTH = 50

export interface Undo {
  /** Keeps the way back from something about to happen, and hands back a way
   *  to drop it again — for a step that stops being possible later on, like a
   *  removal once it has actually been sent. */
  remember: (label: string, back: () => void, subject?: string) => () => void
  /** Takes the last step back. Does nothing when there is nothing to undo. */
  undo: () => void
  /** Drops every step about this thing, for when it stops existing: a step
   *  that would quietly do nothing is worse than no step at all. */
  forgetAbout: (subject: string) => void
  /** What undoing would put back now, or null. */
  next: string | null
}

export function useUndo(depth = UNDO_DEPTH): Undo {
  const steps = useRef<UndoStep[]>([])
  const made = useRef(0)
  // Undoing is itself a change, and would otherwise be remembered as one more
  // step back to itself. While a step runs, nothing is recorded.
  const running = useRef(false)
  const [next, setNext] = useState<string | null>(null)

  /** The label of whatever is on top now, which is what the button says. */
  const retop = useCallback(() => {
    setNext(steps.current[steps.current.length - 1]?.label ?? null)
  }, [])

  const remember = useCallback((label: string, back: () => void, subject?: string) => {
    if (running.current) return () => {}
    const id = (made.current += 1)
    steps.current = [...steps.current, { id, label, back, subject }].slice(-depth)
    setNext(label)
    return () => {
      steps.current = steps.current.filter((step) => step.id !== id)
      retop()
    }
  }, [depth, retop])

  const undo = useCallback(() => {
    const step = steps.current[steps.current.length - 1]
    if (!step) return
    steps.current = steps.current.slice(0, -1)
    retop()
    running.current = true
    try {
      step.back()
    } finally {
      // After the call, not in it: an undo whose own change lands in a later
      // tick (a save answering, say) must not be recorded either.
      window.setTimeout(() => { running.current = false }, 0)
    }
  }, [retop])

  const forgetAbout = useCallback((subject: string) => {
    const left = steps.current.filter((step) => step.subject !== subject)
    if (left.length === steps.current.length) return
    steps.current = left
    retop()
  }, [retop])

  return { remember, undo, next, forgetAbout }
}
