'use client'

import { Tour } from '@/components/tour/tour'

export function TourHarness() {
  return <Tour firstRun onLeave={() => window.alert('Would go on to /welcome')} />
}
