'use client'

import { useEffect, useRef } from 'react'

function localDateKey(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const FLUSH_INTERVAL_MS = 120_000

/**
 * Reports active (visible-tab) time on the page to /api/write/activity, so an
 * immersive writing session that never produced a check-in still shows up in
 * the Inner Weather widget instead of reading as a blank day.
 */
export function useWritingTimeTracker(active: boolean) {
  const visibleSinceRef = useRef<number | null>(null)
  const pendingSecondsRef = useRef(0)

  useEffect(() => {
    if (!active || typeof document === 'undefined') return

    const drain = () => {
      if (visibleSinceRef.current !== null) {
        const now = Date.now()
        pendingSecondsRef.current += (now - visibleSinceRef.current) / 1000
        visibleSinceRef.current = now
      }
    }

    const flush = (useBeacon: boolean) => {
      drain()
      const seconds = Math.round(pendingSecondsRef.current)
      pendingSecondsRef.current = 0
      if (seconds < 1) return
      const payload = JSON.stringify({ seconds, date: localDateKey() })
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon('/api/write/activity', new Blob([payload], { type: 'application/json' }))
      } else {
        fetch('/api/write/activity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true }).catch(() => {})
      }
    }

    if (document.visibilityState === 'visible') visibleSinceRef.current = Date.now()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        visibleSinceRef.current = Date.now()
      } else {
        flush(false)
        visibleSinceRef.current = null
      }
    }
    const onPageHide = () => flush(true)

    const interval = setInterval(() => flush(false), FLUSH_INTERVAL_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      flush(true)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
    }
  }, [active])
}
