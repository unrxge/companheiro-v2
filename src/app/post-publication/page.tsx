'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { shellBackground, cardPalette } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'

const c = cardPalette['dark']

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
  const [isPunctuating, setIsPunctuating] = useState(false)

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

  // Resize textareas when dictation/punctuation injects text (no onChange fires for state updates)
  useEffect(() => {
    const el = openedRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [form.what_it_opened])

  useEffect(() => {
    const el = unresolvedRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [form.unresolved])

  useEffect(() => {
    const el = continuationsRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [form.natural_continuations])

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

  const punctuateTranscript = async (rawText: string, fieldName: string) => {
    if (!rawText.trim()) return
    setIsPunctuating(true)
    try {
      const res = await fetch('/api/punctuate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText }),
      })
      const data = await res.json()
      if (data.punctuated) {
        setForm((prev) => ({
          ...prev,
          [fieldName]: (prev[fieldName as keyof typeof form] || '') + data.punctuated,
        }))
      }
    } catch (err) {
      console.error('Punctuation error:', err)
    } finally {
      setIsPunctuating(false)
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

    let finalTranscript = ''

    recognition.onstart = () => {
      setIsListening(true)
    }

    recognition.onend = () => {
      setIsListening(false)
      // Punctuate the transcript after recording ends
      if (finalTranscript.trim() && focusedField) {
        punctuateTranscript(finalTranscript.trim(), focusedField)
      }
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' '
        }
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
      <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: c.textMuted, fontSize: 14 }}>Loading…</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '0 24px', height: 64, borderBottom: `1px solid ${c.divider}`, display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <IconButton onClick={() => router.push('/project-board')} ariaLabel="Back to Project Board">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </IconButton>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: c.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
            Post-publication
          </h1>
          <p style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{piece.title}</p>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px', maxWidth: 680 }}>
        {showConfirmation ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ color: c.textPrimary, marginBottom: 8 }}>Reflection logged.</p>
            <p style={{ fontSize: 12, color: c.textMuted }}>Returning to project board…</p>
          </div>
        ) : (
          <form style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Dictation button */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={startDictation}
                disabled={isListening}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  fontWeight: 500,
                  borderRadius: 6,
                  border: `1px solid ${c.inputBorder}`,
                  background: isListening ? c.cardBgInner : c.inputBg,
                  color: c.textSecondary,
                  cursor: isListening ? 'default' : 'pointer',
                }}
              >
                {isListening ? 'Listening…' : 'Start dictation'}
              </button>
              {focusedField && (
                <span style={{ fontSize: 12, color: c.textMuted }}>
                  Speaking into: {focusedField.replace(/_/g, ' ')}
                </span>
              )}
              {isPunctuating && (
                <span style={{ fontSize: 12, color: c.textMuted }}>Punctuating…</span>
              )}
            </div>

            {/* Thread field */}
            <div>
              <label style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted }}>
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
                style={{ display: 'block', width: '100%', marginTop: 8, background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 8, padding: '10px 14px', fontSize: 15, color: c.textPrimary, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            {/* What it opened */}
            <div>
              <label style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted }}>
                What did this piece open up?
              </label>
              <textarea
                ref={openedRef}
                value={form.what_it_opened}
                onChange={(e) => { handleFieldChange('what_it_opened', e.target.value, openedRef.current || undefined) }}
                onFocus={() => setFocusedField('what_it_opened')}
                onBlur={() => setFocusedField(null)}
                placeholder="What questions, ideas, or conversations did this spark?"
                rows={1}
                style={{ display: 'block', width: '100%', marginTop: 8, background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 8, padding: '10px 14px', fontSize: 15, color: c.textPrimary, resize: 'none', overflowY: 'auto', maxHeight: 140, outline: 'none', lineHeight: 1.5, boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            {/* Unresolved */}
            <div>
              <label style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted }}>
                What did it leave unresolved?
              </label>
              <textarea
                ref={unresolvedRef}
                value={form.unresolved}
                onChange={(e) => { handleFieldChange('unresolved', e.target.value, unresolvedRef.current || undefined) }}
                onFocus={() => setFocusedField('unresolved')}
                onBlur={() => setFocusedField(null)}
                placeholder="What threads remain loose? What didn't you get to explore?"
                rows={1}
                style={{ display: 'block', width: '100%', marginTop: 8, background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 8, padding: '10px 14px', fontSize: 15, color: c.textPrimary, resize: 'none', overflowY: 'auto', maxHeight: 140, outline: 'none', lineHeight: 1.5, boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            {/* Natural continuations */}
            <div>
              <label style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted }}>
                Where could this naturally go next?
              </label>
              <textarea
                ref={continuationsRef}
                value={form.natural_continuations}
                onChange={(e) => { handleFieldChange('natural_continuations', e.target.value, continuationsRef.current || undefined) }}
                onFocus={() => setFocusedField('natural_continuations')}
                onBlur={() => setFocusedField(null)}
                placeholder="List potential next pieces or directions (one per line)"
                rows={1}
                style={{ display: 'block', width: '100%', marginTop: 8, background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 8, padding: '10px 14px', fontSize: 15, color: c.textPrimary, resize: 'none', overflowY: 'auto', maxHeight: 140, outline: 'none', lineHeight: 1.5, boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>

            {/* Submit button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              style={{ width: '100%', marginTop: 8, padding: '12px', background: c.textPrimary, color: c.containerBg, fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer', opacity: isSubmitting ? 0.5 : 1 }}
            >
              {isSubmitting ? 'Logging…' : 'Log this piece'}
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
        <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: cardPalette['dark'].textMuted, fontSize: 14 }}>Loading…</p>
        </div>
      }
    >
      <PostPublicationContent />
    </Suspense>
  )
}
