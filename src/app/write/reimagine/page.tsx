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

type Style = CSSProperties & Record<string, string | number | undefined>

// Dreamy pastel washes — each swap drags the whole scene to a different
// emotional register. Picked at random on every click, anywhere.
const PALETTES: { bg: string; ink: string; muted: string; accent: string; blobs: [string, string, string] }[] = [
  { bg: '#f5eefc', ink: '#6b3fa0', muted: '#a78bc4', accent: '#8b5cf6', blobs: ['#c4b5fd', '#93c5fd', '#f5d0fe'] },
  { bg: '#fdf1f4', ink: '#9d174d', muted: '#c17a95', accent: '#ec4899', blobs: ['#fecdd3', '#fbcfe8', '#fde68a'] },
  { bg: '#eef6fb', ink: '#0c4a6e', muted: '#5b8aa6', accent: '#0ea5e9', blobs: ['#bae6fd', '#a5f3fc', '#c7d2fe'] },
  { bg: '#eefaf3', ink: '#065f46', muted: '#5fa98c', accent: '#10b981', blobs: ['#99f6e4', '#bbf7d0', '#ddd6fe'] },
  { bg: '#fdf6e9', ink: '#92400e', muted: '#c99a5b', accent: '#f59e0b', blobs: ['#fde68a', '#fed7aa', '#fbcfe8'] },
  { bg: '#eef0fb', ink: '#3730a3', muted: '#8785c9', accent: '#6366f1', blobs: ['#c7d2fe', '#ddd6fe', '#bae6fd'] },
]

const KEYFRAMES = `
@keyframes reimagineWiggle { 0%,100% { transform: translateX(0); } 25% { transform: translateX(2px); } 75% { transform: translateX(-2px); } }
@keyframes reimagineRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes blobDrift1 { 0% { transform: translate(0,0) scale(1); } 50% { transform: translate(8vw, 6vh) scale(1.15); } 100% { transform: translate(-4vw, 10vh) scale(0.95); } }
@keyframes blobDrift2 { 0% { transform: translate(0,0) scale(1); } 50% { transform: translate(-10vw,-4vh) scale(1.1); } 100% { transform: translate(6vw,-8vh) scale(0.9); } }
@keyframes blobDrift3 { 0% { transform: translate(0,0) scale(1); } 50% { transform: translate(5vw,-10vh) scale(1.2); } 100% { transform: translate(-8vw,4vh) scale(1); } }

.reimagine-scene, .reimagine-scene * {
  transition: color 1.4s cubic-bezier(0.4,0,0.2,1), background-color 1.4s cubic-bezier(0.4,0,0.2,1),
    border-color 1.4s cubic-bezier(0.4,0,0.2,1), box-shadow 1.4s cubic-bezier(0.4,0,0.2,1),
    text-shadow 1.4s cubic-bezier(0.4,0,0.2,1);
}
`

const glassBase: Style = {
  backdropFilter: 'blur(22px) saturate(180%)',
  WebkitBackdropFilter: 'blur(22px) saturate(180%)',
  border: '1px solid rgba(255,255,255,0.6)',
  boxShadow:
    '0 8px 32px rgba(31,38,135,0.14), inset 0 1px 1px rgba(255,255,255,0.8), inset 0 -8px 16px -8px rgba(255,255,255,0.4)',
}

function glassPill(tinted = false): Style {
  return {
    ...glassBase,
    backgroundColor: tinted ? 'color-mix(in srgb, var(--accent) 40%, white 68%)' : 'rgba(255,255,255,0.4)',
    borderRadius: '9999px',
  }
}

function glassCard(): Style {
  return {
    ...glassBase,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: '28px',
  }
}

function headingGlow(): Style {
  return {
    color: 'var(--ink)',
    textShadow: '0 0 2px currentColor, 0 0 22px currentColor, 0 0 48px currentColor',
  }
}

