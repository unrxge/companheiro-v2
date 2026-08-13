'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { readTextStream } from '@/lib/stream-client'

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
  const [isLoadingChallenge, setIsLoadingChallenge] = useState(false)
  const [engagedWithChallenge, setEngagedWithChallenge] = useState(false)
  const [showLogButton, setShowLogButton] = useState(false)
  const [initialEntry, setInitialEntry] = useState('')
  const [isLoadingJournal, setIsLoadingJournal] = useState(false)
  const [journalPrompt, setJournalPrompt] = useState('')
  const [showJournalPrompt, setShowJournalPrompt] = useState(false)
  const [isPunctuating, setIsPunctuating] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages])

  const startRecording = async () => {
    setError(null)
    setTranscript('')

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

    try {
      // If they've been challenged, just get a response (no signal extraction)
      if (showLogButton) {
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

  const handleChallenge = async () => {
    setIsLoadingChallenge(true)
    setError(null)

    try {
      // The transcript box is cleared after the initial send, so challenge
      // works from the logged entry, not the (usually empty) input box.
      const challengeInput = transcript.trim() || initialEntry
      const res = await fetch('/api/check-in/deeper-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: challengeInput }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to process')
      }

      setEngagedWithChallenge(true)
      setShowLogButton(true)
      setTranscript('')
      await streamAiMessage(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLoadingChallenge(false)
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
          engaged_with_deeper_work: engagedWithChallenge,
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
              setEngagedWithChallenge(false)
              setShowLogButton(false)
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
    <div className="min-h-screen bg-[#111110] flex flex-col">
      {/* Back button */}
      <div className="px-6 py-3 border-b border-[#1f1f1d]">
        <button
          onClick={() => router.push('/home')}
          className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] transition-colors"
        >
          ← Home
        </button>
      </div>

      {/* Conversation thread */}
      {messages.length > 0 && (
        <div
          ref={threadRef}
          className="flex-1 overflow-y-auto px-6 pt-12 pb-4 max-w-xl mx-auto w-full"
        >
          <div className="space-y-6">
            {messages.map((msg, i) => (
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
              </div>
            ))}

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

      {/* Main input area */}
      <div
        className={`${
          messages.length === 0
            ? 'flex-1 flex flex-col items-center justify-center px-6 py-12'
            : 'px-6 py-6 max-w-xl mx-auto w-full'
        }`}
      >
        <div className="w-full max-w-xl space-y-4">
          {/* Record button - always visible */}
          <div className="flex justify-center mb-2">
            <button
              onClick={handleRecordToggle}
              disabled={isProcessing || isLoadingChallenge}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              className={`
                w-20 h-20 rounded-full transition-all duration-300 flex items-center justify-center
                ${isProcessing || isLoadingChallenge ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
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
          {transcript.trim() && (!hasAiResponded || showLogButton) && (
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

          {/* Action buttons - after AI has responded */}
          {hasAiResponded && confirmedType && !logSuccess && (
            <div className="space-y-2">
              {!showLogButton ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleLog}
                    disabled={isLogging}
                    className="flex-1 py-3 bg-[#e8e6e1] text-[#111110] text-sm font-medium rounded-lg hover:bg-[#d4d2cd] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isLogging ? 'Saving...' : 'Log this check-in'}
                  </button>
                  <button
                    onClick={handleChallenge}
                    disabled={isLoadingChallenge}
                    className="flex-1 py-3 bg-transparent border border-[#2e2d2a] text-[#8c8a87] text-sm font-medium rounded-lg hover:border-[#4a4946] hover:text-[#d4d2cd] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isLoadingChallenge ? 'Processing...' : 'Challenge me'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleLog}
                    disabled={isLogging}
                    className="flex-1 py-3 bg-[#e8e6e1] text-[#111110] text-sm font-medium rounded-lg hover:bg-[#d4d2cd] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isLogging ? 'Saving...' : 'Log this check-in'}
                  </button>
                  <button
                    onClick={handleJournalPrompt}
                    disabled={isLoadingJournal}
                    className="flex-1 py-3 bg-transparent border border-[#2e2d2a] text-[#8c8a87] text-sm font-medium rounded-lg hover:border-[#4a4946] hover:text-[#d4d2cd] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isLoadingJournal ? 'Generating...' : 'Journal prompt'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
