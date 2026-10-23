'use client'

import ReflectPage from '@/app/reflect/page'
import { THEMES, cleanHeard, logFromHeard, nextTheme, parseReflectTurn, type Heard } from '@/lib/reflection'
import { META_DELIMITER } from '@/lib/stream-client'

// Speech and the model are faked; the order of questions, the press-once rule
// and skipping are the real code (lib/reflection.ts). Say something with
// window.__say('...') while "listening". Words containing "dunno" count as a
// non-answer, like "I don't know" would.
type Win = {
  __reflectMock?: boolean
  __logged?: unknown[]
  __say?: (text: string) => void
  __turns?: unknown[]
  webkitSpeechRecognition?: unknown
}

function installMock() {
  const w = window as unknown as Win
  if (w.__reflectMock) return
  w.__reflectMock = true
  w.__logged = []
  w.__turns = []

  type Recognition = { onstart?: () => void; onresult?: (e: unknown) => void; onend?: () => void }
  let active: Recognition | null = null
  class FakeRecognition implements Recognition {
    continuous = false; interimResults = false; lang = ''
    onstart?: () => void; onresult?: (e: unknown) => void; onerror?: () => void; onend?: () => void
    start() { active = this as Recognition; setTimeout(() => this.onstart?.(), 0) }
    stop() { setTimeout(() => { this.onend?.(); active = null }, 0) }
  }
  w.webkitSpeechRecognition = FakeRecognition
  ;(w as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition
  w.__say = (text: string) => {
    const r: unknown[] & { isFinal?: boolean } = [{ transcript: text }]
    r.isFinal = true
    active?.onresult?.({ resultIndex: 0, results: [r] })
  }

  const real = window.fetch.bind(window)
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const done = new URLSearchParams(location.search).get('done') === '1'
    const body = init?.body ? JSON.parse(String(init.body)) : {}

    if (url.includes('/api/read/node')) {
      return json({ success: true, piece: { id: 'node-1', project_id: 'demo', title: 'The kettle', reflection: done ? { id: 'r1', created_at: '2026-10-20T10:00:00Z' } : null } })
    }
    if (url.includes('/api/punctuate')) return json({ text: body.text })

    if (url.includes('/api/reflect/turn')) {
      w.__turns!.push(body)
      const progress = { phase: body.phase as number, followedUp: body.followedUp as number[], skipped: body.skipped as number[] }
      const said = [...body.messages].reverse().find((m: { role: string }) => m.role === 'user')?.content as string
      const heard: Heard = cleanHeard(body.heard)
      if (!/dunno/i.test(said)) {
        const key = progress.phase >= 1 ? THEMES[progress.phase - 1].key : 'opened'
        heard[key] = [heard[key], said].filter(Boolean).join(' ')
      }
      const asking = nextTheme(heard, progress).theme ?? 5
      const turn = parseReflectTurn({ heard, asking, reflection: `(mock) I heard: “${said.slice(0, 50)}”.`, question: '' }, progress)!
      const meta = { phase: turn.theme, done: turn.done, heard: turn.heard, followedUp: turn.followUp ? [...progress.followedUp, progress.phase] : progress.followedUp }
      return new Response(turn.say + META_DELIMITER + JSON.stringify(meta), { headers: { 'Content-Type': 'text/plain' } })
    }
    if (url.includes('/api/reflect/distill')) {
      return json({ log: logFromHeard(cleanHeard(body.heard)), written: true })
    }
    if (url.includes('/api/post-publication/log') && init?.method === 'POST') {
      w.__logged!.push(body)
      return json({ success: true })
    }
    if (url.includes('/api/')) return json({})
    return real(input, init)
  }
}

export function ReflectHarness() {
  if (typeof window !== 'undefined') installMock()
  return <ReflectPage />
}
