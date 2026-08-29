'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { shellBackground, cardPalette } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'

const c = cardPalette['dark']

interface PieceData {
  id: string
  substack_draft: string
  short_form_script: string
}

function TranslateContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pieceId = searchParams.get('piece_id')

  const [piece, setPiece] = useState<PieceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [script, setScript] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
        setPiece(data.piece)
        setScript(data.piece.short_form_script || '')
      }
    } catch (err) {
      console.error('Failed to fetch piece:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerateScript = async () => {
    if (!pieceId || isGenerating) return

    setIsGenerating(true)
    try {
      const res = await fetch('/api/write/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId }),
      })

      const data = await res.json()
      setScript(data.script || '')
    } catch (err) {
      console.error('Failed to generate script:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveScript = async () => {
    if (!pieceId || isSaving) return

    setIsSaving(true)
    try {
      await fetch('/api/write/draft', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piece_id: pieceId,
          short_form_script: script,
        }),
      })
    } catch (err) {
      console.error('Failed to save script:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleMarkReady = async () => {
    if (!pieceId) return

    try {
      await fetch('/api/write/draft', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piece_id: pieceId,
          short_form_script: script,
        }),
      })

      router.push(`/post-publication?piece_id=${pieceId}`)
    } catch (err) {
      console.error('Failed to mark as ready:', err)
    }
  }

  const resizeTextarea = () => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = textarea.scrollHeight + 'px'
    }
  }

  useEffect(() => {
    resizeTextarea()
  }, [script])

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
      <div style={{ padding: '0 24px', height: 64, borderBottom: `1px solid ${c.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <IconButton onClick={() => router.push('/write?piece_id=' + pieceId)} ariaLabel="Back to Write">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </IconButton>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: c.textPrimary, letterSpacing: '-0.02em' }}>Translate</h1>
        </div>
        {script && (
          <button
            onClick={handleMarkReady}
            style={{ padding: '7px 14px', background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', fontSize: 12, fontWeight: 500, borderRadius: 6, border: '1px solid rgba(16,185,129,0.25)', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            This piece is ready to post
          </button>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 24, padding: 24 }}>
        {/* Left panel - Substack draft (read-only) */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h2 style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted, marginBottom: 12 }}>
            Substack Draft
          </h2>
          <div style={{ flex: 1, overflowY: 'auto', background: c.cardBg, border: `1px solid ${c.divider}`, borderRadius: 8, padding: 16 }}>
            <p style={{ fontSize: 15, color: c.textSecondary, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {piece.substack_draft}
            </p>
          </div>
        </div>

        {/* Right panel - Short form script */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <h2 style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted, marginBottom: 12 }}>
            Short Form Script
          </h2>

          {!script ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: c.cardBg, border: `1px solid ${c.divider}`, borderRadius: 8, padding: 16 }}>
              <button
                onClick={handleGenerateScript}
                disabled={isGenerating}
                style={{ padding: '10px 20px', background: c.textPrimary, color: c.containerBg, fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', cursor: isGenerating ? 'not-allowed' : 'pointer', opacity: isGenerating ? 0.5 : 1 }}
              >
                {isGenerating ? 'Generating…' : 'Generate Short Form Script'}
              </button>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 12 }}>
              <textarea
                ref={textareaRef}
                value={script}
                onChange={(e) => {
                  setScript(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
                style={{ flex: 1, background: c.cardBg, border: `1px solid ${c.divider}`, borderRadius: 8, padding: 16, fontSize: 15, color: c.textPrimary, lineHeight: 1.7, resize: 'none', outline: 'none', overflowY: 'auto', fontFamily: 'inherit' }}
              />
              <button
                onClick={handleSaveScript}
                disabled={isSaving}
                style={{ padding: '10px', background: c.textPrimary, color: c.containerBg, fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.5 : 1 }}
              >
                {isSaving ? 'Saving…' : 'Save Script'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TranslatePage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: cardPalette['dark'].textMuted, fontSize: 14 }}>Loading…</p>
        </div>
      }
    >
      <TranslateContent />
    </Suspense>
  )
}
