'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface PieceData {
  title: string
  one_sentence: string
}

function PostPublicationContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pieceId = searchParams.get('piece_id')

  const [piece, setPiece] = useState<PieceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const [form, setForm] = useState({
    thread: '',
    what_it_opened: '',
    unresolved: '',
    natural_continuations: '',
  })

  const threadRef = useRef<HTMLInputElement>(null)
  const openedRef = useRef<HTMLTextAreaElement>(null)
  const unresolvedRef = useRef<HTMLTextAreaElement>(null)
  const continuationsRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!pieceId) {
      router.push('/project-board')
      return
    }

    fetchPiece()
  }, [pieceId, router])

  const fetchPiece = async () => {
    try {
      const res = await fetch(`/api/project-board/piece?id=${pieceId}`)
      const data = await res.json()
      if (data.success) {
        setPiece({
          title: data.piece.title,
          one_sentence: data.piece.one_sentence,
        })
      }
    } catch (err) {
      console.error('Failed to fetch piece:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const startDictation = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Speech recognition not supported in this browser')
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()

    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript + ' '
        }
      }

      if (transcript && focusedField) {
        setForm((prev) => ({
          ...prev,
          [focusedField]: (prev[focusedField as keyof typeof form] || '') + transcript,
        }))
      }
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognition.start()
  }

  const resizeTextarea = (element: HTMLTextAreaElement) => {
    if (element) {
      element.style.height = 'auto'
      element.style.height = element.scrollHeight + 'px'
    }
  }

  const handleFieldChange = (
    field: keyof typeof form,
    value: string,
    element?: HTMLTextAreaElement
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }))
    if (element) {
      resizeTextarea(element)
    }
  }

  const handleSubmit = async () => {
    if (!pieceId) return

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/post-publication/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piece_id: pieceId,
          thread: form.thread,
          what_it_opened: form.what_it_opened,
          unresolved: form.unresolved,
          natural_continuations: form.natural_continuations,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setShowConfirmation(true)
        setTimeout(() => {
          router.push('/project-board')
        }, 2000)
      }
    } catch (err) {
      console.error('Failed to submit:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading || !piece) {
    return (
      <div className="min-h-screen bg-[#111110] flex items-center justify-center">
        <p className="text-[#4a4946]">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#111110] flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1f1f1d]">
        <h1 className="text-2xl font-light text-[#e8e6e1]">Reflect on this piece</h1>
        <p className="text-sm text-[#8c8a87] mt-2">{piece.title}</p>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 py-8 max-w-2xl">
        {showConfirmation ? (
          <div className="text-center py-12">
            <p className="text-[#e8e6e1] mb-2">Reflection logged.</p>
            <p className="text-xs text-[#8c8a87]">Returning to project board...</p>
          </div>
        ) : (
          <form className="space-y-6">
            {/* Dictation button */}
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={startDictation}
                disabled={isListening}
                className={`px-3 py-2 text-xs font-medium rounded transition-colors ${
                  isListening
                    ? 'bg-red-600/20 text-red-400'
                    : 'bg-[#2e2d2a] text-[#e8e6e1] hover:bg-[#3d3c39]'
                }`}
              >
                {isListening ? 'Listening...' : 'Start dictation'}
              </button>
              {focusedField && (
                <span className="text-xs text-[#8c8a87] self-center">
                  Speaking into: {focusedField.replace(/_/g, ' ')}
                </span>
              )}
            </div>

            {/* Thread field */}
            <div>
              <label className="text-xs text-[#a8a6a0] uppercase tracking-widest">
                What thread does this piece belong to?
              </label>
              <input
                ref={threadRef}
                type="text"
                value={form.thread}
                onChange={(e) => setForm({ ...form, thread: e.target.value })}
                onFocus={() => setFocusedField('thread')}
                onBlur={() => setFocusedField(null)}
                placeholder="e.g., 'Authenticity in creative work'"
                className="w-full mt-2 bg-[#161614] border border-[#1f1f1d] rounded px-4 py-3 text-sm text-[#e8e6e1] placeholder:text-[#a8a6a0] focus:outline-none focus:border-[#4a4946]"
              />
            </div>

            {/* What it opened */}
            <div>
              <label className="text-xs text-[#a8a6a0] uppercase tracking-widest">
                What did this piece open up?
              </label>
              <textarea
                ref={openedRef}
                value={form.what_it_opened}
                onChange={(e) => {
                  handleFieldChange('what_it_opened', e.target.value, openedRef.current || undefined)
                }}
                onFocus={() => setFocusedField('what_it_opened')}
                onBlur={() => setFocusedField(null)}
                placeholder="What questions, ideas, or conversations did this spark?"
                rows={3}
                className="w-full mt-2 bg-[#161614] border border-[#1f1f1d] rounded px-4 py-3 text-sm text-[#e8e6e1] placeholder:text-[#a8a6a0] focus:outline-none focus:border-[#4a4946] resize-none overflow-hidden"
              />
            </div>

            {/* Unresolved */}
            <div>
              <label className="text-xs text-[#a8a6a0] uppercase tracking-widest">
                What did it leave unresolved?
              </label>
              <textarea
                ref={unresolvedRef}
                value={form.unresolved}
                onChange={(e) => {
                  handleFieldChange('unresolved', e.target.value, unresolvedRef.current || undefined)
                }}
                onFocus={() => setFocusedField('unresolved')}
                onBlur={() => setFocusedField(null)}
                placeholder="What threads remain loose? What didn't you get to explore?"
                rows={3}
                className="w-full mt-2 bg-[#161614] border border-[#1f1f1d] rounded px-4 py-3 text-sm text-[#e8e6e1] placeholder:text-[#a8a6a0] focus:outline-none focus:border-[#4a4946] resize-none overflow-hidden"
              />
            </div>

            {/* Natural continuations */}
            <div>
              <label className="text-xs text-[#a8a6a0] uppercase tracking-widest">
                Where could this naturally go next?
              </label>
              <textarea
                ref={continuationsRef}
                value={form.natural_continuations}
                onChange={(e) => {
                  handleFieldChange('natural_continuations', e.target.value, continuationsRef.current || undefined)
                }}
                onFocus={() => setFocusedField('natural_continuations')}
                onBlur={() => setFocusedField(null)}
                placeholder="List potential next pieces or directions (one per line)"
                rows={4}
                className="w-full mt-2 bg-[#161614] border border-[#1f1f1d] rounded px-4 py-3 text-sm text-[#e8e6e1] placeholder:text-[#a8a6a0] focus:outline-none focus:border-[#4a4946] resize-none overflow-hidden"
              />
            </div>

            {/* Submit button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full mt-8 py-3 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Logging...' : 'Log this piece'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

export default function PostPublicationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111110] flex items-center justify-center">
          <p className="text-[#4a4946]">Loading...</p>
        </div>
      }
    >
      <PostPublicationContent />
    </Suspense>
  )
}
