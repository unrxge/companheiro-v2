'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { readTextStream } from '@/lib/stream-client'

interface PieceCore {
  id: string
  title: string
  substack_draft: string
  conviction_statement: string
  emotional_journey: string
  core_truth: string
  substack_goals: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function WriteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pieceId = searchParams.get('piece_id')

  const [piece, setPiece] = useState<PieceCore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [draft, setDraft] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expandedSection, setExpandedSection] = useState<'core' | 'assistant' | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const saveDraftTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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
        setTitle(data.piece.title || '')
        setDraft(data.piece.substack_draft || '')
      }
    } catch (err) {
      console.error('Failed to fetch piece:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const words = draft.trim().split(/\s+/).filter((w) => w.length > 0).length
    setWordCount(words)
  }, [draft])

  const saveDraft = async () => {
    if (!pieceId || isSaving) return

    setIsSaving(true)
    try {
      await fetch('/api/write/draft', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piece_id: pieceId,
          title,
          substack_draft: draft,
        }),
        keepalive: true,
      })
    } catch (err) {
      console.error('Failed to save draft:', err)
    } finally {
      setIsSaving(false)
    }
  }

  // Debounced save on every change, plus an immediate save whenever the tab
  // is backgrounded or closed — otherwise anything typed in the last few
  // seconds before leaving is silently lost.
  useEffect(() => {
    if (saveDraftTimeoutRef.current) {
      clearTimeout(saveDraftTimeoutRef.current)
    }

    saveDraftTimeoutRef.current = setTimeout(() => {
      saveDraft()
    }, 3000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveDraft()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      if (saveDraftTimeoutRef.current) clearTimeout(saveDraftTimeoutRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [draft, title])

  const handleChatSend = async () => {
    if (!chatInput.trim() || !pieceId || isChatLoading) return

    const userMessage = chatInput
    setChatInput('')

    // History excludes the new message — the API appends it itself
    const priorHistory = chatMessages
    const newMessages = [...chatMessages, { role: 'user' as const, content: userMessage }]
    setChatMessages(newMessages)

    setIsChatLoading(true)
    try {
      const res = await fetch('/api/write/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          piece_id: pieceId,
          conversation_history: priorHistory,
        }),
      })

      if (!res.ok) {
        console.error('Chat request failed:', res.status)
        return
      }

      setChatMessages([...newMessages, { role: 'assistant', content: '' }])
      await readTextStream(res, (visibleText) => {
        setChatMessages([...newMessages, { role: 'assistant', content: visibleText }])
      })
    } catch (err) {
      console.error('Failed to send chat message:', err)
    } finally {
      setIsChatLoading(false)
    }
  }

  if (isLoading || !piece) {
    return (
      <div className="min-h-screen bg-[#111110] flex items-center justify-center">
        <p className="text-[#4a4946]">Loading...</p>
      </div>
    )
  }

  const canMarkReady = wordCount > 100

  return (
    <div className="h-screen bg-[#111110] flex overflow-hidden">
      <style>{`
        textarea {
          resize: none;
          overflow: hidden;
        }
        input[type="text"] {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .accordion-enter {
          animation: accordionEnter 0.3s ease forwards;
        }
        .accordion-exit {
          animation: accordionExit 0.3s ease forwards;
        }
        @keyframes accordionEnter {
          from {
            opacity: 0;
            max-height: 0;
          }
          to {
            opacity: 1;
            max-height: 1000px;
          }
        }
        @keyframes accordionExit {
          from {
            opacity: 1;
            max-height: 1000px;
          }
          to {
            opacity: 0;
            max-height: 0;
          }
        }
      `}</style>

      {/* Main writing area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Minimal header with exit button */}
        <div className="h-12 border-b border-[#1f1f1d] flex items-center px-6" style={{ background: '#111110' }}>
          <button
            onClick={async () => {
              await saveDraft()
              router.push('/project-board')
            }}
            className="text-[#8c8a87] hover:text-[#e8e6e1] text-sm transition-colors"
            title="Back to project board"
          >
            ← Back
          </button>
        </div>

        {/* Writing surface */}
        <div className="flex-1 overflow-y-auto" style={{ background: '#111110' }}>
          <div className="max-w-[680px] mx-auto px-16 py-12">
            {/* Title field */}
            <textarea
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              placeholder="Title"
              rows={1}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                overflow: 'hidden',
                fontSize: '2rem',
                fontWeight: '700',
                color: '#e8e6e0',
                lineHeight: '1.3',
                marginBottom: '1.5rem',
                padding: '0',
                wordWrap: 'break-word',
                whiteSpace: 'pre-wrap',
              }}
            />

            {/* Draft textarea */}
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              placeholder="Begin writing..."
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                overflow: 'hidden',
                fontSize: '1.125rem',
                color: '#e8e6e0',
                lineHeight: '1.8',
                padding: '0',
                minHeight: '100%',
              }}
            />

            {/* Word count and status */}
            <div className="mt-12 pt-8 border-t border-[#1f1f1d]">
              <div className="flex justify-between items-center text-xs text-[#a8a6a0]">
                <span>{wordCount} words</span>
                <span>{isSaving ? 'Saving...' : 'Saved'}</span>
              </div>

              {/* Action button */}
              {canMarkReady && (
                <button
                  onClick={async () => {
                    await saveDraft()
                    router.push(`/write/translate?piece_id=${pieceId}`)
                  }}
                  className="mt-6 text-sm text-[#a8a6a0] hover:text-[#e8e6e1] transition-colors underline"
                >
                  This draft is ready →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <div
        className={`border-l border-[#1f1f1d] transition-all duration-300 flex flex-col ${
          sidebarOpen ? 'w-80' : 'w-0'
        } overflow-hidden`}
        style={{ background: '#111110' }}
      >
        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute right-0 top-4 bg-[#1f1f1d] text-[#4a4946] hover:text-[#8c8a87] px-2 py-1 text-xs rounded transition-colors"
          style={{ zIndex: 10 }}
        >
          {sidebarOpen ? '✕' : '☰'}
        </button>

        {sidebarOpen && (
          <div className="flex flex-col h-full overflow-y-auto pt-12 px-4 pb-4 space-y-3">
            {/* Core Concept Section */}
            <div className="border border-[#1f1f1d] rounded overflow-hidden">
              <button
                onClick={() =>
                  setExpandedSection(expandedSection === 'core' ? null : 'core')
                }
                className="w-full px-4 py-3 bg-[#111110] text-left text-xs font-medium text-[#e8e6e1] uppercase tracking-widest hover:bg-[#1f1f1d] transition-colors"
              >
                Core Concept
              </button>
              {expandedSection === 'core' && (
                <div className="accordion-enter border-t border-[#1f1f1d] p-4 space-y-3 bg-[#111110] text-xs">
                  {piece.conviction_statement && (
                    <div>
                      <p className="text-[#4a4946] uppercase tracking-widest mb-1">
                        Conviction
                      </p>
                      <p className="text-[#d4d2cd]">
                        {piece.conviction_statement}
                      </p>
                    </div>
                  )}
                  {piece.emotional_journey && (
                    <div>
                      <p className="text-[#4a4946] uppercase tracking-widest mb-1">
                        Emotional Journey
                      </p>
                      <p className="text-[#d4d2cd]">
                        {piece.emotional_journey}
                      </p>
                    </div>
                  )}
                  {piece.core_truth && (
                    <div>
                      <p className="text-[#4a4946] uppercase tracking-widest mb-1">
                        Core Truth
                      </p>
                      <p className="text-[#d4d2cd]">{piece.core_truth}</p>
                    </div>
                  )}
                  {piece.substack_goals && (
                    <div>
                      <p className="text-[#4a4946] uppercase tracking-widest mb-1">
                        Substack Goals
                      </p>
                      <p className="text-[#d4d2cd]">
                        {piece.substack_goals}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Writing Assistant Section */}
            <div className="border border-[#1f1f1d] rounded overflow-hidden flex flex-col flex-1 min-h-0">
              <button
                onClick={() =>
                  setExpandedSection(
                    expandedSection === 'assistant' ? null : 'assistant'
                  )
                }
                className="px-4 py-3 bg-[#111110] text-left text-xs font-medium text-[#e8e6e1] uppercase tracking-widest hover:bg-[#1f1f1d] transition-colors"
              >
                Writing Assistant
              </button>
              {expandedSection === 'assistant' && (
                <div className="accordion-enter border-t border-[#1f1f1d] flex flex-col flex-1 min-h-0 bg-[#111110]">
                  {/* Chat messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {chatMessages.length === 0 ? (
                      <p className="text-xs text-[#3d3c39]">
                        Ask Claude about your piece, stuck sections, or angles.
                      </p>
                    ) : (
                      chatMessages.map((msg, i) => (
                        <div
                          key={i}
                          className={`text-xs ${
                            msg.role === 'user' ? 'text-right' : 'text-left'
                          }`}
                        >
                          <div
                            className={`inline-block max-w-xs px-3 py-2 rounded ${
                              msg.role === 'user'
                                ? 'bg-[#2e2d2a] text-[#e8e6e1]'
                                : 'bg-[#1f1f1d] text-[#d4d2cd]'
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))
                    )}
                    {isChatLoading && (
                      <p className="text-xs text-[#4a4946]">Thinking...</p>
                    )}
                  </div>

                  {/* Chat input */}
                  <div className="border-t border-[#1f1f1d] p-3 space-y-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !isChatLoading) {
                          handleChatSend()
                        }
                      }}
                      placeholder="Ask something..."
                      className="w-full bg-[#2e2d2a] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946]"
                    />
                    <button
                      onClick={handleChatSend}
                      disabled={!chatInput.trim() || isChatLoading}
                      className="w-full px-3 py-2 bg-[#2e2d2a] text-[#e8e6e1] text-xs font-medium rounded hover:bg-[#3d3c39] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function WritePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111110] flex items-center justify-center">
          <p className="text-[#4a4946]">Loading...</p>
        </div>
      }
    >
      <WriteContent />
    </Suspense>
  )
}
