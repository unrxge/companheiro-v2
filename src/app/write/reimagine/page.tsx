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

// The four points map 1:1 onto the app's existing accent colors — turning
// four colors that normally sit as isolated status dots elsewhere in the
// app into a single emotional-intensity spectrum, used nowhere else.
const ENERGY_SCALE = ['hushed', 'measured', 'vivid', 'thunderous']
const ENERGY_COLORS = ['#8B5CF6', '#10B981', '#F59E0B', '#EF4444']

function energyIndexFor(word?: string): number {
  if (!word) return 1
  const idx = ENERGY_SCALE.indexOf(word.toLowerCase())
  return idx === -1 ? 1 : idx
}

const KEYFRAMES = `
@keyframes reimagineDriftA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(6vw,4vh) scale(1.15); } }
@keyframes reimagineDriftB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-5vw,-6vh) scale(1.1); } }
@keyframes reimagineDriftC { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(4vw,-3vh) scale(0.9); } }
@keyframes reimagineDriftD { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-3vw,5vh) scale(1.05); } }
@keyframes reimagineRipple { 0% { transform: scale(0.6); opacity: 0.7; } 100% { transform: scale(2.4); opacity: 0; } }
@keyframes reimagineShimmer { 0%,100% { opacity: 0.2; } 50% { opacity: 0.6; } }
@keyframes reimagineFloatIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
@keyframes reimagineRise { from { opacity: 0; transform: translateY(28px); } to { opacity: 1; transform: translateY(0); } }
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

      {/* Ambient living background — four accents drifting as one field,
          something no other screen in this app does. */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[60vw] h-[60vw] rounded-full blur-[120px] opacity-20 bg-[#8B5CF6]"
          style={{ top: '-15%', left: '-10%', animation: 'reimagineDriftA 24s ease-in-out infinite' }}
        />
        <div
          className="absolute w-[50vw] h-[50vw] rounded-full blur-[120px] opacity-20 bg-[#10B981]"
          style={{ bottom: '-15%', right: '-8%', animation: 'reimagineDriftB 28s ease-in-out infinite' }}
        />
        <div
          className="absolute w-[42vw] h-[42vw] rounded-full blur-[120px] opacity-15 bg-[#F59E0B]"
          style={{ top: '28%', right: '15%', animation: 'reimagineDriftC 32s ease-in-out infinite' }}
        />
        <div
          className="absolute w-[36vw] h-[36vw] rounded-full blur-[120px] opacity-15 bg-[#EF4444]"
          style={{ bottom: '5%', left: '18%', animation: 'reimagineDriftD 26s ease-in-out infinite' }}
        />
      </div>

      <button
        onClick={() => router.push(`/write?piece_id=${pieceId}`)}
        className="fixed top-6 left-6 z-30 text-xs text-[#6b6966] hover:text-[#e8e6e1] transition-colors"
      >
        ← Back to writing
      </button>

      {!viewingResult ? (
        <div ref={threadRef} className="relative z-10 h-full overflow-y-auto px-6 py-24">
          <div className="max-w-3xl mx-auto w-full flex flex-col items-center gap-10">
            {trail.length > 0 && (
              <div className="w-full space-y-1.5 opacity-40 text-center">
                {trail.map((msg, i) => (
                  <p
                    key={i}
                    className={`text-xs leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user' ? 'text-[#6b6966] italic' : 'text-[#4a4946]'
                    }`}
                  >
                    {msg.content}
                  </p>
                ))}
              </div>
            )}

            <div key={stageStartIdx} className="w-full space-y-6 text-center" style={{ animation: 'reimagineRise 0.7s ease-out both' }}>
              {stage.map((msg, i) =>
                msg.role === 'assistant' ? (
                  <p
                    key={i}
                    className="text-4xl md:text-6xl font-light leading-[1.15] tracking-tight text-[#e8e6e1] whitespace-pre-wrap"
                  >
                    {msg.content}
                  </p>
                ) : (
                  <p key={i} className="text-xl md:text-2xl italic font-light text-[#a8a6a0] whitespace-pre-wrap">
                    {msg.content}
                  </p>
                )
              )}

              {isLoading && (
                <p className="text-4xl font-light text-[#4a4946]" style={{ animation: 'reimagineShimmer 1.6s ease-in-out infinite' }}>
                  …
                </p>
              )}
            </div>

            {pendingLens && !isLoading && (
              <div className="relative w-full max-w-xl mx-auto">
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ border: `2px solid ${energyColor}`, animation: lensVisible ? 'reimagineRipple 1.2s ease-out forwards' : 'none' }}
                />
                <span
                  className="absolute inset-0 rounded-full"
                  style={{ border: `1px solid ${energyColor}`, animation: lensVisible ? 'reimagineRipple 1.2s ease-out 0.15s forwards' : 'none' }}
                />

                <div
                  className="relative rounded-2xl p-8 space-y-6 text-center transition-all duration-500 ease-out backdrop-blur-sm"
                  style={{
                    background: 'rgba(22,22,20,0.7)',
                    border: `1px solid ${energyColor}55`,
                    boxShadow: lensVisible ? `0 0 80px -20px ${energyColor}` : 'none',
                    opacity: lensVisible ? 1 : 0,
                    transform: lensVisible ? 'scale(1)' : 'scale(0.95)',
                  }}
                >
                  <p className="text-xs uppercase tracking-[0.3em]" style={{ color: energyColor }}>
                    the lens
                  </p>
                  <p className="text-2xl font-light leading-relaxed text-[#e8e6e1]">{pendingLens.lens}</p>

                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between text-[10px] uppercase tracking-widest text-[#6b6966]">
                      {ENERGY_SCALE.map((label, i) => (
                        <span
                          key={label}
                          className="transition-transform duration-200"
                          style={{
                            color: i === energyIndex ? ENERGY_COLORS[i] : undefined,
                            transform: i === energyIndex && energyPulsing ? 'scale(1.3)' : 'scale(1)',
                          }}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={ENERGY_SCALE.length - 1}
                      value={energyIndex}
                      onChange={(e) => nudgeEnergy(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                        [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full
                        [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white"
                      style={{
                        background: `linear-gradient(to right, ${ENERGY_COLORS.join(',')})`,
                      }}
                    />
                  </div>

                  <button
                    onClick={runReimagine}
                    disabled={isGenerating}
                    className="px-10 py-3 rounded-full text-xs font-medium tracking-[0.2em] uppercase transition-all duration-300 disabled:opacity-50"
                    style={{ background: energyColor, color: '#111110', boxShadow: `0 0 40px -8px ${energyColor}` }}
                  >
                    {isGenerating ? 'Reimagining…' : 'Run it'}
                  </button>
                  <p className="text-xs text-[#4a4946]">or keep talking below to change the lens</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative z-10 h-full overflow-y-auto px-6 py-20">
          <div
            className="max-w-2xl mx-auto w-full space-y-8"
            style={{ animation: 'reimagineFloatIn 0.8s ease-out both' }}
          >
            <div className="flex items-center justify-between">
              <button
                onClick={() => setViewingResult(false)}
                className="text-xs text-[#6b6966] hover:text-[#e8e6e1] transition-colors"
              >
                ‹ Tune it differently
              </button>
              {output && !isGenerating && (
                <button
                  onClick={copyOutput}
                  className="text-xs text-[#6b6966] hover:text-[#e8e6e1] transition-colors"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>

            {output ? (
              <p className="text-xl md:text-2xl font-light leading-relaxed text-[#d4d2cd] whitespace-pre-wrap">
                {output}
              </p>
            ) : (
              <p className="text-2xl font-light text-[#4a4946]" style={{ animation: 'reimagineShimmer 1.6s ease-in-out infinite' }}>
                reimagining…
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 px-4 py-2">
          <p className="text-xs text-red-300">{error}</p>
        </div>
      )}

      {!viewingResult && (
        <div className="fixed bottom-0 left-0 right-0 z-20 px-6 py-8">
          <div className="max-w-2xl mx-auto w-full flex items-center gap-4">
            <div className="relative flex-1">
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
                placeholder="speak the shape it wants to become…"
                disabled={isLoading}
                rows={1}
                className="w-full bg-transparent border-none outline-none text-center text-lg font-light text-[#e8e6e1] placeholder:text-[#3d3c39] disabled:opacity-50"
                style={{ resize: 'none', overflowY: 'auto', maxHeight: '120px' }}
              />
              <div
                className="h-px w-full mt-1"
                style={{
                  background: `linear-gradient(to right, transparent, #8B5CF6, transparent)`,
                  animation: !inputText.trim() ? 'reimagineShimmer 3s ease-in-out infinite' : 'none',
                  opacity: inputText.trim() ? 0.5 : undefined,
                }}
              />
            </div>

            <button
              onClick={handleRecordToggle}
              disabled={isLoading}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              className={`relative w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                isLoading ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'
              }`}
              style={{
                background: isRecording ? '#8B5CF6' : 'rgba(46,45,42,0.6)',
                border: '1px solid #2e2d2a',
              }}
            >
              {isRecording && (
                <>
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{ border: '1px solid #8B5CF6', animation: 'reimagineRipple 1.6s ease-out infinite' }}
                  />
                  <span
                    className="absolute inset-0 rounded-full"
                    style={{ border: '1px solid #8B5CF6', animation: 'reimagineRipple 1.6s ease-out 0.6s infinite' }}
                  />
                </>
              )}
              <span className={`block w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-[#111110]' : 'bg-[#8c8a87]'}`} />
            </button>

            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className="px-5 py-2.5 rounded-full text-xs font-medium tracking-widest uppercase transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ background: '#e8e6e1', color: '#111110' }}
            >
              Send
            </button>
          </div>

          {isRecording && (
            <p className="text-xs text-[#6b6966] text-center tracking-widest uppercase mt-3">Listening</p>
          )}
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
