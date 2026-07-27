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

const ENERGY_SCALE = ['hushed', 'measured', 'vivid', 'thunderous']

function energyIndexFor(word?: string): number {
  if (!word) return 1
  const idx = ENERGY_SCALE.indexOf(word.toLowerCase())
  return idx === -1 ? 1 : idx
}

// A tiger and a snake — paired because they read as the same kind of
// animal (aggressive, coiled, watchful) — extracted and redrawn as bold
// line-art vectors, the same graphic language as the reference: thick
// black outlines, flat cream fill, no gradients or blur.
const CREAM = '#F0E6D3'
const INK = '#1E1B16'
const INK_MUTED = '#6B6355'
const RED = '#C1272D'

const KEYFRAMES = `
@keyframes reimagineSway { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(1.2deg); } }
@keyframes reimagineWiggle { 0%,100% { transform: translateX(0); } 25% { transform: translateX(2px); } 75% { transform: translateX(-2px); } }
@keyframes reimagineRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
`

function Tiger({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 200 180" className={className} style={style} fill="none">
      <path d="M30,55 L55,10 L72,58 Z" fill={CREAM} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path d="M170,55 L145,10 L128,58 Z" fill={CREAM} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <path
        d="M100,20 C150,20 175,60 175,102 C175,146 140,170 100,170 C60,170 25,146 25,102 C25,60 50,20 100,20 Z"
        fill={CREAM}
        stroke={INK}
        strokeWidth="6"
      />
      <path d="M55,45 Q72,60 60,82" stroke={INK} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M145,45 Q128,60 140,82" stroke={INK} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M38,102 Q60,112 44,132" stroke={INK} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M162,102 Q140,112 156,132" stroke={INK} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M84,132 Q100,152 116,132" stroke={INK} strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="74" cy="96" r="7" fill={INK} />
      <circle cx="126" cy="96" r="7" fill={INK} />
      <path d="M84,120 Q100,134 116,120" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M100,106 L100,120" stroke={INK} strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

function Snake({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 300 140" className={className} style={style} fill="none">
      <path
        d="M10,112 C50,18 90,192 130,100 C165,18 200,192 240,100 C258,62 272,80 288,62"
        stroke={RED}
        strokeWidth="26"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M278,52 L306,58 L280,72 Z" fill={RED} />
      <circle cx="291" cy="58" r="3" fill={CREAM} />
    </svg>
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
    setOutput('')

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

  const lastIdx = messages.length - 1
  const last = messages[lastIdx]
  const secondLast = messages[lastIdx - 1]
  const stageStartIdx =
    last?.role === 'assistant' && secondLast?.role === 'user' ? lastIdx - 1 : lastIdx
  const trail = messages.slice(0, Math.max(stageStartIdx, 0))
  const stage = messages.slice(Math.max(stageStartIdx, 0))

  return (
    <div className="relative h-screen overflow-hidden" style={{ background: CREAM }}>
      <style>{KEYFRAMES}</style>

      {/* The paired vectors — tiger and snake, both read as the same kind
          of animal, floating behind the content as a single tableau. */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <Tiger
          className="absolute w-[34vw] max-w-[380px] opacity-95"
          style={{ top: '-4%', right: '-4%', animation: 'reimagineSway 9s ease-in-out infinite' }}
        />
        <Snake
          className="absolute w-[40vw] max-w-[440px] opacity-95"
          style={{ bottom: '6%', left: '-6%' }}
        />
      </div>

      <button
        onClick={() => router.push(`/write?piece_id=${pieceId}`)}
        className="fixed top-6 left-6 z-30 text-xs font-bold uppercase tracking-widest transition-colors"
        style={{ color: INK_MUTED }}
      >
        ‹ Back
      </button>

      <div ref={threadRef} className="relative z-10 h-full overflow-y-auto px-6 pt-24 pb-44">
        <div className="max-w-xl mx-auto w-full space-y-10">
          {trail.length > 0 && (
            <div className="flex flex-wrap gap-3 justify-center">
              {trail.map((msg, i) => (
                <span
                  key={i}
                  className="inline-block text-xs font-bold"
                  style={{ color: msg.role === 'user' ? INK : INK_MUTED }}
                >
                  {msg.content}
                </span>
              ))}
            </div>
          )}

          <div key={stageStartIdx} className="text-center" style={{ animation: 'reimagineRise 0.5s ease-out both' }}>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] mb-4" style={{ color: RED }}>
              The Vision
            </p>

            {stage.map((msg, i) =>
              msg.role === 'assistant' ? (
                <p
                  key={i}
                  className="text-2xl md:text-4xl font-bold leading-[1.2] tracking-tight whitespace-pre-wrap"
                  style={{ color: INK }}
                >
                  {msg.content}
                </p>
              ) : (
                <p key={i} className="text-base font-medium italic whitespace-pre-wrap mt-4" style={{ color: INK_MUTED }}>
                  {msg.content}
                </p>
              )
            )}

            {isLoading && (
              <p className="text-2xl font-black mt-3" style={{ color: INK_MUTED }}>
                ···
              </p>
            )}
          </div>

          {pendingLens && !isLoading && (
            <div
              className="text-center"
              style={{
                opacity: lensVisible ? 1 : 0,
                transform: lensVisible ? 'translateY(0)' : 'translateY(10px)',
                transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
              }}
            >
              <div className="w-10 h-px mx-auto mb-6" style={{ background: INK }} />
              <p className="text-[11px] font-black uppercase tracking-[0.3em] mb-4" style={{ color: RED }}>
                The Lens
              </p>
              <p className="text-xl md:text-2xl font-bold leading-snug" style={{ color: INK }}>
                {pendingLens.lens}
              </p>

              <div className="flex items-center justify-center gap-3 mt-6">
                {ENERGY_SCALE.map((label, i) => {
                  const active = i === energyIndex
                  return (
                    <button key={label} onClick={() => nudgeEnergy(i)} className="flex flex-col items-center gap-2">
                      <span
                        className="rounded-full transition-transform duration-200"
                        style={{
                          width: 14,
                          height: 14,
                          background: active ? RED : 'transparent',
                          border: `2px solid ${active ? RED : INK_MUTED}`,
                          transform: active && energyPulsing ? 'scale(1.3)' : 'scale(1)',
                        }}
                      />
                      <span
                        className="text-[9px] font-bold uppercase tracking-widest"
                        style={{ color: active ? RED : INK_MUTED }}
                      >
                        {label}
                      </span>
                    </button>
                  )
                })}
              </div>

              <button
                onClick={runReimagine}
                disabled={isGenerating}
                className="mt-7 px-8 py-2.5 text-xs font-black tracking-[0.25em] uppercase transition-opacity disabled:opacity-50"
                style={{ background: RED, color: CREAM }}
              >
                {isGenerating ? 'Reimagining…' : output ? 'Run it again' : 'Run it'}
              </button>
              <p className="text-xs font-medium mt-3" style={{ color: INK_MUTED }}>
                keep talking below any time to change the lens
              </p>
            </div>
          )}

          {(output || isGenerating) && (
            <div>
              <div className="w-10 h-px mx-auto mb-6" style={{ background: INK }} />
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] font-black uppercase tracking-[0.3em]" style={{ color: RED }}>
                  The Result
                </p>
                {output && !isGenerating && (
                  <button
                    onClick={copyOutput}
                    className="text-xs font-bold uppercase tracking-widest transition-colors"
                    style={{ color: INK_MUTED }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>

              {output ? (
                <p className="text-lg leading-relaxed whitespace-pre-wrap" style={{ color: INK }}>
                  {output}
                </p>
              ) : (
                <p className="text-xl font-bold" style={{ color: INK_MUTED }}>
                  reimagining···
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-30">
          <p className="text-xs font-bold" style={{ color: RED }}>
            {error}
          </p>
        </div>
      )}

      <div
        className="fixed bottom-0 left-0 right-0 z-20 px-6 py-6"
        style={{ background: `linear-gradient(to top, ${CREAM} 65%, transparent)` }}
      >
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
            className="flex-1 px-4 py-3 text-base font-medium border-0 outline-none disabled:opacity-50"
            style={{ background: RED, color: CREAM, resize: 'none', overflowY: 'auto', maxHeight: '120px' }}
          />

          <button
            onClick={handleRecordToggle}
            disabled={isLoading}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            className={`relative w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
              isLoading ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
            }`}
            style={{ background: isRecording ? RED : 'transparent', border: `2px solid ${isRecording ? RED : INK}` }}
          >
            <span
              className="block rounded-full"
              style={{
                width: 9,
                height: 9,
                background: isRecording ? CREAM : INK,
                animation: isRecording ? 'reimagineWiggle 0.5s ease-in-out infinite' : 'none',
              }}
            />
          </button>

          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            className="px-5 py-3 text-xs font-black tracking-widest uppercase transition-opacity flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: INK, color: CREAM }}
          >
            Send
          </button>
        </div>

        {isRecording && (
          <p className="text-xs font-bold uppercase tracking-widest mt-3 text-center" style={{ color: RED }}>
            Listening
          </p>
        )}
      </div>
    </div>
  )
}

export default function ReimaginePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: CREAM }}>
          <p style={{ color: INK_MUTED }}>Loading...</p>
        </div>
      }
    >
      <ReimagineContent />
    </Suspense>
  )
}
