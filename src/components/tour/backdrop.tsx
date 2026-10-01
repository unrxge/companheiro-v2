'use client'

import { useEffect, useState } from 'react'
import { HomeView } from '@/components/home/home-view'

/**
 * What the tour's card sits on, from 1024px up: the real Home screen, out of
 * reach (inert) and blurred by the tour's own overlay. Nothing on a phone,
 * where the tour is a full page and Home would only be loading unseen.
 */
export function TourBackdrop() {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    setWide(mq.matches)
    const on = (e: MediaQueryListEvent) => setWide(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  if (!wide) return null
  return (
    <div inert aria-hidden>
      <HomeView backdrop />
    </div>
  )
}
