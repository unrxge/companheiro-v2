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

// Four discrete points mapped 1:1 onto the app's four accents — Bauhaus
// keeps to a small disciplined palette rather than a continuous gradient.
const ENERGY_SCALE = ['hushed', 'measured', 'vivid', 'thunderous']
const ENERGY_COLORS = ['#8B5CF6', '#10B981', '#F59E0B', '#EF4444']

function energyIndexFor(word?: string): number {
  if (!word) return 1
  const idx = ENERGY_SCALE.indexOf(word.toLowerCase())
  return idx === -1 ? 1 : idx
}

const KEYFRAMES = `
@keyframes reimagineOrbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes reimagineSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes reimagineSlide { 0%,100% { transform: translateY(0); } 50% { transform: translateY(24px); } }
@keyframes reimagineRise { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes reimagineSnap { from { opacity: 0; transform: scale(0.9) rotate(-2deg); } to { opacity: 1; transform: scale(1) rotate(0deg); } }
`

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

      {/* Structural grid rule — Swiss/Bauhaus functional grid line */}
      <div className="hidden md:block fixed left-[58%] top-0 bottom-0 w-px bg-[#2e2d2a] z-0" />

      {/* Geometric composition — flat, hard-edged, disciplined 4-color set.
          No blur, no gradients, no glow: solid shapes as design elements. */}
      <div className="hidden md:block fixed right-0 top-0 bottom-0 w-[42%] pointer-events-none z-0 overflow-hidden">
        <div
          className="absolute rounded-full"
          style={{ width: '30vw', height: '30vw', top: '-9%', right: '-8%', background: '#8B5CF6' }}
        />
        <div
          className="absolute rounded-full"
          style={{ width: '30vw', height: '30vw', top: '-9%', right: '-8%', animation: 'reimagineOrbit 16s linear infinite' }}
        >
          <div className="absolute" style={{ width: 18, height: 18, top: 0, left: '50%', marginLeft: -9, background: '#F59E0B' }} />
        </div>
        <div
          className="absolute rounded-full"
          style={{ width: '18vw', height: '18vw', top: '38%', right: '10%', border: '4px solid #10B981' }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '14%',
            left: '10%',
            width: 0,
            height: 0,
            borderLeft: '38px solid transparent',
            borderRight: '38px solid transparent',
            borderBottom: '66px solid #EF4444',
            animation: 'reimagineSpin 30s linear infinite',
          }}
        />
        <div
          className="absolute"
          style={{ width: '3px', height: '140px', bottom: '4%', right: '32%', background: '#e8e6e1', transform: 'rotate(28deg)', animation: 'reimagineSlide 5s ease-in-out infinite' }}
        />
      </div>

      <button
        onClick={() => router.push(`/write?piece_id=${pieceId}`)}
        className="fixed top-6 left-6 md:left-[6%] z-30 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#8c8a87] hover:text-[#e8e6e1] transition-colors"
      >
        <span className="w-2 h-2 bg-[#e8e6e1]" />
        Back
      </button>

      {!viewingResult ? (
        <div ref={threadRef} className="relative z-10 h-full overflow-y-auto px-6 md:pl-[6%] md:pr-[44%] py-24">
          <div className="max-w-xl w-full space-y-8">
            {trail.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {trail.map((msg, i) => (
                  <span
                    key={i}
                    className={`inline-block text-xs font-bold px-2.5 py-1 border-2 ${
                      msg.role === 'user' ? 'border-[#e8e6e1] text-[#e8e6e1]' : 'border-[#4a4946] text-[#8c8a87]'
                    }`}
                  >
                    {msg.content}
                  </span>
                ))}
              </div>
            )}

            <div key={stageStartIdx} className="space-y-4" style={{ animation: 'reimagineRise 0.5s ease-out both' }}>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4" style={{ background: '#8B5CF6' }} />
                <span className="text-xs font-black uppercase tracking-[0.3em] text-[#8B5CF6]">01 — The Vision</span>
              </div>

              {stage.map((msg, i) =>
                msg.role === 'assistant' ? (
                  <p key={i} className="text-3xl md:text-5xl font-bold leading-[1.1] tracking-tight text-[#e8e6e1] whitespace-pre-wrap">
                    {msg.content}
                  </p>
                ) : (
                  <p
                    key={i}
                    className="inline-block text-base font-bold px-3 py-2 whitespace-pre-wrap"
                    style={{ background: '#e8e6e1', color: '#111110', transform: 'rotate(-1deg)' }}
                  >
                    {msg.content}
                  </p>
                )
              )}

              {isLoading && (
                <p className="text-3xl font-black text-[#4a4946]">···</p>
              )}
            </div>

            {pendingLens && !isLoading && (
              <div
                style={{
                  border: `3px solid ${energyColor}`,
                  background: '#161614',
                  opacity: lensVisible ? 1 : 0,
                  animation: lensVisible ? 'reimagineSnap 0.4s ease-out both' : 'none',
                }}
                className="p-6 space-y-5"
              >
                <div className="flex items-center gap-2">
                  <span className="w-4 h-4" style={{ background: energyColor }} />
                  <span className="text-xs font-black uppercase tracking-[0.3em]" style={{ color: energyColor }}>
                    02 — The Lens
                  </span>
                </div>
                <p className="text-xl md:text-2xl font-bold leading-snug text-[#e8e6e1]">{pendingLens.lens}</p>

                <div className="flex items-center gap-4 pt-1">
                  {ENERGY_SCALE.map((label, i) => (
                    <button key={label} onClick={() => nudgeEnergy(i)} className="flex flex-col items-center gap-2">
                      <span
                        className="w-7 h-7 border-2 transition-transform duration-200"
                        style={{
                          background: i === energyIndex ? ENERGY_COLORS[i] : 'transparent',
                          borderColor: ENERGY_COLORS[i],
                          transform:
                            i === energyIndex && energyPulsing
                              ? 'scale(1.25) rotate(10deg)'
                              : i === energyIndex
                                ? 'rotate(0deg) scale(1.1)'
                                : 'scale(1)',
                        }}
                      />
                      <span
                        className="text-[9px] font-bold uppercase tracking-widest"
                        style={{ color: i === energyIndex ? ENERGY_COLORS[i] : '#4a4946' }}
                      >
                        {label}
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={runReimagine}
                  disabled={isGenerating}
                  className="px-8 py-3 text-xs font-black tracking-[0.25em] uppercase transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ background: energyColor, color: '#111110' }}
                >
                  {isGenerating ? 'Reimagining…' : 'Run it ▸'}
                </button>
                <p className="text-xs text-[#4a4946]">or keep talking below to change the lens</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative z-10 h-full overflow-y-auto">
          <div className="h-2 w-full" style={{ background: energyColor }} />
          <div className="px-6 md:px-[8%] py-14 max-w-2xl mx-auto" style={{ animation: 'reimagineRise 0.5s ease-out both' }}>
            <div className="flex items-center justify-between mb-8">
              <button
                onClick={() => setViewingResult(false)}
                className="text-xs font-bold uppercase tracking-widest text-[#8c8a87] hover:text-[#e8e6e1] transition-colors"
              >
                ‹ Tune it differently
              </button>
              {output && !isGenerating && (
                <button
                  onClick={copyOutput}
                  className="text-xs font-bold uppercase tracking-widest text-[#8c8a87] hover:text-[#e8e6e1] transition-colors"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className="w-4 h-4" style={{ background: energyColor }} />
              <span className="text-xs font-black uppercase tracking-[0.3em]" style={{ color: energyColor }}>
                03 — The Result
              </span>
            </div>

            {output ? (
              <p className="text-lg md:text-xl leading-relaxed text-[#d4d2cd] whitespace-pre-wrap">{output}</p>
            ) : (
              <p className="text-xl font-bold text-[#4a4946]">reimagining···</p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30">
          <p className="text-xs font-bold text-[#EF4444]">{error}</p>
        </div>
      )}

      {!viewingResult && (
        <div className="fixed bottom-0 left-0 right-0 z-20 px-6 md:pl-[6%] md:pr-[44%] py-6" style={{ background: '#111110', borderTop: '2px solid #2e2d2a' }}>
          <div className="max-w-xl w-full flex items-center gap-3">
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
              className="flex-1 bg-transparent px-3 py-2 text-base font-medium text-[#e8e6e1] placeholder:text-[#4a4946] disabled:opacity-50 focus:outline-none"
              style={{ resize: 'none', overflowY: 'auto', maxHeight: '120px', border: '2px solid #2e2d2a' }}
            />

            <button
              onClick={handleRecordToggle}
              disabled={isLoading}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              className={`relative w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                isLoading ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
              }`}
              style={{ background: isRecording ? '#8B5CF6' : 'transparent', border: '2px solid #e8e6e1' }}
            >
              {isRecording && (
                <div className="absolute inset-[-6px]" style={{ animation: 'reimagineOrbit 1.4s linear infinite' }}>
                  <div className="absolute w-1.5 h-1.5" style={{ top: 0, left: '50%', marginLeft: -3, background: '#F59E0B' }} />
                </div>
              )}
              <span className={`block w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-[#111110]' : 'bg-[#e8e6e1]'}`} />
            </button>

            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className="px-5 py-2.5 text-xs font-black tracking-widest uppercase transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: '#e8e6e1', color: '#111110' }}
            >
              Send
            </button>
          </div>

          {isRecording && <p className="text-xs font-bold text-[#8B5CF6] uppercase tracking-widest mt-3">Listening</p>}
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
