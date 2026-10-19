'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tour } from '@/components/tour/tour'
import { markTourSeen, type TourProfile } from '@/lib/tour'

/**
 * A new account's first screen, once it is activated (after choosing a
 * password, or straight from Google): who they are, what their work is about,
 * then one slide handing them into the app, said for what they make, then
 * Home (each part of the app shows itself round the first time it is opened). Their themes become their Idea
 * Lab's. Until their answers are saved Home sends them back here, and the
 * questions cannot be skipped. Anyone else opens it from Settings, sees the
 * tour alone, and goes back to Home.
 */
export default function TourPage() {
  const router = useRouter()
  const [firstRun, setFirstRun] = useState<boolean | null>(null)
  const [profile, setProfile] = useState<TourProfile | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The save started when they answered; leaving waits for it, so Home finds their themes there.
  const saving = useRef<Promise<boolean> | null>(null)
  // What was last sent, so going back and forth without changing anything sends nothing.
  const sent = useRef({ answers: '' })
  const answers = useRef<{ who: TourProfile; themes: string[] } | null>(null)

  const save = useCallback(
    (who: TourProfile, themes: string[]) =>
      fetch('/api/onboarding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: themes, profile: who }) })
        .then((r) => r.json())
        .then((d) => !!d?.success)
        .catch(() => false),
    []
  )

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
    answers.current = { who, themes }
    const key = JSON.stringify({ labels: themes, profile: who })
    if (key !== sent.current.answers) {
      sent.current.answers = key
      saving.current = save(who, themes)
    }
  }, [save])

  // The last slide names usage analytics and carries their switch: `null` when it is
  // first shown (they have been told, and it stays on), then whatever they choose.
  const analytics = useCallback((on: boolean | null) => {
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(on === null ? { usage_analytics_told: true } : { usage_analytics: on }),
    }).catch(() => {})
  }, [])

  const leave = useCallback(async () => {
    markTourSeen()
    if (!saving.current) { router.replace('/home'); return }
    setLeaving(true)
    setError(null)
    // Home sends anyone whose answers are not saved straight back here, so leaving only
    // works once they are: one more try, then say so and stay.
    let saved = await saving.current
    if (!saved && answers.current) {
      saving.current = save(answers.current.who, answers.current.themes)
      saved = await saving.current
    }
    if (saved) { router.replace('/home'); return }
    setLeaving(false)
    setError('Your answers could not be saved. Check your connection and try again.')
  }, [router, save])

  return <Tour firstRun={firstRun} profile={profile} leaving={leaving} error={error} onAnswered={answered} onLeave={leave} onAnalytics={analytics} />
}
