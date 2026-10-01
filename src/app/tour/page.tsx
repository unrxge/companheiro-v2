'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tour } from '@/components/tour/tour'
import { TourBackdrop } from '@/components/tour/backdrop'
import { markTourSeen } from '@/lib/tour'

/**
 * How the app works, a slide per part. A new account lands here once it is
 * activated (after choosing a password, or straight from Google) and goes on
 * to /welcome; anyone else opens it from Settings and goes back to /home.
 * On a desktop it is a card over the Home screen; on a phone, its own page.
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

  return (
    <>
      <TourBackdrop />
      <Tour firstRun={firstRun} onLeave={leave} />
    </>
  )
}
