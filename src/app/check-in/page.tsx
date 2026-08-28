'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { readTextStream } from '@/lib/stream-client'
import { formatDateAsRelative } from '@/lib/dates'

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

    // Pressing the button on the message currently playing stops it.
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
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const startRecording = async () => {
    setError(null)
    setTranscript('')

    // Don't let the AI's read-aloud voice talk over the mic input.
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
        // Punctuate the final transcript after recording ends
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
      if (data.punctuated) {
        setTranscript(data.punctuated)
      }
    } catch (err) {
      console.error('Punctuation error:', err)
    } finally {
      setIsPunctuating(false)
    }
  }

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Streams an AI reply into the message thread, updating the last message
  // as chunks arrive. Returns the parsed meta frame (if any).
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
      // Drop the empty/partial AI bubble on stream failure
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
    // History as it stood before this turn — sent to /respond for continuity
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
        // Initial check-in processing
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

        const meta = await streamAiMessage<{
          signals: Signals
          inferredType: CheckInType
        }>(res, ['<signals>'])

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
      // Full conversation, including the challenge/deeper-work exchange —
      // the root of what's worth journaling about often surfaces there,
      // not in the opening entry alone.
      const fullConversation = messages
        .map((msg) => `${msg.role === 'user' ? 'You' : 'Companheiro'}: ${msg.text}`)
        .join('\n\n')

      const res = await fetch('/api/check-in/journal-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_entry: initialEntry, full_conversation: fullConversation }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to generate prompt')
      }

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
      // Build full conversation from messages
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

      if (!res.ok) {
        throw new Error(data.error ?? 'Logging failed')
      }

      setLogSuccess(true)
    } catch (err) {
      console.error('Log error:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLogging(false)
    }
  }

  const hasAiResponded = messages.some((m) => m.role === 'ai')

  // Shared between the idle (snap-scroll) and active-conversation layouts —
  // defined once so both branches below render the identical element rather
  // than duplicating ~120 lines of JSX.
  const mainInputArea = (
    <div className="w-full max-w-xl space-y-4">
      {/* Record button - always visible */}
      <div className="flex justify-center mb-2">
        <button
          onClick={handleRecordToggle}
          disabled={isProcessing}
          aria-label={isRecording ? 'Stop recording' : 'Start recording'}
          className={`
                w-20 h-20 rounded-full transition-all duration-300 flex items-center justify-center
                ${isProcessing ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                ${isRecording
                  ? 'bg-[#e8e6e1] shadow-[0_0_40px_rgba(232,230,225,0.15)]'
                  : 'bg-[#1c1c1a] border border-[#2e2d2a] hover:border-[#4a4946] hover:bg-[#222220] shadow-[0_0_0px_rgba(232,230,225,0)]  hover:shadow-[0_0_30px_rgba(232,230,225,0.06)]'
                }
              `}
        >
          {isRecording ? (
            <span className="block w-5 h-5 bg-[#111110] rounded-sm" />
          ) : (
            <span className="block w-5 h-5 bg-[#3d3c39] rounded-full" />
          )}
        </button>
      </div>

      {isRecording && (
        <p className="text-center text-xs text-[#4a4946] tracking-widest uppercase">
          Recording
        </p>
      )}

      {isPunctuating && (
        <p className="text-center text-xs text-[#6b6966] tracking-widest uppercase">
          Punctuating...
        </p>
      )}

      {/* Editable transcript */}
      {(transcript || isRecording) && (
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Your words will appear here..."
          rows={4}
          className="w-full bg-[#161614] border border-[#2e2d2a] rounded-lg px-4 py-3 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] resize-none leading-relaxed transition-colors"
        />
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* Send button - when user has text and either AI hasn't responded yet OR they're in a conversation */}
      {transcript.trim() && (
        <button
          onClick={handleSend}
          disabled={isProcessing}
          className="w-full py-3 bg-[#e8e6e1] text-[#111110] text-sm font-medium rounded-lg hover:bg-[#d4d2cd] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isProcessing ? 'Processing...' : 'Send'}
        </button>
      )}

      {/* Journal prompt display */}
      {showJournalPrompt && journalPrompt && (
        <div className="bg-[#161614] border border-[#1f1f1d] rounded-lg p-4 space-y-3">
          <p className="text-xs text-[#4a4946] uppercase tracking-widest">Journal prompt</p>
          <p className="text-base text-[#d4d2cd] leading-relaxed">{journalPrompt}</p>
          <button
            onClick={() => {
              navigator.clipboard.writeText(journalPrompt)
            }}
            className="text-xs text-[#6b6966] underline underline-offset-2 hover:text-[#8c8a87] transition-colors"
          >
            Copy prompt
          </button>
        </div>
      )}

      {/* Quiet action links - after AI has responded */}
      {hasAiResponded && confirmedType && !logSuccess && (
        <div className="flex justify-center gap-6 pt-1">
          <button
            onClick={handleLog}
            disabled={isLogging}
            className="text-xs text-[#4a4946] hover:text-[#8c8a87] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isLogging ? 'Saving...' : 'Log this check-in'}
          </button>
          <button
            onClick={handleJournalPrompt}
            disabled={isLoadingJournal}
            className="text-xs text-[#4a4946] hover:text-[#8c8a87] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {isLoadingJournal ? 'Generating...' : 'Journal prompt'}
          </button>
        </div>
      )}
    </div>
  )

  const pastCheckInsSection = !isLoadingHistory && pastCheckIns.length > 0 && (
    <div
      ref={pastCheckInsRef}
      className="min-h-full snap-start snap-always px-6 py-16 border-t border-[#1f1f1d] max-w-3xl mx-auto w-full"
    >
      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-8">Past check-ins</p>
      <div className="space-y-6">
        {(historyExpanded ? pastCheckIns : pastCheckIns.slice(0, HISTORY_PAGE_SIZE)).map((checkIn) => {
          const isOpen = expandedCheckInIds.has(checkIn.id)
          return (
            <div key={checkIn.id} className="space-y-3">
              <button
                onClick={() => toggleCheckInExpanded(checkIn.id)}
                className="w-full flex items-start justify-between gap-3 text-left group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#4a4946] mb-1">
                    {formatDateAsRelative(checkIn.created_at)}
                    {checkIn.check_in_type ? ` · ${CHECK_IN_TYPE_LABELS[checkIn.check_in_type]}` : ''}
                  </p>
                  <p className="text-base text-[#d4d2cd] leading-relaxed group-hover:text-[#e8e6e1] transition-colors">
                    {previewText(checkIn.raw_entry)}
                  </p>
                </div>
                <span className="text-[#4a4946] text-xs flex-shrink-0 mt-1">{isOpen ? '▾' : '▸'}</span>
              </button>
              {isOpen && (
                <div className="space-y-4 pl-3 border-l border-[#1f1f1d]">
                  {parseConversation(checkIn.full_conversation, checkIn.raw_entry).map((msg, i) => (
                    <p
                      key={i}
                      className={`text-base leading-relaxed ${
                        msg.role === 'user' ? 'text-[#e8e6e1] font-medium' : 'text-[#8c8a87] font-normal'
                      }`}
                    >
                      {msg.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!historyExpanded && pastCheckIns.length > HISTORY_PAGE_SIZE && (
        <button
          onClick={() => setHistoryExpanded(true)}
          className="mt-8 text-xs text-[#6b6966] hover:text-[#d4d2cd] underline underline-offset-2 transition-colors"
        >
          Show older check-ins ({pastCheckIns.length - HISTORY_PAGE_SIZE} more)
        </button>
      )}
    </div>
  )

  if (logSuccess) {
    return (
      <div className="min-h-screen bg-[#111110] flex items-center justify-center">
        <div className="text-center space-y-3 px-6">
          <p className="text-[#e8e6e1] text-lg font-medium">Check-in logged.</p>
          <p className="text-[#6b6966] text-sm">Take it from here.</p>
          <button
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
            className="mt-4 text-[#4a4946] text-sm underline underline-offset-4 hover:text-[#8c8a87] transition-colors"
          >
            New check-in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-[#111110] flex flex-col ${messages.length === 0 ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {/* Back button */}
      <div className="px-6 py-3 border-b border-[#1f1f1d] flex items-center justify-between">
        <button
          onClick={() => router.push('/home')}
          className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] transition-colors"
        >
          ← Home
        </button>
        {messages.length === 0 && !isLoadingHistory && pastCheckIns.length > 0 && (
          <button
            onClick={scrollToHistory}
            className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] transition-colors"
          >
            Past check-ins ↓
          </button>
        )}
      </div>

      {/* Conversation thread */}
      {messages.length > 0 && (
        <div
          ref={threadRef}
          className="flex-1 overflow-y-auto px-6 pt-12 pb-4 max-w-xl mx-auto w-full"
        >
          <div className="space-y-6">
            {messages.map((msg, i) => {
              const isStreamingLast =
                isProcessing && i === messages.length - 1 && msg.role === 'ai'

              return (
              <div key={i}>
                <p
                  className={`text-base leading-relaxed ${
                    msg.role === 'user'
                      ? 'text-[#e8e6e1] font-medium'
                      : 'text-[#8c8a87] font-normal'
                  }`}
                >
                  {msg.text}
                </p>
                {msg.role === 'ai' && msg.text && !isStreamingLast && (
                  <button
                    onClick={() => handleSpeak(msg.text, i)}
                    aria-label={speakingIndex === i ? 'Stop reading aloud' : 'Read aloud'}
                    className="mt-1.5 text-[#4a4946] hover:text-[#8c8a87] transition-colors"
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
              </div>
              )
            })}

            {isProcessing && (
              <div className="text-[#4a4946] text-sm">...</div>
            )}

            {/* Type detection confirmation */}
            {hasAiResponded && inferredType && !logSuccess && (
              <div className="pt-2 border-t border-[#1f1f1d] space-y-3">
                {!showTypeCorrection ? (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-[#4a4946]">
                      Detected as{' '}
                      <span className="text-[#8c8a87] font-medium">
                        {CHECK_IN_TYPE_LABELS[inferredType]}
                      </span>
                    </span>
                    <button
                      onClick={() => setShowTypeCorrection(true)}
                      className="text-xs text-[#4a4946] underline underline-offset-2 hover:text-[#8c8a87] transition-colors"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-[#4a4946]">What kind of check-in is this?</p>
                    <div className="flex flex-wrap gap-2">
                      {ALL_CHECK_IN_TYPES.map((type) => (
                        <button
                          key={type}
                          onClick={() => {
                            setConfirmedType(type)
                            setShowTypeCorrection(false)
                          }}
                          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                            confirmedType === type
                              ? 'bg-[#e8e6e1] text-[#111110] border-[#e8e6e1]'
                              : 'bg-transparent text-[#6b6966] border-[#2e2d2a] hover:border-[#4a4946] hover:text-[#8c8a87]'
                          }`}
                        >
                          {CHECK_IN_TYPE_LABELS[type]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Idle state: hero + past check-ins share a snap-scroll region so any
          scroll, even minimal, commits fully to the next section instead of
          scrolling incrementally. Active-conversation state keeps its own
          internal-scroll-thread layout, untouched below. */}
      {messages.length === 0 ? (
        <div className="flex-1 overflow-y-auto snap-y snap-mandatory">
          <div className="h-full snap-start snap-always flex flex-col items-center justify-center px-6 py-12">
            {mainInputArea}
          </div>
          {pastCheckInsSection}
        </div>
      ) : (
        <div className="px-6 py-6 max-w-xl mx-auto w-full">{mainInputArea}</div>
      )}
    </div>
  )
}
