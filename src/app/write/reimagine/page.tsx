'use client'

import { useState, useRef, useEffect, Suspense, type CSSProperties } from 'react'
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

// Four discrete points mapped 1:1 onto the app's four accents.
const ENERGY_SCALE = ['hushed', 'measured', 'vivid', 'thunderous']
const ENERGY_COLORS = ['#8B5CF6', '#10B981', '#F59E0B', '#EF4444']

function energyIndexFor(word?: string): number {
  if (!word) return 1
  const idx = ENERGY_SCALE.indexOf(word.toLowerCase())
  return idx === -1 ? 1 : idx
}

const KEYFRAMES = `
@keyframes reimagineFloatA { 0%,100% { transform: translate(0,0) rotate(0deg); } 50% { transform: translate(2vw,3vh) rotate(4deg); } }
@keyframes reimagineFloatB { 0%,100% { transform: translate(0,0) rotate(0deg); } 50% { transform: translate(-3vw,-2vh) rotate(-5deg); } }
@keyframes reimagineDraw { from { stroke-dashoffset: 1000; } to { stroke-dashoffset: 0; } }
@keyframes reimagineWiggle { 0%,100% { transform: translateX(0); } 25% { transform: translateX(2px); } 75% { transform: translateX(-2px); } }
@keyframes reimagineRise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes reimaginePop { from { opacity: 0; transform: scale(0.85) rotate(-3deg); } to { opacity: 1; transform: scale(1) rotate(0deg); } }
`

// A single continuous hand-drawn ribbon — the recurring motif tying every
// surface of this page together, echoing the reference's squiggle doodles.
function Squiggle({
  color,
  className,
  style,
  draw,
}: {
  color: string
  className?: string
  style?: CSSProperties
  draw?: boolean
}) {
  return (
    <svg viewBox="0 0 400 200" fill="none" className={className} style={style}>
      <path
        d="M10,100 C50,15 90,185 130,95 C170,5 210,195 250,100 C280,25 320,165 390,80"
        stroke={color}
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={
          draw
            ? { strokeDasharray: 1000, strokeDashoffset: 1000, animation: 'reimagineDraw 1.1s ease-out forwards' }
            : undefined
        }
      />
    </svg>
  )
}

