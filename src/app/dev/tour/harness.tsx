'use client'

import { useState } from 'react'
import { Tour } from '@/components/tour/tour'
import { GENERAL_QUESTIONS } from '@/lib/tour'

// ?as=tour shows it the way Settings opens it: no questions, the default tour.
// Signed in, the Idea slide's questions are written for the themes typed here,
// as on the real page; otherwise it gets the general ones the real page falls
// back to. Nothing is saved.
export function TourHarness() {
  const later = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('as') === 'tour'
  const [questions, setQuestions] = useState<Record<string, string[]> | null>(null)
  return (
    <Tour
      firstRun={!later}
      questions={questions}
      onAnswered={(who, themes) => {
        setQuestions(null)
        const general = Object.fromEntries(themes.map((t) => [t, GENERAL_QUESTIONS]))
        fetch('/api/onboarding/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ themes, practices: who.practices, other: who.other }) })
          .then((r) => r.json())
          .then((d) => setQuestions({ ...general, ...(d?.questions ?? {}) }))
          .catch(() => setQuestions(general))
      }}
      onLeave={() => window.alert('Would go on to Home')}
    />
  )
}
