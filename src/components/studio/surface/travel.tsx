'use client'

// studio/src/components/surface/travel.tsx — moving between the three levels.
//
//   level 3  the shelf     every project, lying on the desk
//   level 2  the board     one project, its pieces, the threads under them
//   level 1  the writing   one piece, its parts, the words
//
// Going down a level should feel like going *into* something, so the level you
// are leaving rushes toward the thing you clicked and the next one opens out of
// it. Going up reverses that exactly. Nothing about this is decorative: it is
// the only thing that tells you which way you just moved.

import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { motion as m } from 'motion/react'

export type Heading = 'in' | 'out'

/** Handed from the level that is leaving to the level that arrives. They are
 *  separate route components, so a module variable is the only thing they share. */
let handoff: Heading = 'in'

const LEAVE_MS = 230
const ARRIVE_MS = 340

export type Go = (href: string, heading: Heading, from?: HTMLElement | null) => void

const TravelContext = createContext<Go>(() => {})

/** `const go = useTravel()` then `go('/p/123', 'in', cardEl)`. */
export function useTravel(): Go {
  return useContext(TravelContext)
}

function calm(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Where on screen the thing you clicked was, as a transform origin. */
function originOf(el: HTMLElement | null | undefined): string {
  if (!el || typeof window === 'undefined') return '50% 50%'
  const box = el.getBoundingClientRect()
  const x = ((box.left + box.width / 2) / window.innerWidth) * 100
  const y = ((box.top + box.height / 2) / window.innerHeight) * 100
  return `${x.toFixed(1)}% ${y.toFixed(1)}%`
}

/**
 * Wraps one level. Plays the arrival, hands out `go`, and plays the departure.
 *
 * The transform is dropped the moment the arrival finishes, because a live
 * transform makes this element the containing block for everything fixed
 * inside it — and the rail and its drawer are fixed.
 */
export function Level({ children }: { children: ReactNode }) {
  const router = useRouter()
  const arrived = useRef(handoff)
  const [flying, setFlying] = useState(true)
  const [leaving, setLeaving] = useState<{ heading: Heading; origin: string } | null>(null)

  useEffect(() => {
    if (!calm()) return
    setFlying(false)
  }, [])

  const go = useCallback<Go>((href, heading, from) => {
    handoff = heading
    if (calm()) { router.push(href); return }
    setLeaving({ heading, origin: originOf(from) })
    window.setTimeout(() => router.push(href), LEAVE_MS)
  }, [router])

  const still = { opacity: 1, scale: 1 }
  const entering = arrived.current === 'in' ? { opacity: 0, scale: 0.93 } : { opacity: 0, scale: 1.08 }
  const going = leaving
    ? (leaving.heading === 'in' ? { opacity: 0, scale: 1.32 } : { opacity: 0, scale: 0.9 })
    : still

  const animating = flying || leaving !== null

  return (
    <TravelContext.Provider value={go}>
      <m.div
        initial={calm() ? still : entering}
        animate={going}
        transition={{
          duration: (leaving ? LEAVE_MS : ARRIVE_MS) / 1000,
          ease: leaving ? [0.6, 0, 0.9, 0.4] : [0.16, 1, 0.3, 1],
        }}
        onAnimationComplete={() => { if (!leaving) setFlying(false) }}
        style={{
          transformOrigin: leaving?.origin ?? '50% 50%',
          // Only while something is actually moving; see the note above.
          willChange: animating ? 'transform, opacity' : undefined,
          transform: animating ? undefined : 'none',
          minHeight: '100dvh',
        }}
      >
        {children}
      </m.div>
    </TravelContext.Provider>
  )
}
