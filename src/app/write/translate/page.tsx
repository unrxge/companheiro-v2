'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

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
      <div className="min-h-screen bg-[#111110] flex items-center justify-center">
        <p className="text-[#4a4946]">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#111110] flex flex-col">
      <style>{`
        textarea {
          resize: none;
          overflow: hidden;
        }
      `}</style>

      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1f1f1d] flex justify-between items-center gap-4">
        <button
          onClick={() => router.push('/write?piece_id=' + pieceId)}
          className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] transition-colors whitespace-nowrap"
        >
          ← Write
        </button>
        <h1 className="text-2xl font-light text-[#e8e6e1] flex-1 text-center">Translate</h1>
        {script && (
          <button
            onClick={handleMarkReady}
            className="px-4 py-2 bg-green-600/20 text-green-400 text-xs font-medium rounded hover:bg-green-600/30 transition-colors"
          >
            This piece is ready to post
          </button>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden gap-6 px-6 py-6">
        {/* Left panel - Substack draft (read-only) */}
        <div className="flex-1 flex flex-col min-w-0">
          <h2 className="text-sm font-medium text-[#e8e6e1] uppercase tracking-widest mb-4">
            Substack Draft
          </h2>
          <div className="flex-1 overflow-y-auto bg-[#161614] border border-[#1f1f1d] rounded p-4">
            <p className="text-[#d4d2cd] text-sm leading-relaxed whitespace-pre-wrap">
              {piece.substack_draft}
            </p>
          </div>
        </div>

        {/* Right panel - Short form script */}
        <div className="flex-1 flex flex-col min-w-0">
          <h2 className="text-sm font-medium text-[#e8e6e1] uppercase tracking-widest mb-4">
            Short Form Script
          </h2>

          {!script ? (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#161614] border border-[#1f1f1d] rounded p-4">
              <button
                onClick={handleGenerateScript}
                disabled={isGenerating}
                className="px-6 py-3 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? 'Generating...' : 'Generate Short Form Script'}
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <textarea
                ref={textareaRef}
                value={script}
                onChange={(e) => setScript(e.target.value)}
                className="flex-1 bg-[#161614] border border-[#1f1f1d] rounded p-4 text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] text-sm leading-relaxed"
              />
              <button
                onClick={handleSaveScript}
                disabled={isSaving}
                className="mt-4 px-4 py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save Script'}
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
        <div className="min-h-screen bg-[#111110] flex items-center justify-center">
          <p className="text-[#4a4946]">Loading...</p>
        </div>
      }
    >
      <TranslateContent />
    </Suspense>
  )
}
