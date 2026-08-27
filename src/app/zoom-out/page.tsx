'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { readTextStream } from '@/lib/stream-client'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface PendingAction {
  concept?: string
  trajectory?: string
  tone?: string
}

export default function ZoomOutPage() {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [isCommitting, setIsCommitting] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [expandedMsgs, setExpandedMsgs] = useState<Set<number>>(new Set())
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchAIResponse([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight
    }
  }, [messages])

  const fetchAIResponse = async (conversationHistory: Message[]) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/trajectory/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationHistory }),
      })

      if (!res.ok) {
        setError('Failed to get response')
        return
      }

      // Stream the reading in, hiding the structured tags that arrive at the end
      setMessages([...conversationHistory, { role: 'assistant', content: '' }])
      const { text, meta } = await readTextStream<{
        concept?: string
        trajectory?: string
        tone?: string
      }>(
        res,
        (visibleText) => {
          setMessages([...conversationHistory, { role: 'assistant', content: visibleText }])
        },
        ['<concept>', '<trajectory>', '<tone>']
      )

      if (!text) {
        setMessages(conversationHistory)
        setError('Failed to get response')
        return
      }

      if (meta && (meta.concept || meta.trajectory)) {
        setPendingAction({ concept: meta.concept, trajectory: meta.trajectory, tone: meta.tone })
      } else {
        setPendingAction(null)
      }
    } catch (err) {
      console.error('Zoom out error:', err)
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
    setPendingAction(null)
    setConfirmation(null)

    await fetchAIResponse(updatedMessages)
  }

  const handleCommitConcept = async () => {
    if (!pendingAction?.concept) return
    setIsCommitting(true)

    try {
      const res = await fetch('/api/trajectory/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statement: pendingAction.trajectory || pendingAction.concept,
          born_project: pendingAction.concept,
          tone: pendingAction.tone,
          conversation: messages,
        }),
      })

      if (res.ok) {
        router.push(`/idea-lab/conceptualise?seed=${encodeURIComponent(pendingAction.concept)}`)
      } else {
        setError('Failed to confirm — please try again.')
      }
    } catch (err) {
      console.error('Commit error:', err)
      setError('Failed to confirm — please try again.')
    } finally {
      setIsCommitting(false)
    }
  }

  const handleCommitTrajectoryOnly = async () => {
    if (!pendingAction?.trajectory) return
    setIsCommitting(true)

    try {
      const res = await fetch('/api/trajectory/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statement: pendingAction.trajectory,
          tone: pendingAction.tone,
          conversation: messages,
        }),
      })

      if (res.ok) {
        setConfirmation('Direction updated.')
        setPendingAction(null)
      } else {
        setError('Failed to confirm — please try again.')
      }
    } catch (err) {
      console.error('Commit error:', err)
      setError('Failed to confirm — please try again.')
    } finally {
      setIsCommitting(false)
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[#111110]">
      <div className="px-6 py-4 border-b border-[#1f1f1d] flex justify-between items-center gap-4">
        <button
          onClick={() => router.push('/project-board')}
          className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] transition-colors whitespace-nowrap"
        >
          ← Project Board
        </button>
        <p className="text-xs text-[#4a4946] uppercase tracking-widest flex-1 text-center">
          Zoom out
        </p>
        <div className="w-24" />
      </div>

      <div ref={threadRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        <div className="max-w-2xl mx-auto w-full space-y-6">
          {messages.map((msg, i) => {
            const isAssistant = msg.role === 'assistant'
            const isLong = msg.content.length > 220
            const isExpanded = expandedMsgs.has(i)
            const collapse = isAssistant && isLong && !isExpanded && isMobile

            return (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-xs px-4 py-3 rounded ${
                    msg.role === 'user'
                      ? 'bg-[#e8e6e1] text-[#111110]'
                      : 'bg-[#161614] border border-[#1f1f1d] text-[#d4d2cd]'
                  }`}
                >
                  <div style={{ position: 'relative' }}>
                    <p
                      className={`text-base leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'font-medium' : 'font-normal'}`}
                      style={collapse ? {
                        display: '-webkit-box',
                        WebkitLineClamp: 4,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      } : undefined}
                    >
                      {msg.content}
                    </p>
                    {collapse && (
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          height: '52px',
                          background: 'linear-gradient(to bottom, transparent, #161614)',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                  </div>
                  {collapse && (
                    <button
                      onClick={() => setExpandedMsgs(s => new Set([...s, i]))}
                      style={{
                        marginTop: '10px',
                        fontSize: '11px',
                        letterSpacing: '0.04em',
                        color: '#8c8a87',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                      }}
                    >
                      Read more ↓
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-[#161614] border border-[#1f1f1d] text-[#4a4946] px-4 py-3 rounded text-sm">
                ...
              </div>
            </div>
          )}

          {pendingAction && !isLoading && (
            <div className="flex justify-start">
              <div className="max-w-xs bg-[#161614] border border-[#2e2d2a] rounded p-4 space-y-3">
                {pendingAction.concept ? (
                  <>
                    <p className="text-xs text-[#4a4946] uppercase tracking-widest">Project seed</p>
                    <p className="text-base text-[#d4d2cd]">{pendingAction.concept}</p>
                    <button
                      onClick={handleCommitConcept}
                      disabled={isCommitting}
                      className="w-full py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd] transition-colors disabled:opacity-50"
                    >
                      {isCommitting ? 'Confirming...' : 'Confirm & begin conceptualising'}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-[#4a4946] uppercase tracking-widest">New direction</p>
                    <p className="text-base text-[#d4d2cd]">{pendingAction.trajectory}</p>
                    <button
                      onClick={handleCommitTrajectoryOnly}
                      disabled={isCommitting}
                      className="w-full py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd] transition-colors disabled:opacity-50"
                    >
                      {isCommitting ? 'Confirming...' : 'Confirm this direction'}
                    </button>
                  </>
                )}
                <p className="text-xs text-[#4a4946] text-center">or keep talking below</p>
              </div>
            </div>
          )}

          {confirmation && (
            <div className="flex justify-center">
              <p className="text-xs text-[#8c8a87]">{confirmation}</p>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-900/20 border-t border-red-700/30">
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      <div className="px-6 py-6 border-t border-[#1f1f1d] bg-[#111110]">
        <div className="max-w-2xl mx-auto w-full space-y-3">
          <div className="flex gap-3">
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
              placeholder="Tell me what's off, or where you're at..."
              disabled={isLoading}
              rows={1}
              className="flex-1 bg-[#1c1c1a] border border-[#2e2d2a] rounded px-4 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
              style={{ resize: 'none', overflowY: 'auto', maxHeight: '150px' }}
            />

            <button
              onClick={handleRecordToggle}
              disabled={isLoading}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              className={`
                w-10 h-10 rounded transition-all duration-300 flex items-center justify-center flex-shrink-0
                ${isLoading ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                ${isRecording ? 'bg-[#e8e6e1]' : 'bg-[#1c1c1a] border border-[#2e2d2a] hover:border-[#4a4946]'}
              `}
            >
              {isRecording ? (
                <span className="block w-2.5 h-2.5 bg-[#111110] rounded-sm" />
              ) : (
                <span className="block w-2.5 h-2.5 bg-[#3d3c39] rounded-full" />
              )}
            </button>

            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className="px-4 py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd] disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
            >
              Send
            </button>
          </div>

          {isRecording && (
            <p className="text-xs text-[#4a4946] text-center tracking-widest uppercase">Recording</p>
          )}
        </div>
      </div>
    </div>
  )
}