function bodyGlow(): Style {
  return {
    color: 'var(--ink)',
    textShadow: '0 0 14px currentColor',
  }
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
  const [paletteIndex, setPaletteIndex] = useState(0)

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

  const pickNextPalette = () => {
    setPaletteIndex((prev) => {
      if (PALETTES.length <= 1) return prev
      let next = prev
      while (next === prev) next = Math.floor(Math.random() * PALETTES.length)
      return next
    })
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

  const palette = PALETTES[paletteIndex]
  const cssVars: Style = {
    '--ink': palette.ink,
    '--muted': palette.muted,
    '--accent': palette.accent,
    '--bg': palette.bg,
    '--blob1': palette.blobs[0],
    '--blob2': palette.blobs[1],
    '--blob3': palette.blobs[2],
  }

  return (
    <div
      className="relative h-screen overflow-hidden reimagine-scene"
      style={{ ...cssVars, backgroundColor: 'var(--bg)' }}
      onClick={(e) => {
        if ((e.target as HTMLElement).tagName === 'TEXTAREA') return
        pickNextPalette()
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Slow-drifting, heavily blurred color washes — the whole point of
          the scene, and the thing that carries each palette swap. */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{
            width: '58vw',
            height: '58vw',
            top: '-14%',
            left: '-16%',
            backgroundColor: 'var(--blob1)',
            filter: 'blur(90px)',
            opacity: 0.6,
            animation: 'blobDrift1 34s ease-in-out infinite alternate',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: '50vw',
            height: '50vw',
            bottom: '-14%',
            right: '-10%',
            backgroundColor: 'var(--blob2)',
            filter: 'blur(90px)',
            opacity: 0.55,
            animation: 'blobDrift2 40s ease-in-out infinite alternate',
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            width: '42vw',
            height: '42vw',
            top: '30%',
            left: '55%',
            backgroundColor: 'var(--blob3)',
            filter: 'blur(100px)',
            opacity: 0.5,
            animation: 'blobDrift3 46s ease-in-out infinite alternate',
          }}
        />
      </div>

      <button
        onClick={() => router.push(`/write?piece_id=${pieceId}`)}
        className="fixed top-6 left-6 z-30 px-4 py-2 text-xs font-bold uppercase tracking-widest"
        style={{ ...glassPill(), color: 'var(--muted)' }}
      >
        ‹ Back
      </button>

      <div ref={threadRef} className="relative z-10 h-full overflow-y-auto px-6 pt-24 pb-44">
        <div className="max-w-xl mx-auto w-full space-y-10">
          {trail.length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center">
              {trail.map((msg, i) => (
                <span
                  key={i}
                  className="inline-block text-xs font-bold px-3 py-1.5"
                  style={{ ...glassPill(), color: msg.role === 'user' ? 'var(--ink)' : 'var(--muted)' }}
                >
                  {msg.content}
                </span>
              ))}
            </div>
          )}

          <div key={stageStartIdx} className="text-center" style={{ animation: 'reimagineRise 0.6s ease-out both' }}>
            <p
              className="text-[11px] font-black uppercase tracking-[0.3em] mb-4"
              style={{ color: 'var(--accent)', textShadow: '0 0 16px currentColor' }}
            >
              The Vision
            </p>

            {stage.map((msg, i) =>
              msg.role === 'assistant' ? (
                <p
                  key={i}
                  className="text-2xl md:text-4xl font-bold leading-[1.2] tracking-tight whitespace-pre-wrap"
                  style={headingGlow()}
                >
                  {msg.content}
                </p>
              ) : (
                <p
                  key={i}
                  className="inline-block text-sm font-medium italic whitespace-pre-wrap mt-4 px-4 py-2"
                  style={{ ...glassPill(), ...bodyGlow() }}
                >
                  {msg.content}
                </p>
              )
            )}

            {isLoading && (
              <p className="text-2xl font-black mt-3" style={{ color: 'var(--muted)' }}>
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
                transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
              }}
            >
              <div className="w-10 h-px mx-auto mb-6" style={{ backgroundColor: 'var(--ink)', opacity: 0.3 }} />
              <p
                className="text-[11px] font-black uppercase tracking-[0.3em] mb-4"
                style={{ color: 'var(--accent)', textShadow: '0 0 16px currentColor' }}
              >
                The Lens
              </p>
              <p className="text-xl md:text-2xl font-bold leading-snug" style={headingGlow()}>
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
                          backgroundColor: active ? 'var(--accent)' : 'transparent',
                          border: `2px solid ${active ? 'var(--accent)' : 'var(--muted)'}`,
                          boxShadow: active ? '0 0 14px var(--accent)' : 'none',
                          transform: active && energyPulsing ? 'scale(1.3)' : 'scale(1)',
                        }}
                      />
                      <span
                        className="text-[9px] font-bold uppercase tracking-widest"
                        style={{ color: active ? 'var(--accent)' : 'var(--muted)' }}
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
                className="mt-7 px-8 py-3 text-xs font-black tracking-[0.25em] uppercase disabled:opacity-50"
                style={{ ...glassPill(true), color: 'var(--ink)' }}
              >
                {isGenerating ? 'Reimagining…' : output ? 'Run it again' : 'Run it'}
              </button>
              <p className="text-xs font-medium mt-3" style={{ color: 'var(--muted)' }}>
                keep talking below any time to change the lens
              </p>
            </div>
          )}

          {(output || isGenerating) && (
            <div>
              <div className="w-10 h-px mx-auto mb-6" style={{ backgroundColor: 'var(--ink)', opacity: 0.3 }} />
              <div className="flex items-center justify-between mb-4">
                <p
                  className="text-[11px] font-black uppercase tracking-[0.3em]"
                  style={{ color: 'var(--accent)', textShadow: '0 0 16px currentColor' }}
                >
                  The Result
                </p>
                {output && !isGenerating && (
                  <button
                    onClick={copyOutput}
                    className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest"
                    style={{ ...glassPill(), color: 'var(--muted)' }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>

              {output ? (
                <div className="p-6" style={glassCard()}>
                  <p className="text-lg leading-relaxed whitespace-pre-wrap" style={bodyGlow()}>
                    {output}
                  </p>
                </div>
              ) : (
                <p className="text-xl font-bold" style={{ color: 'var(--muted)' }}>
                  reimagining···
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-30 px-4 py-2" style={glassPill()}>
          <p className="text-xs font-bold" style={{ color: 'var(--accent)' }}>
            {error}
          </p>
        </div>
      )}

      <div
        className="fixed bottom-0 left-0 right-0 z-20 px-6 py-6"
        style={{ background: `linear-gradient(to top, ${palette.bg} 60%, transparent)` }}
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
            className="flex-1 px-5 py-3.5 text-base font-medium outline-none disabled:opacity-50"
            style={{ ...glassPill(), color: 'var(--ink)', resize: 'none', overflowY: 'auto', maxHeight: '120px' }}
          />

          <button
            onClick={handleRecordToggle}
            disabled={isLoading}
            aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            className={`relative w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              isLoading ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
            }`}
            style={{
              ...glassPill(isRecording),
              boxShadow: isRecording ? `${glassBase.boxShadow}, 0 0 24px var(--accent)` : glassBase.boxShadow,
            }}
          >
            <span
              className="block rounded-full"
              style={{
                width: 9,
                height: 9,
                backgroundColor: isRecording ? 'var(--accent)' : 'var(--ink)',
                animation: isRecording ? 'reimagineWiggle 0.5s ease-in-out infinite' : 'none',
              }}
            />
          </button>

          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isLoading}
            className="px-6 py-3.5 text-xs font-black tracking-widest uppercase flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ ...glassPill(true), color: 'var(--ink)' }}
          >
            Send
          </button>
        </div>

        {isRecording && (
          <p
            className="text-xs font-bold uppercase tracking-widest mt-3 text-center"
            style={{ color: 'var(--accent)', textShadow: '0 0 12px currentColor' }}
          >
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
        <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5eefc' }}>
          <p style={{ color: '#a78bc4' }}>Loading...</p>
        </div>
      }
    >
      <ReimagineContent />
    </Suspense>
  )
}
