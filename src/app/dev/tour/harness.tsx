'use client'

import { Tour } from '@/components/tour/tour'

// ?as=tour shows it the way Settings opens it: no questions, the default tour.
export function TourHarness() {
  const later = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('as') === 'tour'
  return <Tour firstRun={!later} onAnswered={(who, themes) => console.log('answered', who, themes)} onLeave={() => window.alert('Would go on to Home')} />
}
