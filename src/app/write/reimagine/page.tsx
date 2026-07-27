'use client'

import { useState, useRef, useEffect, Suspense, type CSSProperties, type ReactNode } from 'react'
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
@keyframes reimagineDrift { 0%,100% { transform: translate(0,0); } 50% { transform: translate(6px,-6px); } }
@keyframes reimagineDraw { from { stroke-dashoffset: 300; } to { stroke-dashoffset: 0; } }
@keyframes reimagineWiggle { 0%,100% { transform: translateX(0); } 25% { transform: translateX(2px); } 75% { transform: translateX(-2px); } }
@keyframes reimagineRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
`

// Hand-drawn glyph vocabulary standing in for the reference's bestiary — a
// still eye (watching), a wave (steady rhythm), a coiled snake
// (transformation), a sunburst (the reveal). Thick, confident, single-stroke.
function EyeGlyph({ color, className, style }: { color: string; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 60 40" fill="none" className={className} style={style}>
      <path d="M4,20 Q30,2 56,20 Q30,38 4,20 Z" stroke={color} strokeWidth="4" strokeLinejoin="round" />
      <circle cx="30" cy="20" r="7" fill={color} />
    </svg>
  )
}

function WaveGlyph({ color, className, style }: { color: string; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 70 30" fill="none" className={className} style={style}>
      <path d="M2,20 Q12,6 22,20 T42,20 T62,20" stroke={color} strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function SnakeGlyph({ color, className, style, draw }: { color: string; className?: string; style?: CSSProperties; draw?: boolean }) {
  return (
    <svg viewBox="0 0 60 50" fill="none" className={className} style={style}>
      <path
        d="M8,42 C-2,30 8,14 22,16 C34,18 34,30 24,30 C17,30 16,22 22,20"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        style={draw ? { strokeDasharray: 300, strokeDashoffset: 300, animation: 'reimagineDraw 0.9s ease-out forwards' } : undefined}
      />
      <circle cx="21.5" cy="19" r="3" fill={color} />
    </svg>
  )
}

function SunGlyph({ color, className, style }: { color: string; className?: string; style?: CSSProperties }) {
  const rays = 8
  return (
    <svg viewBox="0 0 60 60" fill="none" className={className} style={style}>
      {Array.from({ length: rays }).map((_, i) => {
        const angle = (i / rays) * Math.PI * 2
        const x1 = 30 + Math.cos(angle) * 13
        const y1 = 30 + Math.sin(angle) * 13
        const x2 = 30 + Math.cos(angle) * 27
        const y2 = 30 + Math.sin(angle) * 27
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="5" strokeLinecap="round" />
      })}
      <circle cx="30" cy="30" r="9" fill={color} />
    </svg>
  )
}

const ENERGY_GLYPHS = [EyeGlyph, WaveGlyph, SnakeGlyph, SunGlyph]

function MotifStrip({ color }: { color: string }) {
  return (
    <div className="flex justify-center gap-3">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="rounded-full" style={{ width: 5, height: 5, background: color, opacity: 0.55 }} />
      ))}
    </div>
  )
}

// Museum-placard double border — a thin outer rule, a black gap, a thin
// inner rule, content inside. One accent color per card, never blended.
function SpecimenCard({
  color,
  children,
  className,
}: {
  color: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className} style={{ border: `2px solid ${color}`, padding: 4 }}>
      <div style={{ border: `1px solid ${color}` }} className="p-6 md:p-8">
        {children}
      </div>
    </div>
  )
}

// Letterpress double-strike: a faint offset duplicate behind the main line,
// like print misregistration.
function StruckText({ text, color, ghostColor, className }: { text: string; color: string; ghostColor: string; className?: string }) {
  return (
    <div className="relative w-full">
      <p className={`absolute inset-0 w-full ${className || ''}`} style={{ color: ghostColor, opacity: 0.5, transform: 'translate(3px,3px)' }}>
        {text}
      </p>
      <p className={`relative w-full ${className || ''}`} style={{ color }}>
        {text}
      </p>
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
  const energyColor = ENERGY_COLORS[energyIndex]
  const visionColor = ENERGY_COLORS[trail.length % ENERGY_COLORS.length]

  return (
    <div className="relative h-screen bg-[#111110] overflow-hidden">
      <style>{KEYFRAMES}</style>

      {/* Specimen-wall texture: tiny scattered eye glyphs, very faint,
          echoing the density of the reference collage without competing
          with the cards. */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-[0.08]">
        <EyeGlyph color="#8B5CF6" className="absolute w-12" style={{ top: '8%', left: '6%', animation: 'reimagineDrift 9s ease-in-out infinite' }} />
        <EyeGlyph color="#10B981" className="absolute w-10" style={{ top: '20%', right: '10%', animation: 'reimagineDrift 11s ease-in-out infinite' }} />
        <EyeGlyph color="#F59E0B" className="absolute w-14" style={{ bottom: '18%', left: '12%', animation: 'reimagineDrift 10s ease-in-out infinite' }} />
        <EyeGlyph color="#EF4444" className="absolute w-11" style={{ bottom: '10%', right: '8%', animation: 'reimagineDrift 8s ease-in-out infinite' }} />
        <EyeGlyph color="#8B5CF6" className="absolute w-9" style={{ top: '45%', left: '3%', animation: 'reimagineDrift 12s ease-in-out infinite' }} />
        <EyeGlyph color="#10B981" className="absolute w-9" style={{ top: '55%', right: '4%', animation: 'reimagineDrift 9.5s ease-in-out infinite' }} />
      </div>

      <button
        onClick={() => router.push(`/write?piece_id=${pieceId}`)}
        className="fixed top-6 left-6 z-30 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#a8a6a0] hover:text-[#e8e6e1] transition-colors"
      >
        <span className="w-5 h-5 rounded-full flex items-center justify-center border border-[#4a4946]">‹</span>
        Back
      </button>

      <div ref={threadRef} className="relative z-10 h-full overflow-y-auto px-6 pt-24 pb-44">
        <div className="max-w-xl mx-auto w-full space-y-8">
          {trail.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {trail.map((msg, i) => (
                <span
                  key={i}
                  className={`inline-block text-xs font-bold px-3 py-1 border ${
                    msg.role === 'user' ? 'border-[#e8e6e1] text-[#e8e6e1]' : 'border-[#4a4946] text-[#8c8a87]'
                  }`}
                >
                  {msg.content}
                </span>
              ))}
            </div>
          )}

          <div key={stageStartIdx} style={{ animation: 'reimagineRise 0.5s ease-out both' }}>
            <SpecimenCard color={visionColor} className="mx-auto">
              <div className="flex items-center justify-center gap-2 mb-5">
                <EyeGlyph color={visionColor} className="w-7" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: visionColor }}>
                  I · The Vision
                </span>
              </div>

              {stage.map((msg, i) =>
                msg.role === 'assistant' ? (
                  <StruckText
                    key={i}
                    text={msg.content}
                    color="#e8e6e1"
                    ghostColor={visionColor}
                    className="text-2xl md:text-4xl font-bold leading-[1.15] tracking-tight text-center whitespace-pre-wrap"
                  />
                ) : (
                  <p key={i} className="text-base font-medium text-[#a8a6a0] text-center italic whitespace-pre-wrap mt-3">
                    {msg.content}
                  </p>
                )
              )}

              {isLoading && <p className="text-2xl font-black text-[#4a4946] text-center mt-3">···</p>}
            </SpecimenCard>
          </div>

          {pendingLens && !isLoading && (
            <div
              className="relative"
              style={{
                opacity: lensVisible ? 1 : 0,
                transform: lensVisible ? 'translateY(0)' : 'translateY(10px)',
                transition: 'opacity 0.4s ease-out, transform 0.4s ease-out',
              }}
            >
              <SnakeGlyph
                color={energyColor}
                draw={lensVisible}
                className="absolute w-16 -top-8 -left-6 opacity-90 pointer-events-none hidden sm:block"
              />
              <SpecimenCard color={energyColor} className="mx-auto">
                <div className="flex items-center justify-center gap-2 mb-5">
                  <SnakeGlyph color={energyColor} className="w-7" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: energyColor }}>
                    II · The Lens
                  </span>
                </div>

                <p className="text-xl md:text-2xl font-bold leading-snug text-[#e8e6e1] text-center">{pendingLens.lens}</p>

                <div className="my-6">
                  <MotifStrip color={energyColor} />
                </div>

                <div className="flex items-center justify-center gap-6">
                  {ENERGY_SCALE.map((label, i) => {
                    const Glyph = ENERGY_GLYPHS[i]
                    const active = i === energyIndex
                    return (
                      <button key={label} onClick={() => nudgeEnergy(i)} className="flex flex-col items-center gap-2">
                        <Glyph
                          color={active ? ENERGY_COLORS[i] : '#4a4946'}
                          className="w-9"
                          style={{ transform: active && energyPulsing ? 'scale(1.3)' : 'scale(1)', transition: 'transform 0.2s' }}
                        />
                        <span
                          className="text-[9px] font-bold uppercase tracking-widest"
                          style={{ color: active ? ENERGY_COLORS[i] : '#4a4946' }}
                        >
                          {label}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex justify-center mt-7">
                  <button
                    onClick={runReimagine}
                    disabled={isGenerating}
                    className="px-8 py-2.5 text-xs font-black tracking-[0.25em] uppercase transition-colors disabled:opacity-50"
                    style={{ border: `2px solid ${energyColor}`, color: energyColor, background: 'transparent' }}
                  >
                    {isGenerating ? 'Reimagining…' : output ? 'Run it again' : 'Run it'}
                  </button>
                </div>
                <p className="text-xs font-medium text-[#4a4946] text-center mt-3">keep talking below any time to change the lens</p>
              </SpecimenCard>
            </div>
          )}

          {(output || isGenerating) && (
            <SpecimenCard color={energyColor} className="mx-auto">
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-2">
                  <SunGlyph color={energyColor} className="w-7" />
                  <span className="text-[10px] font-black uppercase tracking-[0.3em]" style={{ color: energyColor }}>
                    III · The Result
                  </span>
                </div>
                {output && !isGenerating && (
                  <button
                    onClick={copyOutput}
                    className="text-xs font-bold uppercase tracking-widest text-[#8c8a87] hover:text-[#e8e6e1] transition-colors flex-shrink-0"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>

              {output ? (
                <p className="text-lg leading-relaxed text-[#d4d2cd] whitespace-pre-wrap">{output}</p>
              ) : (
                <p className="text-xl font-bold text-[#4a4946]">reimagining···</p>
              )}
            </SpecimenCard>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-30">
          <p className="text-xs font-bold px-3 py-1.5 border border-[#EF4444]" style={{ color: '#EF4444' }}>
            {error}
          </p>
        </div>
      )}

      <div
        className="fixed bottom-0 left-0 right-0 z-20 px-6 py-6"
        style={{ background: 'linear-gradient(to top, #111110 65%, transparent)' }}
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
            className="flex-1 bg-[#111110] border border-[#2e2d2a] px-4 py-2.5 text-base font-medium text-[#e8e6e1] placeholder:text-[#4a4946] disabled:opacity-50 focus:outline-none focus:border-[#8c8a87]"
            style={{ resize: 'none', overflowY: 'auto', maxHeight: '120px' }}
          />

          <button
            onClick={handleRecordToggle}
            disabled={isLoading}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            className={`relative w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
              isLoading ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
            }`}
            style={{ border: `2px solid ${isRecording ? '#8B5CF6' : '#4a4946'}` }}
          >
            <span
              className="block rounded-full"
              style={{
                width: 9,
                height: 9,
                background: isRecording ? '#8B5CF6' : '#8c8a87',
                animation: isRecording ? 'reimagineWiggle 0.5s ease-in-out infinite' : 'none',
              }}
            />
          </button>

          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            className="px-5 py-2.5 text-xs font-black tracking-widest uppercase transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ border: '2px solid #e8e6e1', color: '#e8e6e1', background: 'transparent' }}
          >
            Send
          </button>
        </div>

        {isRecording && <p className="text-xs font-bold text-[#8B5CF6] uppercase tracking-widest mt-3 text-center">Listening</p>}
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
