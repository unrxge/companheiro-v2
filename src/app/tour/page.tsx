'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tour } from '@/components/tour/tour'
import { markTourSeen, type TourProfile } from '@/lib/tour'

/**
 * A new account's first screen, once it is activated (after choosing a
 * password, or straight from Google): who they are, what their work is about,
 * then a short tour chosen for them, then Home. Their themes become their Idea
 * Lab's, which is what /welcome used to ask for. Anyone else opens it from
 * Settings, sees the tour alone, and goes back to Home.
 */
export default function TourPage() {
  const router = useRouter()
  const [firstRun, setFirstRun] = useState<boolean | null>(null)
  const [profile, setProfile] = useState<TourProfile | null>(null)
  const [leaving, setLeaving] = useState(false)
  // The save started when they answered; leaving waits for it, so Home finds their themes there.
  const saving = useRef<Promise<boolean> | null>(null)

  useEffect(() => {
    fetch('/api/onboarding')
      .then((r) => r.json())
      .then((d) => {
        setFirstRun(d?.onboarded === false)
        if (d?.profile) setProfile(d.profile)
      })
      .catch(() => setFirstRun(false))
  }, [])

  const answered = useCallback((who: TourProfile, themes: string[]) => {
    saving.current = fetch('/api/onboarding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: themes, profile: who }) })
      .then((r) => r.json())
      .then((d) => !!d?.success)
      .catch(() => false)
  }, [])

  const leave = useCallback(async () => {
    markTourSeen()
    if (!saving.current) { router.replace('/home'); return }
    setLeaving(true)
    // If their themes could not be saved, /welcome asks for them the old way.
    router.replace((await saving.current) ? '/home' : '/welcome')
  }, [router])

  return <Tour firstRun={firstRun} profile={profile} leaving={leaving} onAnswered={answered} onLeave={leave} />
}
