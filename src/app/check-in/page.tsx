'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useDictation } from '@/lib/use-dictation'
import { useRouter } from 'next/navigation'
import { motion as m, AnimatePresence } from 'motion/react'
import { readTextStream } from '@/lib/stream-client'
import { formatDateAsRelative } from '@/lib/dates'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { PrimaryButton, GhostButton, QuietButton } from '@/components/ui/buttons'
import { MicButton } from '@/components/ui/mic-button'
import { Pill } from '@/components/ui/pill'
import { Thread } from '@/components/conversation/thread'
import { WeatherStrip } from '@/components/widgets'
import { arcHue, shell, type as typeRoles, type Arc } from '@/lib/design-tokens'
import { atmosphereFromCheckIns, weatherDays, type StoredCheckIn, type WritingActivityRow } from '@/lib/check-in-signals'

type CheckInType = 'morning' | 'after_work' | 'evening' | 'moment'
type EnergyLevel = 'low' | 'medium' | 'high'

interface Signals {
  energy: EnergyLevel
  inner_weather: string
  creative_readiness: boolean
  arc_texture: Arc
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface PastCheckIn extends StoredCheckIn {
  full_conversation: string | null
  check_in_type: CheckInType | null
}

function parseConversation(fullConversation: string | null, rawEntry: string): Message[] {
  if (!fullConversation?.trim()) {
    return rawEntry ? [{ role: 'user', content: rawEntry }] : []
  }
  return fullConversation
    .split(/\n\n(?=(?:You|Companheiro): )/)
    .map((chunk) => {
      const match = chunk.match(/^(You|Companheiro): ([\s\S]*)$/)
      if (!match) return null
      return { role: match[1] === 'You' ? ('user' as const) : ('assistant' as const), content: match[2].trim() }
    })
    .filter((x): x is Message => x !== null)
}

const HISTORY_PAGE_SIZE = 5

function previewText(text: string, maxLen = 90): string {
  const trimmed = text.trim()
  return trimmed.length <= maxLen ? trimmed : trimmed.slice(0, maxLen).trimEnd() + '…'
}

const CHECK_IN_TYPE_LABELS: Record<CheckInType, string> = {
  morning: 'Morning',
  after_work: 'After work',
  evening: 'Evening',
  moment: 'A moment',
}

export default function CheckInPage() {
  const router = useRouter()
  const { t } = useTheme()

  const [inputMode, setInputMode] = useState<'mic' | 'keyboard' | null>(null)
  const [transcript, setTranscript] = useState('')
  const transcriptRef = useRef('')
  transcriptRef.current = transcript
  const [messages, setMessages] = useState<Message[]>([])
  const [signals, setSignals] = useState<Signals | null>(null)
  // Once they've corrected the reading themselves, later turns stop revising it.
  const signalsEditedRef = useRef(false)
  const [inferredType, setInferredType] = useState<CheckInType | null>(null)
  const [confirmedType, setConfirmedType] = useState<CheckInType | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const checkInIdRef = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [initialEntry, setInitialEntry] = useState('')
  const [isLoadingJournal, setIsLoadingJournal] = useState(false)
  const [journalPrompt, setJournalPrompt] = useState('')
  const [showJournalPrompt, setShowJournalPrompt] = useState(false)
  const [pastCheckIns, setPastCheckIns] = useState<PastCheckIn[]>([])
  const [writingActivity, setWritingActivity] = useState<WritingActivityRow[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [expandedCheckInIds, setExpandedCheckInIds] = useState<Set<string>>(new Set())
  const [showJournalButton, setShowJournalButton] = useState(false)
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null)

  const { isRecording, interimText: dictationInterim, handleRecordToggle, clearInterim } = useDictation({
    onAppend: useCallback((text: string) => {
      setTranscript((prev) => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text)
    }, []),
    getContext: () => transcriptRef.current.slice(-80),
  })
  const transcriptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
    }
  }, [])

  const handleSpeak = (text: string, index: number) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (speakingIndex === index) {
      window.speechSynthesis.cancel()
      setSpeakingIndex(null)
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => setSpeakingIndex(null)
    utterance.onerror = () => setSpeakingIndex(null)
    setSpeakingIndex(index)
    window.speechSynthesis.speak(utterance)
  }

  // Resize transcript textarea when dictation injects text
  useEffect(() => {
    const el = transcriptTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
    el.scrollTop = el.scrollHeight
  }, [transcript, dictationInterim])

  useEffect(() => {
    if (messages.length === 0) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, isProcessing, signals, savedAt])

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const [res, activityRes] = await Promise.all([fetch('/api/check-in/history'), fetch('/api/write/activity')])
        const data = await res.json()
        const activity = await activityRes.json()
        setPastCheckIns(data.checkIns || [])
        setWritingActivity(activity.activity || [])
      } catch (err) {
        console.error('Failed to fetch check-in history:', err)
      } finally {
        setIsLoadingHistory(false)
      }
    }
    fetchHistory()
  }, [])

  // Deep link from Home's weather strip.
  useEffect(() => {
    if (!isLoadingHistory && typeof window !== 'undefined' && window.location.hash === '#history') {
      historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [isLoadingHistory])

  const toggleCheckInExpanded = (id: string) => {
    setExpandedCheckInIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startMicMode = () => {
    setError(null)
    setTranscript('')
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      setSpeakingIndex(null)
    }
    handleRecordToggle()
  }

  const streamAiMessage = async <M,>(res: Response, hideFrom: string[] = []): Promise<M | null> => {
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }])
    try {
      const { meta } = await readTextStream<M>(
        res,
        (visibleText) => {
          setMessages((prev) => {
            const next = [...prev]
            next[next.length - 1] = { role: 'assistant', content: visibleText }
            return next
          })
        },
        hideFrom
      )
      return meta
    } catch (err) {
      setMessages((prev) => (prev[prev.length - 1]?.role === 'assistant' && !prev[prev.length - 1].content ? prev.slice(0, -1) : prev))
      throw err
    }
  }

  const handleSend = async () => {
    if (!transcript.trim()) return
    setIsProcessing(true)
    setError(null)
    const userText = transcript.trim()
    const priorHistory = messages.map((x) => ({ role: x.role, content: x.content }))
    setMessages((prev) => [...prev, { role: 'user', content: userText }])
    setTranscript('')
    const alreadyResponded = messages.some((x) => x.role === 'assistant')
    try {
      if (alreadyResponded) {
        const res = await fetch('/api/check-in/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            response: userText,
            messages: priorHistory,
            energy: signals?.energy ?? null,
            check_in_id: checkInIdRef.current,
          }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error ?? 'Processing failed')
        }
        // Every turn re-reads the whole conversation, so a check-in that opened
        // flat and arrived somewhere real is logged as where it arrived. A
        // reading the person has corrected by hand always wins.
        const meta = await streamAiMessage<{ signals?: Signals; journalCue?: boolean }>(res, ['<signals>', '<journal_cue>'])
        if (meta?.signals && !signalsEditedRef.current) setSignals(meta.signals)
        if (meta?.journalCue) setShowJournalButton(true)
      } else {
        setInitialEntry(userText)
        const res = await fetch('/api/check-in/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // The person's own clock, so "morning" means their morning.
          body: JSON.stringify({ transcript: userText, local_hour: new Date().getHours() }),
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error ?? 'Processing failed')
        }
        const meta = await streamAiMessage<{ signals: Signals; inferredType: CheckInType; journalCue?: boolean }>(res, ['<signals>', '<journal_cue>'])
        if (meta) {
          setSignals(meta.signals)
          setInferredType(meta.inferredType)
          setConfirmedType(meta.inferredType)
          if (meta.journalCue) setShowJournalButton(true)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsProcessing(false)
    }
  }

  const fullConversationText = () => messages.map((x) => `${x.role === 'user' ? 'You' : 'Companheiro'}: ${x.content}`).join('\n\n')

  const handleJournalPrompt = async () => {
    setIsLoadingJournal(true)
    setError(null)
    try {
      const res = await fetch('/api/check-in/journal-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_entry: initialEntry,
          full_conversation: fullConversationText(),
          check_in_id: checkInIdRef.current,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate prompt')
      setJournalPrompt(data.prompt)
      setShowJournalPrompt(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoadingJournal(false)
    }
  }

  // Everything the save needs, mirrored so the on-the-way-out flush can read
  // current values instead of whatever a stale closure captured.
  const persistRef = useRef({ signals, confirmedType, initialEntry, messages })
  persistRef.current = { signals, confirmedType, initialEntry, messages }

  // The check-in writes itself: once there is something to save it saves, and
  // keeps the same row up to date as the conversation goes on. Nobody has to
  // remember to press anything at the end of saying something hard.
  const persist = useCallback(async (finalise: boolean) => {
    const { signals: s, confirmedType: type, initialEntry: entry, messages: msgs } = persistRef.current
    if (!s || !type || !entry.trim()) return

    const payload = {
      id: checkInIdRef.current,
      finalise,
      raw_entry: entry,
      full_conversation: msgs.map((x) => `${x.role === 'user' ? 'You' : 'Companheiro'}: ${x.content}`).join('\n\n'),
      energy: s.energy,
      inner_weather: s.inner_weather,
      creative_readiness: s.creative_readiness,
      arc_texture: s.arc_texture,
      check_in_type: type,
    }

    // On the way out there is no time to await anything — fire and let it land.
    if (finalise) {
      if (!checkInIdRef.current) return
      fetch('/api/check-in/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {})
      return
    }

    try {
      const res = await fetch('/api/check-in/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')
      const savedId: string | undefined = data.data?.id
      if (savedId) {
        const isNew = !checkInIdRef.current
        checkInIdRef.current = savedId
        setPastCheckIns((prev) => {
          const row = {
            id: savedId,
            created_at: new Date().toISOString(),
            raw_entry: payload.raw_entry,
            full_conversation: payload.full_conversation,
            energy: payload.energy,
            inner_weather: payload.inner_weather,
            arc_texture: payload.arc_texture,
            check_in_type: payload.check_in_type,
          }
          return isNew ? [row, ...prev] : prev.map((c) => (c.id === savedId ? row : c))
        })
      }
      setSavedAt(new Date())
    } catch (err) {
      // A failed autosave is not something to interrupt them with mid-thought.
      console.error('Check-in autosave failed:', err)
    }
  }, [])

  // Save once the reading exists and again whenever the conversation moves on,
  // but never mid-stream — a half-written reply is not worth persisting.
  useEffect(() => {
    if (!signals || !confirmedType || isProcessing) return
    persist(false)
  }, [signals, confirmedType, isProcessing, messages.length, persist])

  // Leaving the page is the only reliable signal a conversation is over, so it
  // is where the portrait distillation gets triggered.
  useEffect(() => {
    const onHide = () => persist(true)
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      persist(true)
    }
  }, [persist])

  const resetAll = () => {
    // Close the books on the one they're leaving before starting a new row.
    persist(true)
    checkInIdRef.current = null
    setSavedAt(null)
    setInputMode(null)
    setMessages([])
    setTranscript('')
    setSignals(null)
    signalsEditedRef.current = false
    setInferredType(null)
    setConfirmedType(null)
    setShowJournalButton(false)
    setInitialEntry('')
    setJournalPrompt('')
    setShowJournalPrompt(false)
    setError(null)
  }

  const hasAiResponded = messages.some((x) => x.role === 'assistant')
  const { mood, intensity } = atmosphereFromCheckIns(signals ? [{ id: 'live', created_at: new Date().toISOString(), raw_entry: initialEntry, energy: signals.energy, inner_weather: signals.inner_weather, arc_texture: signals.arc_texture }] : pastCheckIns)
  const hour = new Date().getHours()
  const daypart = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'

  // ── Input area ─────────────────────────────────────────────────────────────
  const textareaValue = transcript + (dictationInterim ? (transcript && !transcript.endsWith(' ') ? ' ' : '') + dictationInterim : '')
  const inputArea = (
    <div style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, margin: '0 auto' }}>
      {inputMode === null ? (
        <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }} className="check-in-mode-picker">
          <m.button onClick={() => { setInputMode('mic'); startMicMode() }} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Check in by voice">
            <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: '#1c1916', border: '1.5px solid #352f29', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: t.shadow }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#aaa59c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <span style={{ ...typeRoles.small, fontSize: 12, color: shell.muted, letterSpacing: '0.04em' }}>Voice</span>
          </m.button>
          <m.button onClick={() => setInputMode('keyboard')} whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer' }} aria-label="Check in by typing">
            <div style={{ width: 72, height: 72, borderRadius: '50%', backgroundColor: '#1c1916', border: '1.5px solid #352f29', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: t.shadow }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#aaa59c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
              </svg>
            </div>
            <span style={{ ...typeRoles.small, fontSize: 12, color: shell.muted, letterSpacing: '0.04em' }}>Type</span>
          </m.button>
        </m.div>
      ) : (
        <>
          {inputMode === 'mic' && <MicButton recording={isRecording} onToggle={handleRecordToggle} disabled={isProcessing} size={80} onShell={messages.length === 0} />}

          <AnimatePresence>
            {isRecording && (
              <m.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} style={{ ...typeRoles.eyebrow, color: messages.length === 0 ? shell.muted : t.textMuted }}>
                Recording
              </m.p>
            )}
          </AnimatePresence>

          {(transcript || isRecording || inputMode === 'keyboard') && (
            <textarea
              ref={transcriptTextareaRef}
              value={textareaValue}
              onChange={(e) => {
                clearInterim()
                setTranscript(e.target.value)
              }}
              placeholder={inputMode === 'keyboard' ? 'Begin typing…' : 'Your words will appear here…'}
              rows={inputMode === 'keyboard' ? 2 : 1}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus={inputMode === 'keyboard'}
              aria-label="Your check-in"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                backgroundColor: messages.length === 0 ? '#1c1916' : t.inputBg,
                border: `1px solid ${messages.length === 0 ? '#352f29' : t.inputBorder}`,
                borderRadius: 12,
                padding: '12px 14px',
                fontFamily: 'var(--font-geist-sans)',
                fontSize: 16,
                fontWeight: 500,
                color: messages.length === 0 ? '#ece9e2' : t.textPrimary,
                outline: 'none',
                resize: 'none',
                lineHeight: 1.65,
                overflowY: 'auto',
                maxHeight: 200,
              }}
            />
          )}

          {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger, alignSelf: 'flex-start' }}>{error}</p>}

          {transcript.trim() && (
            <PrimaryButton onClick={handleSend} disabled={isProcessing} loading={isProcessing} loadingLabel="Processing…" full size="lg">
              Send
            </PrimaryButton>
          )}
        </>
      )}
    </div>
  )

  // ── History ────────────────────────────────────────────────────────────────
  const historySection = !isLoadingHistory && pastCheckIns.length > 0 && messages.length === 0 && (
    <div ref={historyRef} id="history" style={{ marginTop: 28 }}>
      <Container>
        <Card>
          <Eyebrow style={{ marginBottom: 14 }}>Inner weather · 30 days</Eyebrow>
          <WeatherStrip
            days={weatherDays(pastCheckIns, 30, writingActivity)}
            onSelect={(d) => {
              const match = pastCheckIns.find((c) => new Date(c.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) === d.date)
              if (match) setExpandedCheckInIds((prev) => new Set(prev).add(match.id))
            }}
          />
        </Card>
        <div style={{ marginTop: 20 }}>
          <Eyebrow style={{ marginBottom: 12 }}>Past check-ins</Eyebrow>
          <Card padding="4px 20px">
            {(historyExpanded ? pastCheckIns : pastCheckIns.slice(0, HISTORY_PAGE_SIZE)).map((checkIn, index, arr) => {
              const isOpen = expandedCheckInIds.has(checkIn.id)
              return (
                <div key={checkIn.id} style={{ borderBottom: index < arr.length - 1 ? `1px solid ${t.divider}` : 'none', padding: '14px 0' }}>
                  <button onClick={() => toggleCheckInExpanded(checkIn.id)} aria-expanded={isOpen} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted }}>
                          {formatDateAsRelative(checkIn.created_at)}
                          {checkIn.check_in_type ? ` · ${CHECK_IN_TYPE_LABELS[checkIn.check_in_type]}` : ''}
                        </span>
                        {checkIn.arc_texture && <Pill hue={arcHue[checkIn.arc_texture]} dot>{checkIn.arc_texture}</Pill>}
                        {checkIn.inner_weather && <span style={{ ...typeRoles.small, fontSize: 12, color: t.textSecondary, fontWeight: 500 }}>{checkIn.inner_weather}</span>}
                      </div>
                      <p style={{ ...typeRoles.ui, fontSize: 15, color: t.textPrimary }}>{previewText(checkIn.raw_entry)}</p>
                    </div>
                    <span style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted, flexShrink: 0, marginTop: 2 }}>{isOpen ? '▾' : '▸'}</span>
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <m.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                        <div style={{ paddingTop: 16, paddingLeft: 12, borderLeft: `2px solid ${t.divider}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {parseConversation(checkIn.full_conversation, checkIn.raw_entry).map((msg, i) => (
                            <p key={i} style={{ ...typeRoles.ui, fontSize: 14, color: msg.role === 'user' ? t.textPrimary : t.textSecondary, fontWeight: msg.role === 'user' ? 500 : 400 }}>
                              {msg.content}
                            </p>
                          ))}
                        </div>
                      </m.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </Card>
          {!historyExpanded && pastCheckIns.length > HISTORY_PAGE_SIZE && (
            <div style={{ marginTop: 12 }}>
              <GhostButton size="sm" onClick={() => setHistoryExpanded(true)}>Show older check-ins ({pastCheckIns.length - HISTORY_PAGE_SIZE} more)</GhostButton>
            </div>
          )}
        </div>
      </Container>
    </div>
  )

  return (
    <PageShell mood={mood} intensity={intensity}>
      <style>{`
        .check-in-mode-picker { display: flex; flex-direction: row; gap: 40px; align-items: center; }
        @media (max-width: 640px) { .check-in-mode-picker { gap: 32px; } }
      `}</style>

      <PageHeader eyebrow={`Companheiro · ${daypart}`} title="Check-in" />

      {messages.length === 0 ? (
        /* Idle: the two circles, directly on the shell, exactly as minimal as before */
        <m.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }} style={{ minHeight: '46vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0' }}>
          {inputArea}
        </m.div>
      ) : (
        <Container>
          <div style={{ maxWidth: 620, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Thread messages={messages} streaming={isProcessing} align="left">
              {/* Read aloud for the last companion reply */}
              {hasAiResponded && !isProcessing && (
                <div style={{ marginTop: -12 }}>
                  {(() => {
                    const lastAi = [...messages].map((x, i) => ({ x, i })).reverse().find(({ x }) => x.role === 'assistant')
                    if (!lastAi) return null
                    return (
                      <button onClick={() => handleSpeak(lastAi.x.content, lastAi.i)} aria-label={speakingIndex === lastAi.i ? 'Stop reading aloud' : 'Read aloud'} style={{ color: t.textMuted, background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, ...typeRoles.small, fontSize: 12 }}>
                        {speakingIndex === lastAi.i ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5" /></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                        )}
                        {speakingIndex === lastAi.i ? 'Stop' : 'Read aloud'}
                      </button>
                    )
                  })()}
                </div>
              )}
            </Thread>

            {/* Contextual doors — only surface when there is something real to offer */}
            {hasAiResponded && !isProcessing && (showJournalButton || signals?.creative_readiness) && (
              <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {showJournalButton && (
                  <GhostButton size="sm" onClick={handleJournalPrompt} disabled={isLoadingJournal} loading={isLoadingJournal} loadingLabel="Generating…">
                    Journal prompt
                  </GhostButton>
                )}
                {signals?.creative_readiness && <QuietButton href="/idea-lab">Take it to the Lab →</QuietButton>}
              </m.div>
            )}

            {showJournalPrompt && journalPrompt && (
              <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card>
                  <Eyebrow style={{ marginBottom: 8 }}>Journal prompt</Eyebrow>
                  <p style={{ ...typeRoles.quote, color: t.textPrimary }}>{journalPrompt}</p>
                  <div style={{ marginTop: 12 }}>
                    <GhostButton size="sm" onClick={() => navigator.clipboard.writeText(journalPrompt)}>Copy prompt</GhostButton>
                  </div>
                </Card>
              </m.div>
            )}

            {/* Always available: saving is not the end of the conversation,
                so nothing here should stop them carrying on talking. */}
            <div style={{ paddingTop: 8 }}>
              {inputArea}
            </div>
            <div ref={messagesEndRef} style={{ height: 1 }} />
          </div>
        </Container>
      )}

      {historySection}
    </PageShell>
  )
}
