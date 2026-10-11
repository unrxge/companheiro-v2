'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Tour } from '@/components/tour/tour'
import { GENERAL_QUESTIONS, markTourSeen, type TourProfile } from '@/lib/tour'

/**
 * A new account's first screen, once it is activated (after choosing a
 * password, or straight from Google): who they are, what their work is about,
 * then a short tour chosen for them, then Home. Their themes become their Idea
 * Lab's. Until their answers are saved Home sends them back here, and the
 * questions cannot be skipped. Anyone else opens it from Settings, sees the
 * tour alone, and goes back to Home.
 */
export default function TourPage() {
  const router = useRouter()
  const [firstRun, setFirstRun] = useState<boolean | null>(null)
  const [profile, setProfile] = useState<TourProfile | null>(null)
  const [questions, setQuestions] = useState<Record<string, string[]> | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The save started when they answered; leaving waits for it, so Home finds their themes there.
  const saving = useRef<Promise<boolean> | null>(null)
  // What was last sent, so going back and forth without changing anything sends nothing.
  const sent = useRef({ answers: '', themes: '' })
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
    const post = (url: string, method: string, body: unknown) => fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
    answers.current = { who, themes }
    const key = JSON.stringify({ labels: themes, profile: who })
    if (key !== sent.current.answers) {
      sent.current.answers = key
      saving.current = save(who, themes)
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
  }, [save])

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

  return <Tour firstRun={firstRun} profile={profile} questions={questions} leaving={leaving} error={error} onAnswered={answered} onLeave={leave} />
}
