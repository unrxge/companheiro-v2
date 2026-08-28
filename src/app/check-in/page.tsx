'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { readTextStream } from '@/lib/stream-client'
import { formatDateAsRelative } from '@/lib/dates'
import { useCardTheme } from '@/hooks/useCardTheme'
import { cardPalette, shellBackground, accentColor } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'
import { ThemeToggleButton } from '@/components/ui/theme-toggle-button'

type CheckInType = 'morning' | 'after_work' | 'evening' | 'moment'
type ArcType = 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration'
type EnergyLevel = 'low' | 'medium' | 'high'

interface Signals {
  energy: EnergyLevel
  inner_weather: string
  creative_readiness: boolean
  arc_texture: ArcType
}

interface Message {
  role: 'user' | 'ai'
  text: string
}

interface PastCheckIn {
  id: string
  created_at: string
  raw_entry: string
  full_conversation: string | null
  energy: EnergyLevel
  inner_weather: string
  arc_texture: ArcType | null
  check_in_type: CheckInType | null
}

// full_conversation is stored flattened as "You: ...\n\nCompanheiro: ...".
// Split back into bubbles, falling back to the raw entry alone if a check-in
// predates conversation tracking or something went wrong on log.
function parseConversation(fullConversation: string | null, rawEntry: string): Message[] {
  if (!fullConversation?.trim()) {
    return rawEntry ? [{ role: 'user', text: rawEntry }] : []
  }

  return fullConversation
    .split(/\n\n(?=(?:You|Companheiro): )/)
    .map((chunk) => {
      const match = chunk.match(/^(You|Companheiro): ([\s\S]*)$/)
      if (!match) return null
      return { role: match[1] === 'You' ? ('user' as const) : ('ai' as const), text: match[2].trim() }
    })
    .filter((m): m is Message => m !== null)
}

const HISTORY_PAGE_SIZE = 5

function previewText(text: string, maxLen = 80): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLen) return trimmed
  return trimmed.slice(0, maxLen).trimEnd() + '…'
}

const CHECK_IN_TYPE_LABELS: Record<CheckInType, string> = {
  morning: 'Morning',
  after_work: 'After work',
  evening: 'Evening',
  moment: 'A moment',
}

const ALL_CHECK_IN_TYPES: CheckInType[] = ['morning', 'after_work', 'evening', 'moment']

