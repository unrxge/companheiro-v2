'use client'

import { useEffect } from 'react'

/**
 * Keeps the screen from dimming and locking while `active` is true, using the
 * browser's Screen Wake Lock. The lock is dropped by the browser whenever the
 * page is hidden (another app, another tab), so it is asked for again each
 * time the page comes back. Where the browser has no wake lock, or refuses
 * (some do on a low battery), this does nothing and the device behaves as usual.
 */
export function useStayAwake(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let lock: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      if (cancelled || lock || document.visibilityState !== 'visible') return
      try {
        const next = await navigator.wakeLock.request('screen')
        if (cancelled) {
          void next.release().catch(() => {})
          return
        }
        lock = next
        next.addEventListener('release', () => {
          if (lock === next) lock = null
        })
      } catch {
        // Refused (battery saver, no permission): nothing to do but carry on.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release().catch(() => {})
      lock = null
    }
  }, [active])
}
