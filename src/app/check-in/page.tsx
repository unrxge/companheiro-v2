'use client'

import { useState, useRef, useEffect } from 'react'

type CheckInType = 'morning' | 'after_work' | 'evening' | 'moment'
type ArcType = 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration'
type EnergyLevel = 'low' | 'medium' | 'high'
type PatternType = 'energy' | 'arc' | 'creative'

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

interface DroughtObservation {
  observation: string | null
  pattern_type?: PatternType
}

const CHECK_IN_TYPE_LABELS: Record<CheckInType, string> = {
  morning: 'Morning',
  after_work: 'After work',
  evening: 'Evening',
  moment: 'A moment',
}

const ALL_CHECK_IN_TYPES: CheckInType[] = ['morning', 'after_work', 'evening', 'moment']

export default function CheckInPage() {
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
  const [observation, setObservation] = useState<DroughtObservation | null>(null)
  const [isLoadingObservation, setIsLoadingObservation] = useState(true)
  const [showResponse, setShowResponse] = useState(false)
  const [userResponse, setUserResponse] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)
  const [observationDismissed, setObservationDismissed] = useState(false)

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

  useEffect(() => {
    const fetchObservation = async () => {
      try {
        const res = await fetch('/api/drought/analyse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        const data: DroughtObservation = await res.json()
        setObservation(data)
      } catch (err) {
        console.error('Failed to fetch observation:', err)
      } finally {
        setIsLoadingObservation(false)
      }
    }

    fetchObservation()
  }, [])

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

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const handleSend = async () => {
    if (!transcript.trim()) return
    setIsProcessing(true)
    setError(null)

    const userText = transcript.trim()
    setMessages((prev) => [...prev, { role: 'user', text: userText }])

    try {
      const res = await fetch('/api/check-in/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: userText }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Processing failed')
      }

      setMessages((prev) => [...prev, { role: 'ai', text: data.aiResponse }])
      setSignals(data.signals)
      setInferredType(data.inferredType)
      setConfirmedType(data.inferredType)

      if (data.cleanedTranscript) {
        setTranscript(data.cleanedTranscript)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleLog = async () => {
    if (!signals || !confirmedType || !transcript.trim()) return
    setIsLogging(true)
    setError(null)

    try {
      const res = await fetch('/api/check-in/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_entry: transcript.trim(),
          energy: signals.energy,
          inner_weather: signals.inner_weather,
          creative_readiness: signals.creative_readiness,
          arc_texture: signals.arc_texture,
          check_in_type: confirmedType,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Logging failed')
      }

      setLogSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsLogging(false)
    }
  }

  const handleObservationConfirm = async (felt_right: boolean) => {
    if (!observation?.observation || !observation?.pattern_type) return
    setIsConfirming(true)

    try {
      const res = await fetch('/api/drought/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          observation: observation.observation,
          pattern_type: observation.pattern_type,
          confirmed_by_user: felt_right,
          user_response: felt_right ? undefined : userResponse.trim(),
          action_taken: 'none',
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to save response')
      }

      setObservationDismissed(true)
    } catch (err) {
      console.error('Error confirming observation:', err)
    } finally {
      setIsConfirming(false)
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
                  className={`text-sm leading-relaxed ${
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
          {/* Drought observation card */}
          {observation?.observation && !observationDismissed && !isLoadingObservation && (
            <div className="bg-[#161614] border border-[#1f1f1d] rounded-lg p-4 mb-2 space-y-3">
              <p className="text-sm text-[#d4d2cd] leading-relaxed">
                {observation.observation}
              </p>

              {!showResponse ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleObservationConfirm(true)}
                    disabled={isConfirming}
                    className="flex-1 py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    That feels right
                  </button>
                  <button
                    onClick={() => setShowResponse(true)}
                    disabled={isConfirming}
                    className="flex-1 py-2 bg-transparent border border-[#2e2d2a] text-[#8c8a87] text-xs font-medium rounded transition-colors hover:border-[#4a4946] hover:text-[#d4d2cd] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Not quite
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={userResponse}
                    onChange={(e) => {
                      setUserResponse(e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                    }}
                    placeholder="What's actually going on..."
                    rows={1}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] transition-colors"
                    style={{ resize: 'none', overflowY: 'auto', maxHeight: '150px' }}
                  />
                  <button
                    onClick={() => handleObservationConfirm(false)}
                    disabled={isConfirming || !userResponse.trim()}
                    className="w-full py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    {isConfirming ? 'Saving...' : 'Send'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Record button */}
          <div className={`${messages.length === 0 ? 'flex justify-center mb-6' : 'flex justify-center mb-2'}`}>
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

          {/* Editable transcript */}
          {(transcript || isRecording) && (
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Your words will appear here..."
              rows={4}
              className="w-full bg-[#161614] border border-[#2e2d2a] rounded-lg px-4 py-3 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] resize-none leading-relaxed transition-colors"
            />
          )}

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          {/* Send button */}
          {transcript.trim() && !hasAiResponded && (
            <button
              onClick={handleSend}
              disabled={isProcessing}
              className="w-full py-3 bg-[#e8e6e1] text-[#111110] text-sm font-medium rounded-lg hover:bg-[#d4d2cd] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Processing...' : 'Send'}
            </button>
          )}

          {/* Log button */}
          {hasAiResponded && confirmedType && !logSuccess && (
            <button
              onClick={handleLog}
              disabled={isLogging}
              className="w-full py-3 bg-[#e8e6e1] text-[#111110] text-sm font-medium rounded-lg hover:bg-[#d4d2cd] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isLogging ? 'Saving...' : 'Log this check-in'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
