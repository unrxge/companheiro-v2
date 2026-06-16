'use client'

import { useState, useRef, useEffect } from 'react'
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

interface PreviousCapture {
  id: string
  raw_input: string
  unpacked: string
  arc: string
  thematic_territory: string
  url: string | null
  created_at: string
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
  const [url, setUrl] = useState('')
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null)
  const [previousCaptures, setPreviousCaptures] = useState<PreviousCapture[]>([])
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(true)
  const [selectedCapture, setSelectedCapture] = useState<PreviousCapture | null>(null)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  // Fetch previous captures on mount
  useEffect(() => {
    const fetchPreviousCaptures = async () => {
      try {
        const res = await fetch('/api/idea-lab/captures')
        const data = await res.json()
        setPreviousCaptures(data.captures || [])
      } catch (err) {
        console.error('Failed to fetch previous captures:', err)
      } finally {
        setIsLoadingPrevious(false)
      }
    }

    fetchPreviousCaptures()
  }, [])

  const handleCaptureAnother = () => {
    setShowSuccess(false)
    setCaptureResult(null)
    setTranscript('')
    setManualInput('')
    setUrl('')
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
        body: JSON.stringify({
          raw_input: input,
          url: url.trim() || undefined,
        }),
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
            <div className="space-y-2">
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
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="URL (optional)"
                className="w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded px-4 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] transition-colors"
              />
            </div>
          )}
        </div>
      </div>

      {/* Previously Captured Section */}
      {!showSuccess && (
        <div className="px-6 py-6 border-t border-[#1f1f1d] max-w-xl mx-auto w-full">
          <h3 className="text-xs text-[#4a4946] uppercase tracking-widest mb-3">
            Previously captured
          </h3>

          {isLoadingPrevious ? (
            <p className="text-xs text-[#3d3c39]">Loading...</p>
          ) : previousCaptures.length === 0 ? (
            <p className="text-xs text-[#3d3c39]">No captures yet</p>
          ) : (
            <div className="space-y-2">
              {previousCaptures.map((capture) => (
                <button
                  key={capture.id}
                  onClick={() => setSelectedCapture(capture)}
                  className="w-full text-left bg-[#161614] border border-[#1f1f1d] rounded p-3 hover:border-[#4a4946] transition-colors"
                >
                  <p className="text-sm text-[#d4d2cd] leading-relaxed line-clamp-2">
                    {capture.unpacked}
                  </p>
                  <div className="flex gap-2 items-center text-xs mt-2">
                    <span className="text-[#4a4946]">Arc:</span>
                    <span className="text-[#8c8a87]">{capture.arc}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Capture Detail Modal */}
      {selectedCapture && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161614] border border-[#1f1f1d] rounded max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#161614] border-b border-[#1f1f1d] px-6 py-4 flex justify-between items-start">
              <div className="flex-1">
                <h2 className="text-lg font-medium text-[#e8e6e1]">Captured idea</h2>
                <div className="flex gap-3 mt-2 text-xs text-[#8c8a87]">
                  <span>{selectedCapture.arc}</span>
                  <span>•</span>
                  <span>{selectedCapture.thematic_territory}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCapture(null)}
                className="text-[#4a4946] hover:text-[#e8e6e1] text-lg"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 space-y-6">
              {/* URL */}
              {selectedCapture.url && (
                <div className="space-y-2">
                  <p className="text-xs text-[#4a4946] uppercase tracking-widest">Source</p>
                  <a
                    href={selectedCapture.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#10B981] hover:text-[#06d6a0] transition-colors break-all"
                  >
                    {selectedCapture.url}
                  </a>
                </div>
              )}

              {/* Raw input */}
              {selectedCapture.raw_input && (
                <div className="space-y-2">
                  <p className="text-xs text-[#4a4946] uppercase tracking-widest">Raw input</p>
                  <p className="text-sm text-[#d4d2cd] leading-relaxed">{selectedCapture.raw_input}</p>
                </div>
              )}

              {/* Unpacked text */}
              {selectedCapture.unpacked && (
                <div className="space-y-2">
                  <p className="text-xs text-[#4a4946] uppercase tracking-widest">Unpacked</p>
                  <p className="text-sm text-[#d4d2cd] leading-relaxed">{selectedCapture.unpacked}</p>
                </div>
              )}

              {/* Created at */}
              <div className="text-xs text-[#8c8a87] pt-4 border-t border-[#1f1f1d]">
                Captured on {new Date(selectedCapture.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
