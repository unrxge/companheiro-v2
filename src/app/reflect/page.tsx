'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useDictation } from '@/lib/use-dictation'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { GhostButton, PrimaryButton, QuietButton } from '@/components/ui/buttons'
import { MicButton } from '@/components/ui/mic-button'
import { Thread, type ThreadMessage } from '@/components/conversation/thread'
import { ReflectionLogView } from '@/components/widgets/reflection-log'
import { JourneyNavNode } from '@/components/widgets'
import { readTextStream } from '@/lib/stream-client'
import { shell, type as typeRoles } from '@/lib/design-tokens'
import { Working, WorkingDots } from '@/components/ui/working'
import {
  REFLECT_CORRECTION_ASK, THEMES, emptyHeard, emptyLog, hasAnyLog, logFromHeard, nextTheme, reflectOpening, toLogBody,
  type Heard, type ReflectionLog,
} from '@/lib/reflection'

type Stage = 'talking' | 'writing' | 'review' | 'saving'

interface Saved {
  messages: ThreadMessage[]
  heard: Heard
  phase: number
  followedUp: number[]
  skipped: number[]
  stage: Stage
  log: ReflectionLog | null
}

interface TurnMeta { phase: number; done: boolean; heard: Heard; followedUp: number[] }

const saveKey = (nodeId: string) => `reflect:${nodeId}`
/** After the microphone stops, the last words are still being punctuated for a moment. */
const SETTLE_MS = 1800

/**
 * Looking back on a finished piece: the last stage. A short spoken
 * conversation (dictation only), the companion saying back what it heard and
 * asking the next thing, until four things are covered or skipped; then what
 * was said is written up as the reflection log, shown, and kept. Keeping it
 * finishes the piece, once. Nothing here asks whether it was shared.
 */
function ReflectContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTheme()
  const pieceId = searchParams.get('piece_id')
  const nodeId = searchParams.get('node_id')

  const [piece, setPiece] = useState<{ title: string; project_id: string | null } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [heard, setHeard] = useState<Heard>(emptyHeard)
  const [phase, setPhase] = useState(1)
  const [followedUp, setFollowedUp] = useState<number[]>([])
  const [skipped, setSkipped] = useState<number[]>([])
  const [stage, setStage] = useState<Stage>('talking')
  const [log, setLog] = useState<ReflectionLog | null>(null)
  const [busy, setBusy] = useState(false)
  const [settling, setSettling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [transcript, setTranscript] = useState('')
  const [supported, setSupported] = useState<boolean | null>(null)
  const transcriptRef = useRef('')
  transcriptRef.current = transcript
  const endRef = useRef<HTMLDivElement | null>(null)

  const { isRecording, interimText, handleRecordToggle, stopRecording, clearInterim } = useDictation({
    onAppend: useCallback((text: string) => {
      setTranscript((prev) => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text)
    }, []),
    getContext: () => transcriptRef.current.slice(-80),
  })

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition))
  }, [])

  // ── loading, and picking up where it was left ──
  useEffect(() => {
    if (!nodeId) {
      // Pieces from before the node model have no conversation to hold: they are read, not reflected on.
      router.replace(pieceId ? `/read?piece_id=${pieceId}` : '/project-board')
      return
    }
    fetch(`/api/read/node?node_id=${nodeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) return
        // A piece is looked back on once. After that it is shown, not asked again.
        if (data.piece.reflection) {
          router.replace(`/read?node_id=${nodeId}`)
          return
        }
        setPiece({ title: data.piece.title, project_id: data.piece.project_id ?? null })
        let saved: Saved | null = null
        try {
          saved = JSON.parse(localStorage.getItem(saveKey(nodeId)) ?? 'null') as Saved | null
        } catch { /* nothing kept */ }
        if (saved && Array.isArray(saved.messages) && saved.messages.length > 0) {
          setMessages(saved.messages)
          setHeard(saved.heard ?? emptyHeard())
          setPhase(saved.phase ?? 1)
          setFollowedUp(saved.followedUp ?? [])
          setSkipped(saved.skipped ?? [])
          setLog(saved.log ?? null)
          setStage(saved.stage === 'review' && saved.log ? 'review' : 'talking')
        } else {
          setMessages([{ role: 'assistant', content: reflectOpening(data.piece.title || '') }])
        }
      })
      .catch((err) => console.error('Failed to fetch piece:', err))
      .finally(() => setIsLoading(false))
  }, [nodeId, pieceId, router])

  // What has been said survives a refresh or a closed tab until the piece is finished.
  useEffect(() => {
    if (!nodeId || messages.length === 0) return
    const saved: Saved = { messages, heard, phase, followedUp, skipped, stage: stage === 'review' ? 'review' : 'talking', log }
    try { localStorage.setItem(saveKey(nodeId), JSON.stringify(saved)) } catch { /* private mode */ }
  }, [nodeId, messages, heard, phase, followedUp, skipped, stage, log])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [messages.length, busy, stage])

  const plain = (list: ThreadMessage[]) => list.map((m) => ({ role: m.role, content: m.content }))

  // ── writing it up ──
  const writeUp = async (list: ThreadMessage[], heardNow: Heard, skippedNow: number[]) => {
    setStage('writing')
    setError(null)
    if (!list.some((m) => m.role === 'user')) {
      setLog(emptyLog())
      setStage('review')
      return
    }
    try {
      const res = await fetch('/api/reflect/distill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: nodeId, messages: plain(list), heard: heardNow, skipped: skippedNow }),
      })
      const data = await res.json()
      setLog((data.log as ReflectionLog) ?? logFromHeard(heardNow))
    } catch {
      setLog(logFromHeard(heardNow))
    }
    setStage('review')
  }

  // ── a turn: what they said, what was heard, what comes next ──
  const send = async () => {
    if (busy || settling) return
    if (isRecording) {
      setSettling(true)
      stopRecording()
      await new Promise((r) => setTimeout(r, SETTLE_MS))
      setSettling(false)
    }
    const words = transcriptRef.current.trim()
    if (!words || !nodeId) return
    const withUser: ThreadMessage[] = [...messages, { role: 'user', content: words }]
    setMessages(withUser)
    setTranscript('')
    clearInterim()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/reflect/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: nodeId, messages: plain(withUser), phase, followedUp, skipped, heard }),
      })
      if (!res.ok) throw new Error('no answer')
      const { text, meta } = await readTextStream<TurnMeta>(res, () => {})
      if (!text || !meta) throw new Error('no answer')
      const withReply: ThreadMessage[] = [...withUser, { role: 'assistant', content: text }]
      setMessages(withReply)
      setHeard(meta.heard)
      setFollowedUp(meta.followedUp)
      setPhase(meta.phase)
      if (meta.done) await writeUp(withReply, meta.heard, skipped)
    } catch {
      // Nothing is lost: what they said goes back to be sent again, or the question skipped.
      setMessages(messages)
      setTranscript(words)
      setError("That didn't come through. Send it again, or skip this one.")
    } finally {
      setBusy(false)
    }
  }

  // ── skipping: no model, no wait ──
  const skip = async () => {
    if (busy || settling) return
    if (isRecording) stopRecording()
    setTranscript('')
    clearInterim()
    setError(null)
    if (phase === 0) {
      // Skipping the "anything to change?" keeps the write-up as it was.
      setStage('review')
      return
    }
    const nextSkipped = [...skipped, phase]
    setSkipped(nextSkipped)
    const { theme } = nextTheme(heard, { phase: 0, followedUp, skipped: nextSkipped })
    if (theme === null) {
      await writeUp(messages, heard, nextSkipped)
      return
    }
    setMessages((prev) => [...prev, { role: 'assistant', content: THEMES[theme - 1].ask }])
    setPhase(theme)
  }

  // ── review: keep it, or say more ──
  const sayMore = () => {
    setStage('talking')
    setPhase(0)
    setTranscript('')
    setError(null)
    setMessages((prev) => [...prev, { role: 'assistant', content: REFLECT_CORRECTION_ASK }])
  }

  const keep = async () => {
    if (!nodeId || !log) return
    setStage('saving')
    setError(null)
    try {
      const res = await fetch('/api/post-publication/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: nodeId, ...toLogBody(log) }),
      })
      const data = await res.json().catch(() => ({}))
      // 409: it was already kept (another tab); either way the piece is finished.
      if (data.success || res.status === 409) {
        try { localStorage.removeItem(saveKey(nodeId)) } catch { /* nothing */ }
        router.push(`/read?node_id=${nodeId}`)
        return
      }
      setError("That didn't save. What you said is still here; try again?")
    } catch {
      setError("That didn't save. What you said is still here; try again?")
    }
    setStage('review')
  }

  if (!nodeId) return null

  const talking = stage === 'talking'
  const shownTranscript = transcript + (interimText ? (transcript && !transcript.endsWith(' ') ? ' ' : '') + interimText : '')
  const waiting = busy || settling

  return (
    <PageShell mood="violet" maxWidth={760}>
      <PageHeader
        eyebrow="Reflect"
        title={piece?.title || 'Reflect'}
        subtitle="A short conversation to look back on it. You speak your answers, and you can skip any question."
        size="md"
        back={`/write/test?node_id=${nodeId}`}
      />

      <Container>
        <div style={{ marginBottom: 22 }}>
          <JourneyNavNode projectId={piece?.project_id ?? null} nodeId={nodeId} step="reflect" />
        </div>

        {isLoading ? (
          <Working size="sm" label="Loading…" patientNote={null} color={t.textMuted} />
        ) : !piece ? (
          <p style={{ ...typeRoles.small, color: t.textMuted }}>That piece could not be found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Card>
              <Thread messages={messages} streaming={busy} align="left" />

              {stage === 'writing' && (
                <div style={{ marginTop: 22 }}>
                  <Working size="sm" label="Putting what you said together…" patientNote={null} color={t.textMuted} />
                </div>
              )}

              {(stage === 'review' || stage === 'saving') && log && (
                <div style={{ marginTop: 26, paddingTop: 22, borderTop: `1px solid ${t.divider}` }}>
                  <Eyebrow style={{ marginBottom: 14 }}>Here is what you said</Eyebrow>
                  {hasAnyLog(log) ? (
                    <ReflectionLogView log={{ feeling: log.feeling, opened: log.opened, unresolved: log.unresolved, next: log.next }} />
                  ) : (
                    <p style={{ ...typeRoles.ui, fontSize: 15, color: t.textSecondary, margin: 0 }}>Nothing to add. That is a fine way to finish.</p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
                    <PrimaryButton onClick={() => void keep()} loading={stage === 'saving'} loadingLabel="Keeping…">Keep this and finish the piece</PrimaryButton>
                    <GhostButton size="sm" onClick={sayMore} disabled={stage === 'saving'}>Not quite, let me say more</GhostButton>
                  </div>
                  <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, margin: '12px 0 0' }}>
                    Keeping it marks the piece as finished and keeps this with it. You can still edit the piece afterwards.
                  </p>
                </div>
              )}

              {error && <p role="alert" style={{ ...typeRoles.small, color: t.danger, margin: '16px 0 0' }}>{error}</p>}
              <div ref={endRef} />
            </Card>

            {talking && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                {supported === false ? (
                  <p style={{ ...typeRoles.small, color: t.textMuted, textAlign: 'center', maxWidth: 420, margin: 0 }}>
                    This browser can&rsquo;t listen. Speaking works in Chrome, Edge and Safari. You can skip every question and still finish the piece.
                  </p>
                ) : (
                  <>
                    <MicButton recording={isRecording} onToggle={handleRecordToggle} disabled={waiting} size={76} />
                    <p aria-live="polite" style={{ ...typeRoles.eyebrow, color: t.textMuted, margin: 0 }}>
                      {isRecording ? 'Listening. Tap again when you are done.' : shownTranscript ? 'Ready when you are' : 'Tap, then speak'}
                    </p>
                    {shownTranscript && (
                      <p style={{ ...typeRoles.ui, fontSize: 16, lineHeight: 1.65, color: t.textPrimary, margin: 0, maxWidth: 560, textAlign: 'center', whiteSpace: 'pre-wrap' }}>
                        {shownTranscript}
                      </p>
                    )}
                    {transcript.trim() && !isRecording && (
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <QuietButton onClick={() => void send()} loading={waiting} loadingLabel="Sending…">Send</QuietButton>
                        <GhostButton size="sm" onClick={() => { setTranscript(''); clearInterim() }} disabled={waiting}>Start again</GhostButton>
                      </div>
                    )}
                    {isRecording && transcript.trim() && (
                      <QuietButton onClick={() => void send()} loading={waiting} loadingLabel="Sending…">Send</QuietButton>
                    )}
                  </>
                )}
                <GhostButton size="sm" onClick={() => void skip()} disabled={waiting}>
                  {phase === 0 ? 'Never mind, keep it as it is' : 'Skip this question'}
                </GhostButton>
              </div>
            )}
          </div>
        )}
      </Container>
    </PageShell>
  )
}

export default function ReflectPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: shell.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: shell.muted }}><WorkingDots /> Loading…</p>
        </div>
      }
    >
      <ReflectContent />
    </Suspense>
  )
}
