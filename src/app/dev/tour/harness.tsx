'use client'

import { Tour } from '@/components/tour/tour'
import { TourBackdrop } from '@/components/tour/backdrop'

export function TourHarness() {
  return (
    <>
      <TourBackdrop />
      <Tour firstRun onLeave={() => window.alert('Would go on to /welcome')} />
    </>
  )
}
