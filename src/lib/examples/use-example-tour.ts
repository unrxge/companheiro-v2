'use client'

import { useCallback, useEffect, useState } from 'react'

// Whether the walk round an example is due: once, the first example opened.
// The account remembers it (GET/POST /api/examples/tour) so it is not played
// again on another device; the browser remembers it too, so it is not even
// asked about twice, and so a visitor with no account (an example opened from
// a shared link) is not walked round on every visit. `?tour=1` plays it again,
// for looking at it.

/** The canvas's walk, and the writing page's: each played once. */
export type TourWhich = 'canvas' | 'piece' | 'checkin' | 'home' | 'idealab' | 'portrait'
const SEEN: Record<TourWhich, string> = {
  canvas: 'companheiro.example-tour.seen',
  piece: 'companheiro.example-piece-tour.seen',
  checkin: 'companheiro.check-in-tour.seen',
  home: 'companheiro.home-tour.seen',
  idealab: 'companheiro.idea-lab-tour.seen',
  portrait: 'companheiro.portrait-tour.seen',
}
/** What plays a walk again in the preview: ?tour= for the canvas's, ?piecetour= for the writing page's. */
const FORCE: Record<TourWhich, string> = { canvas: 'tour', piece: 'piecetour', checkin: 'tour', home: 'tour', idealab: 'tour', portrait: 'tour' }

const seenHere = (which: TourWhich) => {
  try { return !!window.localStorage.getItem(SEEN[which]) } catch { return false }
}

export interface ExampleTourDue {
  /** Due now, with what the person said they make; null while not (or not yet known). */
  due: { practices: string[] } | null
  /** It has started: it will not be played again. */
  markSeen: () => void
}

export function useExampleTour(ready: boolean, which: TourWhich = 'canvas'): ExampleTourDue {
  const [due, setDue] = useState<{ practices: string[] } | null>(null)

  useEffect(() => {
    if (!ready) return
    const forced = !!new URLSearchParams(window.location.search).get(FORCE[which])
    if (!forced && seenHere(which)) return
    let live = true
    fetch('/api/examples/tour', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: { seen?: boolean; pieceSeen?: boolean; checkInSeen?: boolean; pageSeen?: Record<string, boolean>; practices?: unknown }) => {
        if (!live) return
        const seen = which === 'piece' ? d.pieceSeen : which === 'checkin' ? d.checkInSeen : which === 'canvas' ? d.seen : d.pageSeen?.[which] ?? true
        if (seen && !forced) {
          try { window.localStorage.setItem(SEEN[which], '1') } catch { /* fine */ }
          return
        }
        setDue({ practices: Array.isArray(d.practices) ? d.practices.map(String) : [] })
      })
      .catch(() => { /* not knowing is not a reason to play it */ })
    return () => { live = false }
  }, [ready, which])

  const markSeen = useCallback(() => {
    try { window.localStorage.setItem(SEEN[which], new Date().toISOString()) } catch { /* fine */ }
    fetch('/api/examples/tour', {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ which }),
    }).catch(() => {})
  }, [which])

  return { due, markSeen }
}