function Dots({ color, className }: { color: string; className?: string }) {
  return (
    <div className={`relative ${className || ''}`} style={{ width: 34, height: 34 }}>
      <span className="absolute rounded-full" style={{ width: 10, height: 10, background: color, top: 0, left: 12 }} />
      <span className="absolute rounded-full" style={{ width: 10, height: 10, background: color, top: 12, left: 0 }} />
      <span className="absolute rounded-full" style={{ width: 10, height: 10, background: color, top: 12, left: 24 }} />
      <span className="absolute rounded-full" style={{ width: 10, height: 10, background: color, top: 24, left: 12 }} />
    </div>
  )
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
  const [energyIndex, setEnergyIndex] = useState(1)
  const [energyPulsing, setEnergyPulsing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [output, setOutput] = useState('')
  const [viewingResult, setViewingResult] = useState(false)
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
        setPendingLens({ lens: meta.lens, energy: meta.energy || ENERGY_SCALE[1] })
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
    setViewingResult(false)

    await fetchAIResponse(updatedMessages)
  }

  const runReimagine = async () => {
    if (!pendingLens || !pieceId || isGenerating) return
    setIsGenerating(true)
    setViewingResult(true)
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

  const lastIdx = messages.length - 1
  const last = messages[lastIdx]
  const secondLast = messages[lastIdx - 1]
  const stageStartIdx =
    last?.role === 'assistant' && secondLast?.role === 'user' ? lastIdx - 1 : lastIdx
  const trail = messages.slice(0, Math.max(stageStartIdx, 0))
  const stage = messages.slice(Math.max(stageStartIdx, 0))
  const energyColor = ENERGY_COLORS[energyIndex]

  return (
    <div className="relative h-screen bg-[#111110] overflow-hidden">
      <style>{KEYFRAMES}</style>

      {/* Ambient decoration — soft organic blobs + a drifting doodle, the
          same signature squiggle reused everywhere on this page. */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute opacity-90"
          style={{
            width: '34vw',
            height: '30vw',
            top: '-10%',
            left: '-8%',
            background: '#8B5CF6',
            borderRadius: '62% 38% 55% 45% / 45% 55% 45% 55%',
            animation: 'reimagineFloatA 20s ease-in-out infinite',
          }}
        />
        <div
          className="absolute opacity-90"
          style={{
            width: '26vw',
            height: '24vw',
            bottom: '-8%',
            right: '-6%',
            background: '#F59E0B',
            borderRadius: '48% 52% 40% 60% / 55% 45% 60% 40%',
            animation: 'reimagineFloatB 24s ease-in-out infinite',
          }}
        />
        <Squiggle
          color="#10B981"
          className="absolute w-[38vw] max-w-[420px] opacity-70"
          style={{ bottom: '6%', left: '8%', animation: 'reimagineFloatA 26s ease-in-out infinite' }}
        />
      </div>
      <div className="fixed top-[14%] right-[8%] z-0 opacity-80 hidden md:block">
        <Dots color="#EF4444" />
      </div>

      <button
        onClick={() => router.push(`/write?piece_id=${pieceId}`)}
        className="fixed top-6 left-6 z-30 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#a8a6a0] hover:text-[#e8e6e1] transition-colors"
      >
        <span className="w-5 h-5 rounded-full flex items-center justify-center bg-[#1f1f1d]">‹</span>
        Back
      </button>

      {!viewingResult ? (
        <div ref={threadRef} className="relative z-10 h-full overflow-y-auto px-6 py-24">
          <div className="max-w-2xl mx-auto w-full space-y-6">
            {trail.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center">
                {trail.map((msg, i) => (
                  <span
                    key={i}
                    className={`inline-block text-xs font-bold px-3 py-1.5 rounded-full ${
                      msg.role === 'user' ? 'bg-[#e8e6e1] text-[#111110]' : 'bg-[#1f1f1d] text-[#a8a6a0]'
                    }`}
                  >
                    {msg.content}
                  </span>
                ))}
              </div>
            )}

            <div key={stageStartIdx} className="space-y-5" style={{ animation: 'reimagineRise 0.5s ease-out both' }}>
              <div className="flex justify-center">
                <span
                  className="inline-block text-[10px] font-black uppercase tracking-[0.3em] px-4 py-1.5 rounded-full"
                  style={{ background: '#8B5CF6', color: '#111110' }}
                >
                  01 · Vision
                </span>
              </div>

              {stage.map((msg, i) =>
                msg.role === 'assistant' ? (
                  <div
                    key={i}
                    className="mx-auto rounded-[2rem] px-8 py-10 md:px-12 md:py-14"
                    style={{ background: '#8B5CF6' }}
                  >
                    <p className="text-3xl md:text-5xl font-bold leading-[1.1] tracking-tight text-[#111110] text-center whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                ) : (
                  <div key={i} className="flex justify-center">
                    <p
                      className="inline-block text-base font-bold px-4 py-2 rounded-full bg-[#1f1f1d] text-[#e8e6e1] whitespace-pre-wrap"
                    >
                      {msg.content}
                    </p>
                  </div>
                )
              )}

              {isLoading && (
                <p className="text-3xl font-black text-[#4a4946] text-center">···</p>
              )}
            </div>

            {pendingLens && !isLoading && (
              <div className="relative max-w-xl mx-auto pt-4">
                <Squiggle
                  color={energyColor}
                  className="absolute w-40 -top-6 -left-10 opacity-80 pointer-events-none hidden sm:block"
                  draw={lensVisible}
                />
                <div
                  className="relative rounded-[2rem] p-7 md:p-9 space-y-6 text-center"
                  style={{
                    background: energyColor,
                    opacity: lensVisible ? 1 : 0,
                    transform: lensVisible ? 'scale(1) rotate(0deg)' : 'scale(0.85) rotate(-3deg)',
                    transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
                  }}
                >
                  <span className="inline-block text-[10px] font-black uppercase tracking-[0.3em] px-4 py-1.5 rounded-full bg-[#111110] text-[#e8e6e1]">
                    02 · The Lens
                  </span>
                  <p className="text-xl md:text-2xl font-bold leading-snug text-[#111110]">{pendingLens.lens}</p>

                  <div className="flex items-center justify-center gap-4 pt-1">
                    {ENERGY_SCALE.map((label, i) => (
                      <button key={label} onClick={() => nudgeEnergy(i)} className="flex flex-col items-center gap-1.5">
                        <span
                          className="rounded-full transition-transform duration-200"
                          style={{
                            width: i === energyIndex ? 22 : 16,
                            height: i === energyIndex ? 22 : 16,
                            background: i === energyIndex ? '#111110' : 'rgba(17,17,16,0.35)',
                            transform: i === energyIndex && energyPulsing ? 'scale(1.3)' : 'scale(1)',
                          }}
                        />
                        <span
                          className="text-[9px] font-bold uppercase tracking-widest"
                          style={{ color: i === energyIndex ? '#111110' : 'rgba(17,17,16,0.5)' }}
                        >
                          {label}
                        </span>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={runReimagine}
                    disabled={isGenerating}
                    className="px-9 py-3 rounded-full text-xs font-black tracking-[0.25em] uppercase transition-transform hover:scale-105 disabled:opacity-50"
                    style={{ background: '#111110', color: '#e8e6e1' }}
                  >
                    {isGenerating ? 'Reimagining…' : 'Run it ▸'}
                  </button>
                  <p className="text-xs font-medium" style={{ color: 'rgba(17,17,16,0.6)' }}>
                    or keep talking below to change the lens
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative z-10 h-full overflow-y-auto">
          <div className="px-6 py-16 max-w-2xl mx-auto" style={{ animation: 'reimagineRise 0.5s ease-out both' }}>
            <div className="flex items-center justify-between mb-8">
              <button
                onClick={() => setViewingResult(false)}
                className="text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-[#1f1f1d] text-[#a8a6a0] hover:text-[#e8e6e1] transition-colors"
              >
                ‹ Tune it differently
              </button>
              {output && !isGenerating && (
                <button
                  onClick={copyOutput}
                  className="text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded-full bg-[#1f1f1d] text-[#a8a6a0] hover:text-[#e8e6e1] transition-colors"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>

            <div className="flex justify-center mb-8">
              <span
                className="inline-block text-[10px] font-black uppercase tracking-[0.3em] px-4 py-1.5 rounded-full"
                style={{ background: energyColor, color: '#111110' }}
              >
                03 · The Result
              </span>
            </div>

            {output ? (
              <p className="text-lg md:text-xl leading-relaxed text-[#d4d2cd] whitespace-pre-wrap">{output}</p>
            ) : (
              <p className="text-xl font-bold text-[#4a4946] text-center">reimagining···</p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-30">
          <p className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#1f1f1d]" style={{ color: '#EF4444' }}>
            {error}
          </p>
        </div>
      )}

      {!viewingResult && (
        <div className="fixed bottom-0 left-0 right-0 z-20 px-6 py-6">
          <div className="max-w-xl mx-auto w-full flex items-center gap-3">
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
              placeholder="say what it wants to become…"
              disabled={isLoading}
              rows={1}
              className="flex-1 bg-[#1c1c1a] rounded-full px-5 py-3 text-base font-medium text-[#e8e6e1] placeholder:text-[#4a4946] disabled:opacity-50 focus:outline-none"
              style={{ resize: 'none', overflowY: 'auto', maxHeight: '120px' }}
            />

            <button
              onClick={handleRecordToggle}
              disabled={isLoading}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              className={`relative w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                isLoading ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
              }`}
              style={{ background: isRecording ? '#8B5CF6' : '#1c1c1a' }}
            >
              <span
                className="block rounded-full"
                style={{
                  width: 10,
                  height: 10,
                  background: isRecording ? '#111110' : '#8c8a87',
                  animation: isRecording ? 'reimagineWiggle 0.5s ease-in-out infinite' : 'none',
                }}
              />
            </button>

            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className="px-6 py-3 rounded-full text-xs font-black tracking-widest uppercase transition-transform hover:scale-105 flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: '#e8e6e1', color: '#111110' }}
            >
              Send
            </button>
          </div>

          {isRecording && <p className="text-xs font-bold text-[#8B5CF6] uppercase tracking-widest mt-3 text-center">Listening</p>}
        </div>
      )}
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
