'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { readTextStream } from '@/lib/stream-client'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface PendingLens {
  lens: string
  energy: string
}

// Calm -> intense continuum the confirm-card slider moves across. The AI's
// suggested energy word is matched against this to seed the starting
// position; the writer can nudge it before running without re-explaining
// themselves in prose.
const ENERGY_SCALE = ['hushed', 'measured', 'vivid', 'urgent', 'thunderous']

function energyIndexFor(word?: string): number {
  if (!word) return 2
  const idx = ENERGY_SCALE.indexOf(word.toLowerCase())
  return idx === -1 ? 2 : idx
}

function ReimagineContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pieceId = searchParams.get('piece_id')

  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pendingLens, setPendingLens] = useState<PendingLens | null>(null)
  const [lensVisible, setLensVisible] = useState(false)
  const [energyIndex, setEnergyIndex] = useState(2)
  const [energyPulsing, setEnergyPulsing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pieceId) {
      router.push('/project-board')
      return
    }
    fetchAIResponse([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId])

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages, pendingLens, output])

  // The lens card starts hidden and flips visible a beat later so the reveal
  // is an actual CSS transition (scale/fade in) rather than an instant snap.
  useEffect(() => {
    if (!pendingLens) {
      setLensVisible(false)
      return
    }
    setLensVisible(false)
    const t = setTimeout(() => setLensVisible(true), 20)
    return () => clearTimeout(t)
  }, [pendingLens])

  const nudgeEnergy = (index: number) => {
    setEnergyIndex(index)
    setEnergyPulsing(true)
    setTimeout(() => setEnergyPulsing(false), 200)
  }

  const fetchAIResponse = async (conversationHistory: Message[]) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/write/reimagine/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId, messages: conversationHistory }),
      })

      if (!res.ok) {
        setError('Failed to get response')
        return
      }

      setMessages([...conversationHistory, { role: 'assistant', content: '' }])
      const { text, meta } = await readTextStream<{ lens?: string; energy?: string }>(
        res,
        (visibleText) => {
          setMessages([...conversationHistory, { role: 'assistant', content: visibleText }])
        },
        ['<lens>', '<energy>']
      )

      if (!text) {
        setMessages(conversationHistory)
        setError('Failed to get response')
        return
      }

      if (meta?.lens) {
        setPendingLens({ lens: meta.lens, energy: meta.energy || ENERGY_SCALE[2] })
        setEnergyIndex(energyIndexFor(meta.energy))
      }
    } catch (err) {
      console.error('Reimagine converse error:', err)
      setError('Failed to get response. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const startRecording = async () => {
    setError(null)

    const SpeechRecognitionAPI =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRecognitionAPI) {
      setError('Speech recognition not supported in your browser')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new SpeechRecognitionAPI()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsRecording(true)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i][0].isFinal) {
          setInputText((prev) => prev + transcript + ' ')
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      setError(`Error: ${event.error}`)
      setIsRecording(false)
    }

    recognition.onend = () => {
      setIsRecording(false)
    }

    recognitionRef.current = recognition
    recognition.start()
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleRecordToggle = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return

    const userMessage: Message = { role: 'user', content: inputText.trim() }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInputText('')
    setPendingLens(null)

    await fetchAIResponse(updatedMessages)
  }

  const runReimagine = async () => {
    if (!pendingLens || !pieceId || isGenerating) return
    setIsGenerating(true)
    setOutput('')
    try {
      const res = await fetch('/api/write/reimagine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piece_id: pieceId,
          lens_description: pendingLens.lens,
          energy: ENERGY_SCALE[energyIndex],
        }),
      })
      if (!res.ok) {
        setOutput('Something went wrong. Try again.')
        return
      }
      await readTextStream(res, (visibleText) => setOutput(visibleText))
    } catch (err) {
      console.error('Reimagine run error:', err)
      setOutput('Failed to reimagine. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const copyOutput = () => {
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // The "current exchange" (last assistant turn, paired with the user turn
  // that led to it — or, while waiting for a reply, just that latest user
  // turn) gets the big, present-tense stage treatment. Everything older
  // recedes into a quiet trail above it, so the page reads as one unfolding
  // moment rather than a running message log.
  const lastIdx = messages.length - 1
  const last = messages[lastIdx]
  const secondLast = messages[lastIdx - 1]
  const stageStartIdx =
    last?.role === 'assistant' && secondLast?.role === 'user' ? lastIdx - 1 : lastIdx
  const trail = messages.slice(0, Math.max(stageStartIdx, 0))
  const stage = messages.slice(Math.max(stageStartIdx, 0))

  return (
    <div className="flex h-screen flex-col bg-[#111110]">
      <div className="px-6 py-4 border-b border-[#1f1f1d] flex justify-between items-center gap-4">
        <button
          onClick={() => router.push(`/write?piece_id=${pieceId}`)}
          className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] transition-colors whitespace-nowrap"
        >
          ← Back to writing
        </button>
        <p className="text-xs text-[#4a4946] uppercase tracking-widest flex-1 text-center">
          Reimagine
        </p>
        <div className="w-24" />
      </div>

      <div ref={threadRef} className="flex-1 overflow-y-auto px-6 py-10">
        <div className="max-w-2xl mx-auto w-full space-y-10">
          {/* Trail — everything before the current exchange, receded and quiet */}
          {trail.length > 0 && (
            <div className="space-y-2 opacity-60">
              {trail.map((msg, i) => (
                <p
                  key={i}
                  className={`text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user' ? 'text-[#6b6966] text-right' : 'text-[#4a4946]'
                  }`}
                >
                  {msg.content}
                </p>
              ))}
            </div>
          )}

          {/* Stage — the current exchange, large and present */}
          <div className="space-y-5 text-center py-4">
            {stage.map((msg, i) =>
              msg.role === 'assistant' ? (
                <p
                  key={i}
                  className="text-2xl md:text-3xl font-light leading-relaxed tracking-wide text-[#e8e6e1] whitespace-pre-wrap"
                >
                  {msg.content}
                </p>
              ) : (
                <p key={i} className="text-lg italic text-[#a8a6a0] whitespace-pre-wrap">
                  {msg.content}
                </p>
              )
            )}

            {isLoading && (
              <p className="text-2xl font-light text-[#4a4946] animate-pulse">…</p>
            )}
          </div>

          {pendingLens && !isLoading && (
            <div
              className={`w-full rounded-lg border border-[#8B5CF6]/30 bg-[#161614] p-5 space-y-4 transition-all duration-500 ease-out ${
                lensVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
              }`}
              style={{ boxShadow: lensVisible ? '0 0 60px -15px rgba(139,92,246,0.35)' : 'none' }}
            >
              <p className="text-xs text-[#8B5CF6] uppercase tracking-widest">The lens</p>
              <p className="text-lg text-[#e8e6e1] leading-relaxed font-light">{pendingLens.lens}</p>

              <div className="space-y-2 pt-1">
                <div className="flex justify-between text-xs text-[#6b6966]">
                  <span>{ENERGY_SCALE[0]}</span>
                  <span
                    className={`text-[#8B5CF6] capitalize transition-transform duration-200 ${
                      energyPulsing ? 'scale-125' : 'scale-100'
                    }`}
                  >
                    {ENERGY_SCALE[energyIndex]}
                  </span>
                  <span>{ENERGY_SCALE[ENERGY_SCALE.length - 1]}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={ENERGY_SCALE.length - 1}
                  value={energyIndex}
                  onChange={(e) => nudgeEnergy(Number(e.target.value))}
                  className="w-full h-1 rounded-full appearance-none cursor-pointer bg-[#2e2d2a]
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#8B5CF6]
                    [&::-webkit-slider-thumb]:shadow-[0_0_12px_2px_rgba(139,92,246,0.6)] [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#8B5CF6]
                    [&::-moz-range-thumb]:shadow-[0_0_12px_2px_rgba(139,92,246,0.6)]"
                />
              </div>

              <button
                onClick={runReimagine}
                disabled={isGenerating}
                className="w-full py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd] transition-colors disabled:opacity-50"
              >
                {isGenerating ? 'Reimagining…' : output ? 'Run it again' : 'Run it'}
              </button>
              <p className="text-xs text-[#4a4946] text-center">or keep talking below to change the lens</p>

              {(output || isGenerating) && (
                <div className="pt-3 mt-1 border-t border-[#1f1f1d] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#4a4946] uppercase tracking-widest">Result</span>
                    {output && !isGenerating && (
                      <button
                        onClick={copyOutput}
                        className="text-xs text-[#6b6966] hover:text-[#d4d2cd] underline transition-colors"
                      >
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </div>
                  {output ? (
                    <p className="text-base text-[#d4d2cd] leading-relaxed whitespace-pre-wrap">{output}</p>
                  ) : (
                    <p className="text-sm text-[#6a6866]">Reimagining…</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-900/20 border-t border-red-700/30">
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      <div className="px-6 py-6 border-t border-[#1f1f1d] bg-[#111110]">
        <div className="max-w-2xl mx-auto w-full space-y-3">
          <div className="flex gap-3">
            <div className="relative flex-1">
              {!inputText.trim() && !isLoading && (
                <div className="absolute inset-0 rounded blur-xl bg-[#8B5CF6]/20 animate-pulse pointer-events-none" />
              )}
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && inputText.trim() && !isLoading) {
                    handleSend()
                  }
                }}
                placeholder="Tell me what form this is asking to become..."
                disabled={isLoading}
                rows={1}
                className="relative w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded px-4 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#8B5CF6]/60 disabled:opacity-50 transition-colors"
                style={{ resize: 'none', overflowY: 'auto', maxHeight: '150px' }}
              />
            </div>

            <button
              onClick={handleRecordToggle}
              disabled={isLoading}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              className={`
                w-10 h-10 rounded transition-all duration-300 flex items-center justify-center flex-shrink-0
                ${isLoading ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                ${isRecording ? 'bg-[#e8e6e1]' : 'bg-[#1c1c1a] border border-[#2e2d2a] hover:border-[#4a4946]'}
              `}
            >
              {isRecording ? (
                <span className="block w-2.5 h-2.5 bg-[#111110] rounded-sm" />
              ) : (
                <span className="block w-2.5 h-2.5 bg-[#3d3c39] rounded-full" />
              )}
            </button>

            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className="px-4 py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd] disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
            >
              Send
            </button>
          </div>

          {isRecording && (
            <p className="text-xs text-[#4a4946] text-center tracking-widest uppercase">Recording</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ReimaginePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111110] flex items-center justify-center">
          <p className="text-[#4a4946]">Loading...</p>
        </div>
      }
    >
      <ReimagineContent />
    </Suspense>
  )
}
