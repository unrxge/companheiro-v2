'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tour } from '@/components/tour/tour'
import { GENERAL_QUESTIONS, markTourSeen, type TourProfile } from '@/lib/tour'

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
  const [questions, setQuestions] = useState<Record<string, string[]> | null>(null)
  const [leaving, setLeaving] = useState(false)
  // The save started when they answered; leaving waits for it, so Home finds their themes there.
  const saving = useRef<Promise<boolean> | null>(null)
  // What was last sent, so going back and forth without changing anything sends nothing.
  const sent = useRef({ answers: '', themes: '' })

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
    const post = (url: string, method: string, body: unknown) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
    const answers = JSON.stringify({ labels: themes, profile: who })
    if (answers !== sent.current.answers) {
      sent.current.answers = answers
      saving.current = post('/api/onboarding', 'PUT', { labels: themes, profile: who }).then((d) => !!d?.success).catch(() => false)
    }
    const asking = JSON.stringify(themes)
    if (asking !== sent.current.themes) {
      sent.current.themes = asking
      setQuestions(null)
      // Questions for the Idea slide, written from their themes. If that fails, ones about making in general.
      const general = Object.fromEntries(themes.map((t) => [t, GENERAL_QUESTIONS]))
      post('/api/onboarding/questions', 'POST', { themes, practices: who.practices, other: who.other })
        .then((d) => { if (sent.current.themes === asking) setQuestions({ ...general, ...(d?.questions ?? {}) }) })
        .catch(() => { if (sent.current.themes === asking) setQuestions(general) })
    }
  }, [])

  const leave = useCallback(async () => {
    markTourSeen()
    if (!saving.current) { router.replace('/home'); return }
    setLeaving(true)
    // If their themes could not be saved, /welcome asks for them the old way.
    router.replace((await saving.current) ? '/home' : '/welcome')
  }, [router])

  return <Tour firstRun={firstRun} profile={profile} questions={questions} leaving={leaving} onAnswered={answered} onLeave={leave} />
}
