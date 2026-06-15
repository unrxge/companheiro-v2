'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Arc = 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration'
type ThematicTerritory =
  | 'creativity_devotion_curiosity'
  | 'healthy_masculinity_emotional_regulation'
  | 'inner_child_tending_expression'
  | 'slow_living_life_in_service'

interface CaptureResult {
  id: string
  raw_input: string
  unpacked: string
  arc: Arc
  thematic_territory: ThematicTerritory
}

const TERRITORY_LABELS: Record<ThematicTerritory, string> = {
  creativity_devotion_curiosity: 'Creativity, devotion & curiosity',
  healthy_masculinity_emotional_regulation: 'Healthy masculinity & emotional regulation',
  inner_child_tending_expression: 'Inner child tending & expression',
  slow_living_life_in_service: 'Slow living & life in service',
}

export default function CollectorPage() {
  const router = useRouter()
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [manualInput, setManualInput] = useState('')
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const handleCaptureAnother = () => {
    setShowSuccess(false)
    setCaptureResult(null)
    setTranscript('')
    setManualInput('')
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
          setTranscript((prev) => prev + transcript + ' ')
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

  const handleCapture = async () => {
    const input = transcript.trim() || manualInput.trim()
    if (!input) {
      setError('Please add some text to capture')
      return
    }

    setIsCapturing(true)
    setError(null)

    try {
      const res = await fetch('/api/collector/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_input: input }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to capture')
        return
      }

      setCaptureResult(data.capture)
      setShowSuccess(true)
    } catch (err) {
      console.error('Capture error:', err)
      setError('Failed to capture. Please try again.')
    } finally {
      setIsCapturing(false)
    }
  }

  // Success display
  if (showSuccess && captureResult) {
    return (
      <div className="flex h-screen flex-col bg-[#111110]">
        {/* Back button */}
        <div className="px-6 py-3 border-b border-[#1f1f1d]">
          <button
            onClick={() => router.push('/home')}
            className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] transition-colors"
          >
            ← Home
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
          <div className="max-w-xl w-full space-y-6">
            <div className="space-y-4">
              <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">Captured</h2>

              <p className="text-base text-[#d4d2cd] leading-relaxed">
                {captureResult.unpacked}
              </p>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-[#161614] border border-[#1f1f1d] rounded p-3">
                  <p className="text-xs text-[#4a4946] mb-1">Arc</p>
                  <p className="text-sm font-medium text-[#e8e6e1]">{captureResult.arc}</p>
                </div>
                <div className="bg-[#161614] border border-[#1f1f1d] rounded p-3">
                  <p className="text-xs text-[#4a4946] mb-1">Territory</p>
                  <p className="text-xs font-medium text-[#e8e6e1]">
                    {TERRITORY_LABELS[captureResult.thematic_territory]}
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={handleCaptureAnother}
              className="w-full py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd]"
            >
              Capture another
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main capture interface
  return (
    <div className="flex h-screen flex-col bg-[#111110]">
      {/* Back button */}
      <div className="px-6 py-3 border-b border-[#1f1f1d]">
        <button
          onClick={() => router.push('/home')}
          className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] transition-colors"
        >
          ← Home
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-xl w-full space-y-6">
          {error && (
            <div className="bg-red-900/20 border border-red-700/30 rounded p-3">
              <p className="text-xs text-red-200">{error}</p>
            </div>
          )}

          {/* Text input area - shown when there's any content */}
          {(transcript || manualInput) && (
            <div className="space-y-3">
              <textarea
                value={transcript || manualInput}
                onChange={(e) => {
                  if (transcript) {
                    setTranscript(e.target.value)
                  } else {
                    setManualInput(e.target.value)
                  }
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
                rows={1}
                className="w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded px-4 py-3 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] transition-colors"
                style={{ resize: 'none', overflowY: 'auto', maxHeight: '150px' }}
              />

              <button
                onClick={handleCapture}
                disabled={isCapturing || (!transcript.trim() && !manualInput.trim())}
                className="w-full py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isCapturing ? 'Capturing...' : 'Capture'}
              </button>
            </div>
          )}

          {/* Record button */}
          <div className="flex justify-center">
            <button
              onClick={handleRecordToggle}
              disabled={isCapturing}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              className={`
                w-20 h-20 rounded-full transition-all duration-300 flex items-center justify-center
                ${isCapturing ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
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

          {/* Manual text input - shown below record button */}
          {!transcript && !isRecording && (
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="or type here..."
              className="w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded px-4 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] transition-colors"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && manualInput.trim()) {
                  handleCapture()
                }
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
