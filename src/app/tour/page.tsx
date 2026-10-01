'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tour } from '@/components/tour/tour'
import { markTourSeen } from '@/lib/tour'

/**
 * How the app works, in six slides. A new account lands here once it is
 * activated (after choosing a password, or straight from Google) and goes on
 * to /welcome; anyone else opens it from Settings and goes back to /home.
 */
export default function TourPage() {
  const router = useRouter()
  const [firstRun, setFirstRun] = useState(false)

  useEffect(() => {
    fetch('/api/onboarding')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.onboarded === false) setFirstRun(true)
      })
      .catch(() => {})
  }, [])

  const leave = useCallback(() => {
    markTourSeen()
    router.replace(firstRun ? '/welcome' : '/home')
  }, [router, firstRun])

  return <Tour firstRun={firstRun} onLeave={leave} />
}
