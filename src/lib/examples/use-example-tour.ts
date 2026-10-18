'use client'

import { useCallback, useEffect, useState } from 'react'

// Whether the walk round an example is due: once, the first example opened.
// The account remembers it (GET/POST /api/examples/tour) so it is not played
// again on another device; the browser remembers it too, so it is not even
// asked about twice, and so a visitor with no account (an example opened from
// a shared link) is not walked round on every visit. `?tour=1` plays it again,
// for looking at it.

const SEEN = 'companheiro.example-tour.seen'

const seenHere = () => {
  try { return !!window.localStorage.getItem(SEEN) } catch { return false }
}

export interface ExampleTourDue {
  /** Due now, with what the person said they make; null while not (or not yet known). */
  due: { practices: string[] } | null
  /** It has started: it will not be played again. */
  markSeen: () => void
}

export function useExampleTour(ready: boolean): ExampleTourDue {
  const [due, setDue] = useState<{ practices: string[] } | null>(null)

  useEffect(() => {
    if (!ready) return
    const forced = new URLSearchParams(window.location.search).get('tour') === '1'
    if (!forced && seenHere()) return
    let live = true
    fetch('/api/examples/tour', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: { seen?: boolean; practices?: unknown }) => {
        if (!live) return
        if (d.seen && !forced) {
          try { window.localStorage.setItem(SEEN, '1') } catch { /* fine */ }
          return
        }
        setDue({ practices: Array.isArray(d.practices) ? d.practices.map(String) : [] })
      })
      .catch(() => { /* not knowing is not a reason to play it */ })
    return () => { live = false }
  }, [ready])

  const markSeen = useCallback(() => {
    try { window.localStorage.setItem(SEEN, new Date().toISOString()) } catch { /* fine */ }
    fetch('/api/examples/tour', { method: 'POST', credentials: 'same-origin', keepalive: true }).catch(() => {})
  }, [])

  return { due, markSeen }
}
