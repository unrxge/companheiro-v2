'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ── a removal that has not happened yet ─────────────────────────────────────
//
// Deleting cannot be undone: the row is gone, and putting a copy of it back
// under a new identity only looks like the thing returning. So the delete is
// not sent at once. What is removed is hidden straight away and the request
// waits a few seconds, long enough to notice the slip. Taking it back in that
// time sends nothing at all — nothing happened to undo.
//
// Leaving the page sends everything still waiting. Closing the tab inside the
// few seconds does not, and the thing is simply still there next time: it
// fails towards keeping work, which is the right way for it to fail.

/** How long there is to take a removal back. */
export const TAKE_BACK_MS = 9000

export interface Deferred {
  /** What is being treated as gone. */
  hidden: Set<string>
  /** Hides it now and sends the removal after the wait. */
  defer: (id: string, send: () => void) => void
  /** Puts it back. Nothing was ever sent. */
  cancel: (id: string) => void
}

export function useDeferred(wait = TAKE_BACK_MS): Deferred {
  const timers = useRef(new Map<string, number>())
  const sends = useRef(new Map<string, () => void>())
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())

  const settle = useCallback((id: string) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    timers.current.delete(id)
    sends.current.delete(id)
    setHidden((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const defer = useCallback((id: string, send: () => void) => {
    setHidden((prev) => new Set(prev).add(id))
    sends.current.set(id, send)
    timers.current.set(id, window.setTimeout(() => {
      // Off the books before the request goes, so settling cannot put a thing
      // back on the board that the server is already deleting.
      timers.current.delete(id)
      sends.current.delete(id)
      setHidden((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      send()
    }, wait))
  }, [wait])

  const cancel = useCallback((id: string) => {
    if (!sends.current.has(id)) return
    settle(id)
  }, [settle])

  // Leaving sends what is still waiting: the board is gone, and with it any
  // way of taking it back.
  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer)
    const waiting = [...sends.current.values()]
    timers.current.clear()
    sends.current.clear()
    for (const send of waiting) send()
  }, [])

  return { hidden, defer, cancel }
}