export default function CheckInPage() {
  const router = useRouter()
  const { theme, toggle } = useCardTheme('light')
  const c = cardPalette[theme]

  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [signals, setSignals] = useState<Signals | null>(null)
  const [inferredType, setInferredType] = useState<CheckInType | null>(null)
  const [confirmedType, setConfirmedType] = useState<CheckInType | null>(null)
  const [showTypeCorrection, setShowTypeCorrection] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLogging, setIsLogging] = useState(false)
  const [logSuccess, setLogSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialEntry, setInitialEntry] = useState('')
  const [isLoadingJournal, setIsLoadingJournal] = useState(false)
  const [journalPrompt, setJournalPrompt] = useState('')
  const [showJournalPrompt, setShowJournalPrompt] = useState(false)
  const [isPunctuating, setIsPunctuating] = useState(false)
  const [pastCheckIns, setPastCheckIns] = useState<PastCheckIn[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [expandedCheckInIds, setExpandedCheckInIds] = useState<Set<string>>(new Set())
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const pastCheckInsRef = useRef<HTMLDivElement>(null)

  const eyebrow: React.CSSProperties = {
    color: c.textSecondary,
    fontSize: '11px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-geist-sans)',
    fontWeight: 600,
    margin: 0,
  }

  // Stop any in-progress speech when leaving the page, so it doesn't keep
  // talking after navigation.
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
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

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/check-in/history')
        const data = await res.json()
        setPastCheckIns(data.checkIns || [])
      } catch (err) {
        console.error('Failed to fetch check-in history:', err)
      } finally {
        setIsLoadingHistory(false)
      }
    }
    fetchHistory()
  }, [])

  const scrollToHistory = () => {
    pastCheckInsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const toggleCheckInExpanded = (id: string) => {
    setExpandedCheckInIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startRecording = async () => {
    setError(null)
    setTranscript('')

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      setSpeakingIndex(null)
    }

    const SpeechRecognitionAPI =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (SpeechRecognitionAPI) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recognition: any = new SpeechRecognitionAPI()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      let finalTranscript = ''

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          if (result.isFinal) {
            finalTranscript += result[0].transcript + ' '
          } else {
            interim += result[0].transcript
          }
        }
        setTranscript((finalTranscript + interim).trim())
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          setError(`Microphone error: ${event.error}`)
        }
      }

      recognition.onend = () => {
        if (finalTranscript.trim()) {
          punctuateTranscript(finalTranscript.trim())
        }
      }

      recognition.start()
      recognitionRef.current = recognition
      setIsRecording(true)
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const mediaRecorder = new MediaRecorder(stream)
        chunksRef.current = []

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }

        mediaRecorder.start()
        mediaRecorderRef.current = mediaRecorder
        setIsRecording(true)
        setError('Live transcription unavailable in this browser. Type your check-in below.')
      } catch {
        setError('Microphone access denied. Please allow microphone access and try again.')
      }
    }
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop())
      mediaRecorderRef.current = null
    }
    setIsRecording(false)
  }

  const punctuateTranscript = async (rawText: string) => {
    if (!rawText.trim()) return
    setIsPunctuating(true)
    try {
      const res = await fetch('/api/punctuate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText }),
      })
      const data = await res.json()
      if (data.punctuated) setTranscript(data.punctuated)
    } catch (err) {
      console.error('Punctuation error:', err)
    } finally {
      setIsPunctuating(false)
    }
  }

  const handleRecordToggle = () => {
    if (isRecording) stopRecording()
    else startRecording()
  }

  const streamAiMessage = async <M,>(res: Response, hideFrom: string[] = []): Promise<M | null> => {
    setMessages((prev) => [...prev, { role: 'ai', text: '' }])
    try {
      const { meta } = await readTextStream<M>(
        res,
        (visibleText) => {
          setMessages((prev) => {
            const next = [...prev]
            next[next.length - 1] = { role: 'ai', text: visibleText }
            return next
          })
        },
        hideFrom
      )
      return meta
    } catch (err) {
      setMessages((prev) =>
        prev[prev.length - 1]?.role === 'ai' && !prev[prev.length - 1].text
          ? prev.slice(0, -1)
          : prev
      )
      throw err
    }
  }

  const handleSend = async () => {
    if (!transcript.trim()) return
    setIsProcessing(true)
    setError(null)

    const userText = transcript.trim()
    const priorHistory = messages.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
      content: m.text,
    }))
    setMessages((prev) => [...prev, { role: 'user', text: userText }])
    setTranscript('')

    const alreadyResponded = messages.some((m) => m.role === 'ai')

    try {
      if (alreadyResponded) {
        const res = await fetch('/api/check-in/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ response: userText, messages: priorHistory }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Processing failed')
        }
        await streamAiMessage(res)
      } else {
        setInitialEntry(userText)
        const res = await fetch('/api/check-in/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: userText }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Processing failed')
        }
        const meta = await streamAiMessage<{ signals: Signals; inferredType: CheckInType }>(res, ['<signals>'])
        if (meta) {
          setSignals(meta.signals)
          setInferredType(meta.inferredType)
          setConfirmedType(meta.inferredType)
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleJournalPrompt = async () => {
    setIsLoadingJournal(true)
    setError(null)
    try {
      const fullConversation = messages
        .map((msg) => `${msg.role === 'user' ? 'You' : 'Companheiro'}: ${msg.text}`)
        .join('\n\n')
      const res = await fetch('/api/check-in/journal-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_entry: initialEntry, full_conversation: fullConversation }),
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

  const handleLog = async () => {
    if (!signals || !confirmedType) return
    setIsLogging(true)
    setError(null)
    try {
      const fullConversation = messages
        .map((msg) => `${msg.role === 'user' ? 'You' : 'Companheiro'}: ${msg.text}`)
        .join('\n\n')
      const res = await fetch('/api/check-in/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_entry: initialEntry,
          full_conversation: fullConversation,
          energy: signals.energy,
          inner_weather: signals.inner_weather,
          creative_readiness: signals.creative_readiness,
          arc_texture: signals.arc_texture,
          check_in_type: confirmedType,
          engaged_with_deeper_work: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Logging failed')
      setLogSuccess(true)
    } catch (err) {
      console.error('Log error:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLogging(false)
    }
  }

  const hasAiResponded = messages.some((m) => m.role === 'ai')

  const mainInputArea = (
    <div style={{ width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      {/* Mic button */}
      <motion.button
        onClick={handleRecordToggle}
        disabled={isProcessing}
        whileHover={isProcessing ? {} : { scale: 1.04 }}
        whileTap={isProcessing ? {} : { scale: 0.96 }}
        style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          backgroundColor: isRecording ? '#ffffff' : c.cardBg,
          border: `1.5px solid ${isRecording ? 'transparent' : c.inputBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          opacity: isProcessing ? 0.3 : 1,
          boxShadow: isRecording
            ? `0 0 0 6px rgba(165,63,43,0.12), ${c.shadow}`
            : c.shadow,
          transition: 'background-color 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
        }}
      >
        {isRecording ? (
          <span style={{ display: 'block', width: '20px', height: '20px', backgroundColor: accentColor, borderRadius: '4px' }} />
        ) : (
          <span style={{ display: 'block', width: '20px', height: '20px', backgroundColor: c.textMuted, borderRadius: '50%' }} />
        )}
      </motion.button>

      <AnimatePresence>
        {isRecording && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            style={{ ...eyebrow, color: accentColor }}
          >
            Recording
          </motion.p>
        )}
        {isPunctuating && !isRecording && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={eyebrow}
          >
            Punctuating...
          </motion.p>
        )}
      </AnimatePresence>

      {(transcript || isRecording) && (
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Your words will appear here..."
          rows={4}
          style={{
            width: '100%',
            backgroundColor: c.inputBg,
            border: `1px solid ${c.inputBorder}`,
            borderRadius: '12px',
            padding: '12px 14px',
            fontFamily: 'var(--font-geist-sans)',
            fontSize: '15px',
            color: c.textPrimary,
            outline: 'none',
            resize: 'none',
            lineHeight: 1.6,
            transition: 'border-color 0.2s ease',
          }}
        />
      )}

      {error && (
        <p style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '12px', color: '#f87171', margin: 0, alignSelf: 'flex-start' }}>
          {error}
        </p>
      )}

      {transcript.trim() && (
        <motion.button
          onClick={handleSend}
          disabled={isProcessing}
          whileHover={isProcessing ? {} : { opacity: 0.85 }}
          whileTap={isProcessing ? {} : { scale: 0.98 }}
          style={{
            width: '100%',
            padding: '13px',
            borderRadius: '12px',
            border: 'none',
            backgroundColor: accentColor,
            color: '#ffffff',
            fontFamily: 'var(--font-geist-sans)',
            fontWeight: 600,
            fontSize: '14px',
            cursor: isProcessing ? 'not-allowed' : 'pointer',
            opacity: isProcessing ? 0.4 : 1,
            transition: 'opacity 0.2s ease',
          }}
        >
          {isProcessing ? 'Processing...' : 'Send'}
        </motion.button>
      )}

      {showJournalPrompt && journalPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            width: '100%',
            backgroundColor: c.cardBg,
            boxShadow: c.shadow,
            borderRadius: '14px',
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <p style={eyebrow}>Journal prompt</p>
          <p style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '15px', color: c.textPrimary, lineHeight: 1.6, margin: 0 }}>
            {journalPrompt}
          </p>
          <button
            onClick={() => navigator.clipboard.writeText(journalPrompt)}
            style={{
              fontFamily: 'var(--font-geist-sans)',
              fontSize: '12px',
              color: c.textMuted,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textAlign: 'left',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            Copy prompt
          </button>
        </motion.div>
      )}

      {hasAiResponded && confirmedType && !logSuccess && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', paddingTop: '4px' }}>
          <motion.button
            onClick={handleLog}
            disabled={isLogging}
            whileHover={isLogging ? {} : { opacity: 0.65 }}
            whileTap={isLogging ? {} : { scale: 0.96 }}
            style={{
              fontFamily: 'var(--font-geist-sans)',
              fontSize: '12px',
              color: c.textMuted,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: isLogging ? 'not-allowed' : 'pointer',
              opacity: isLogging ? 0.3 : 1,
            }}
          >
            {isLogging ? 'Saving...' : 'Log this check-in'}
          </motion.button>
          <motion.button
            onClick={handleJournalPrompt}
            disabled={isLoadingJournal}
            whileHover={isLoadingJournal ? {} : { opacity: 0.65 }}
            whileTap={isLoadingJournal ? {} : { scale: 0.96 }}
            style={{
              fontFamily: 'var(--font-geist-sans)',
              fontSize: '12px',
              color: c.textMuted,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: isLoadingJournal ? 'not-allowed' : 'pointer',
              opacity: isLoadingJournal ? 0.3 : 1,
            }}
          >
            {isLoadingJournal ? 'Generating...' : 'Journal prompt'}
          </motion.button>
        </div>
      )}
    </div>
  )

  const pastCheckInsSection = !isLoadingHistory && pastCheckIns.length > 0 && (
    <div
      ref={pastCheckInsRef}
      className="snap-start snap-always"
      style={{ minHeight: '100%', padding: '32px 24px 48px' }}
    >
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>
        <p style={{ ...eyebrow, marginBottom: '24px' }}>Past check-ins</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {(historyExpanded ? pastCheckIns : pastCheckIns.slice(0, HISTORY_PAGE_SIZE)).map((checkIn, index, arr) => {
            const isOpen = expandedCheckInIds.has(checkIn.id)
            return (
              <div
                key={checkIn.id}
                style={{
                  borderBottom: index < arr.length - 1 ? `1px solid ${c.divider}` : 'none',
                  paddingBottom: '16px',
                  marginBottom: '16px',
                }}
              >
                <button
                  onClick={() => toggleCheckInExpanded(checkIn.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '11px', color: c.textMuted, margin: '0 0 4px' }}>
                      {formatDateAsRelative(checkIn.created_at)}
                      {checkIn.check_in_type ? ` · ${CHECK_IN_TYPE_LABELS[checkIn.check_in_type]}` : ''}
                    </p>
                    <p style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '15px', color: c.textPrimary, lineHeight: 1.55, margin: 0 }}>
                      {previewText(checkIn.raw_entry)}
                    </p>
                  </div>
                  <span style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '11px', color: c.textMuted, flexShrink: 0, marginTop: '2px' }}>
                    {isOpen ? '▾' : '▸'}
                  </span>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <div style={{ paddingTop: '16px', paddingLeft: '12px', borderLeft: `2px solid ${c.divider}`, display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {parseConversation(checkIn.full_conversation, checkIn.raw_entry).map((msg, i) => (
                          <p
                            key={i}
                            style={{
                              fontFamily: 'var(--font-geist-sans)',
                              fontSize: '14px',
                              lineHeight: 1.6,
                              margin: 0,
                              color: msg.role === 'user' ? c.textPrimary : c.textSecondary,
                              fontWeight: msg.role === 'user' ? 500 : 400,
                            }}
                          >
                            {msg.text}
                          </p>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>

        {!historyExpanded && pastCheckIns.length > HISTORY_PAGE_SIZE && (
          <motion.button
            onClick={() => setHistoryExpanded(true)}
            whileHover={{ opacity: 0.65 }}
            style={{
              marginTop: '8px',
              fontFamily: 'var(--font-geist-sans)',
              fontSize: '12px',
              color: c.textMuted,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            Show older check-ins ({pastCheckIns.length - HISTORY_PAGE_SIZE} more)
          </motion.button>
        )}
      </div>
    </div>
  )

  // ── Log success screen ──────────────────────────────────────────────────────
  if (logSuccess) {
    return (
      <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          style={{ textAlign: 'center', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}
        >
          <p style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '18px', fontWeight: 500, color: '#e8e6e0', margin: 0, letterSpacing: '-0.01em' }}>
            Check-in logged.
          </p>
          <p style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '14px', color: '#6a6866', margin: 0 }}>
            Take it from here.
          </p>
          <motion.button
            onClick={() => {
              setLogSuccess(false)
              setMessages([])
              setTranscript('')
              setSignals(null)
              setInferredType(null)
              setConfirmedType(null)
              setShowTypeCorrection(false)
              setInitialEntry('')
              setJournalPrompt('')
              setShowJournalPrompt(false)
            }}
            whileHover={{ opacity: 0.65 }}
            style={{
              marginTop: '16px',
              fontFamily: 'var(--font-geist-sans)',
              fontSize: '13px',
              color: '#6a6866',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            New check-in
          </motion.button>
        </motion.div>
      </div>
    )
  }

  // ── Main page ───────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        background: shellBackground,
        display: 'flex',
        flexDirection: 'column',
        ...(messages.length === 0 ? { height: '100vh', overflow: 'hidden' } : { minHeight: '100vh' }),
      }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <div style={{ flexShrink: 0 }}>
          <IconButton href="/home" ariaLabel="Back to home">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8e6e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </IconButton>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ ...eyebrow, color: '#6e6c67', marginBottom: '4px' }}>Companheiro</p>
          <h1
            style={{
              fontFamily: 'var(--font-geist-sans)',
              fontWeight: 700,
              fontSize: 'clamp(22px, 6vw, 34px)',
              color: '#e8e6e0',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Check-in
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, paddingBottom: '2px' }}>
          {messages.length === 0 && !isLoadingHistory && pastCheckIns.length > 0 && (
            <motion.button
              onClick={scrollToHistory}
              whileHover={{ opacity: 0.65 }}
              style={{
                fontFamily: 'var(--font-geist-sans)',
                fontSize: '11px',
                color: '#6e6c67',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
            >
              History ↓
            </motion.button>
          )}
          <ThemeToggleButton theme={theme} onToggle={toggle} />
        </div>
      </motion.div>

      {/* Conversation thread — only shown once a message exists */}
      {messages.length > 0 && (
        <div
          ref={threadRef}
          style={{ flex: 1, overflowY: 'auto', padding: '24px', maxWidth: '560px', margin: '0 auto', width: '100%' }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {messages.map((msg, i) => {
              const isStreamingLast = isProcessing && i === messages.length - 1 && msg.role === 'ai'

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <p
                    style={{
                      fontFamily: 'var(--font-geist-sans)',
                      fontSize: '16px',
                      lineHeight: 1.65,
                      margin: 0,
                      color: msg.role === 'user' ? c.textPrimary : c.textSecondary,
                      fontWeight: msg.role === 'user' ? 500 : 400,
                    }}
                  >
                    {msg.text}
                  </p>
                  {msg.role === 'ai' && msg.text && !isStreamingLast && (
                    <button
                      onClick={() => handleSpeak(msg.text, i)}
                      aria-label={speakingIndex === i ? 'Stop reading aloud' : 'Read aloud'}
                      style={{
                        marginTop: '8px',
                        color: c.textMuted,
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'color 0.2s ease',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = c.textSecondary }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = c.textMuted }}
                    >
                      {speakingIndex === i ? (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        </svg>
                      )}
                    </button>
                  )}
                </motion.div>
              )
            })}

            {isProcessing && (
              <p style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '14px', color: c.textMuted, margin: 0 }}>...</p>
            )}

            {/* Check-in type detection */}
            {hasAiResponded && inferredType && !logSuccess && (
              <div style={{ paddingTop: '16px', borderTop: `1px solid ${c.divider}` }}>
                <AnimatePresence mode="wait">
                  {!showTypeCorrection ? (
                    <motion.div
                      key="detected"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
                    >
                      <span style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '12px', color: c.textMuted }}>
                        Detected as{' '}
                        <span style={{ color: c.textSecondary, fontWeight: 500 }}>
                          {CHECK_IN_TYPE_LABELS[inferredType]}
                        </span>
                      </span>
                      <button
                        onClick={() => setShowTypeCorrection(true)}
                        style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '12px', color: c.textMuted, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                      >
                        Change
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="picker"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
                    >
                      <p style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '12px', color: c.textMuted, margin: 0 }}>
                        What kind of check-in is this?
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {ALL_CHECK_IN_TYPES.map((type) => (
                          <button
                            key={type}
                            onClick={() => { setConfirmedType(type); setShowTypeCorrection(false) }}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '999px',
                              border: `1px solid ${confirmedType === type ? 'transparent' : c.inputBorder}`,
                              backgroundColor: confirmedType === type ? accentColor : 'transparent',
                              color: confirmedType === type ? '#ffffff' : c.textSecondary,
                              fontFamily: 'var(--font-geist-sans)',
                              fontSize: '12px',
                              fontWeight: confirmedType === type ? 600 : 400,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {CHECK_IN_TYPE_LABELS[type]}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Idle state: hero + snap-scroll history */}
      {messages.length === 0 ? (
        <div className="snap-y snap-mandatory" style={{ flex: 1, overflowY: 'auto' }}>
          {/* Hero */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
            className="snap-start snap-always"
            style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          >
            {mainInputArea}
          </motion.div>

          {/* Past check-ins */}
          {pastCheckInsSection}
        </div>
      ) : (
        /* Active conversation: input anchored below the thread */
        <div style={{ padding: '16px 24px 32px', maxWidth: '560px', margin: '0 auto', width: '100%' }}>
          {mainInputArea}
        </div>
      )}
    </div>
  )
}
