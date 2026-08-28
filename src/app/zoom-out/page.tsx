'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { readTextStream } from '@/lib/stream-client'
import { cardPalette, shellBackground, accentColor } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface PendingAction {
  concept?: string
  trajectory?: string
  tone?: string
}

const c = cardPalette['dark']

const eyebrow: React.CSSProperties = {
  fontFamily: 'var(--font-geist-sans)',
  fontSize: '11px',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontWeight: 600,
  color: c.textMuted,
  margin: 0,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)
  const programmaticScrollRef = useRef(false)
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetchAIResponse([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track manual scroll
  useEffect(() => {
    const container = threadRef.current
    if (!container) return
    const onScroll = () => {
      if (programmaticScrollRef.current) return
      const { scrollTop, scrollHeight, clientHeight } = container
      userScrolledUpRef.current = scrollHeight - scrollTop - clientHeight > 100
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll, interruptible
  useEffect(() => {
    if (userScrolledUpRef.current) return
    programmaticScrollRef.current = true
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current)
    programmaticScrollTimer.current = setTimeout(() => {
      programmaticScrollRef.current = false
    }, 800)
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
    recognition.onstart = () => setIsRecording(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i][0].isFinal) setInputText((prev) => prev + transcript + ' ')
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      setError(`Error: ${event.error}`)
      setIsRecording(false)
    }
    recognition.onend = () => setIsRecording(false)
    recognitionRef.current = recognition
    recognition.start()
  }

  const stopRecording = () => {
    recognitionRef.current?.stop()
    setIsRecording(false)
  }

  const handleRecordToggle = () => {
    if (isRecording) stopRecording()
    else startRecording()
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
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: shellBackground,
        overflow: 'hidden',
      }}
    >
      <style>{`
        .zoom-out-scroll::-webkit-scrollbar { display: none; }
        .zoom-out-scroll { scrollbar-width: none; }
      `}</style>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexShrink: 0,
          borderBottom: `1px solid rgba(255,255,255,0.05)`,
        }}
      >
        <IconButton href="/project-board" ariaLabel="Back to project board">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#e8e6e0"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </IconButton>
        <h1
          style={{
            fontFamily: 'var(--font-geist-sans)',
            fontWeight: 700,
            fontSize: '20px',
            color: '#e8e6e0',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Zoom out
        </h1>
      </motion.div>

      {/* Thread */}
      <div
        ref={threadRef}
        className="zoom-out-scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '32px 24px 0' }}
      >
        <div
          style={{
            maxWidth: '560px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '28px',
            paddingBottom: '32px',
          }}
        >
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => {
              const isStreamingLast =
                isLoading && i === messages.length - 1 && msg.role === 'assistant'
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div style={{ position: 'relative', maxWidth: '88%' }}>
                    <p
                      style={{
                        fontFamily: 'var(--font-geist-sans)',
                        fontSize: '16px',
                        lineHeight: 1.65,
                        margin: 0,
                        color: msg.role === 'user' ? c.textPrimary : c.textSecondary,
                        fontWeight: msg.role === 'user' ? 500 : 400,
                        textAlign: msg.role === 'user' ? 'right' : 'left',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.content}
                    </p>
                    <AnimatePresence>
                      {isStreamingLast && (
                        <motion.div
                          key="veil"
                          initial={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.5, ease: 'easeOut' }}
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: '52px',
                            background: 'linear-gradient(to top, #111110, transparent)',
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <p
              style={{
                fontFamily: 'var(--font-geist-sans)',
                fontSize: '14px',
                color: c.textMuted,
                margin: 0,
              }}
            >
              ...
            </p>
          )}

          {/* Pending action card */}
          <AnimatePresence>
            {pendingAction && !isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.35 }}
                style={{
                  backgroundColor: c.cardBg,
                  boxShadow: c.shadow,
                  borderRadius: '16px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <p style={eyebrow}>
                  {pendingAction.concept ? 'Project seed' : 'New direction'}
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-geist-sans)',
                    fontSize: '16px',
                    color: c.textPrimary,
                    lineHeight: 1.55,
                    margin: 0,
                    fontWeight: 500,
                  }}
                >
                  {pendingAction.concept ?? pendingAction.trajectory}
                </p>
                <motion.button
                  onClick={
                    pendingAction.concept ? handleCommitConcept : handleCommitTrajectoryOnly
                  }
                  disabled={isCommitting}
                  whileHover={isCommitting ? {} : { opacity: 0.85 }}
                  whileTap={isCommitting ? {} : { scale: 0.98 }}
                  style={{
                    padding: '11px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: accentColor,
                    color: '#ffffff',
                    fontFamily: 'var(--font-geist-sans)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: isCommitting ? 'not-allowed' : 'pointer',
                    opacity: isCommitting ? 0.4 : 1,
                  }}
                >
                  {isCommitting
                    ? 'Confirming...'
                    : pendingAction.concept
                    ? 'Confirm & begin conceptualising'
                    : 'Confirm this direction'}
                </motion.button>
                <p
                  style={{
                    fontFamily: 'var(--font-geist-sans)',
                    fontSize: '12px',
                    color: c.textMuted,
                    margin: 0,
                    textAlign: 'center',
                  }}
                >
                  or keep talking below
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {confirmation && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                fontFamily: 'var(--font-geist-sans)',
                fontSize: '12px',
                color: c.textMuted,
                margin: 0,
                textAlign: 'center',
              }}
            >
              {confirmation}
            </motion.p>
          )}

          {error && (
            <p
              style={{
                fontFamily: 'var(--font-geist-sans)',
                fontSize: '12px',
                color: '#f87171',
                margin: 0,
              }}
            >
              {error}
            </p>
          )}

          <div ref={messagesEndRef} style={{ height: '1px' }} />
        </div>
      </div>

      {/* Input bar */}
      <div
        style={{
          padding: '16px 24px 36px',
          borderTop: `1px solid rgba(255,255,255,0.05)`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            maxWidth: '560px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
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
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Tell me what's off, or where you're at..."
              disabled={isLoading}
              rows={1}
              style={{
                flex: 1,
                backgroundColor: c.inputBg,
                border: `1px solid ${c.inputBorder}`,
                borderRadius: '12px',
                padding: '11px 14px',
                fontFamily: 'var(--font-geist-sans)',
                fontSize: '15px',
                color: c.textPrimary,
                outline: 'none',
                resize: 'none',
                overflowY: 'auto',
                maxHeight: '140px',
                lineHeight: 1.55,
                opacity: isLoading ? 0.5 : 1,
              }}
            />

            {/* Mic — monotone */}
            <motion.button
              onClick={handleRecordToggle}
              disabled={isLoading}
              whileHover={isLoading ? {} : { scale: 1.05 }}
              whileTap={isLoading ? {} : { scale: 0.95 }}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                flexShrink: 0,
                backgroundColor: isRecording ? '#e8e6e0' : c.inputBg,
                border: `1.5px solid ${isRecording ? 'transparent' : c.inputBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                opacity: isLoading ? 0.3 : 1,
                transition: 'background-color 0.2s ease',
              }}
            >
              {isRecording ? (
                <span
                  style={{
                    display: 'block',
                    width: '14px',
                    height: '14px',
                    backgroundColor: '#111110',
                    borderRadius: '2px',
                  }}
                />
              ) : (
                <span
                  style={{
                    display: 'block',
                    width: '14px',
                    height: '14px',
                    backgroundColor: c.textSecondary,
                    borderRadius: '50%',
                  }}
                />
              )}
            </motion.button>

            <motion.button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              whileHover={!inputText.trim() || isLoading ? {} : { opacity: 0.85 }}
              whileTap={!inputText.trim() || isLoading ? {} : { scale: 0.97 }}
              style={{
                padding: '11px 18px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: accentColor,
                color: '#ffffff',
                fontFamily: 'var(--font-geist-sans)',
                fontWeight: 600,
                fontSize: '13px',
                flexShrink: 0,
                cursor: !inputText.trim() || isLoading ? 'not-allowed' : 'pointer',
                opacity: !inputText.trim() || isLoading ? 0.3 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              Send
            </motion.button>
          </div>

          <AnimatePresence>
            {isRecording && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                style={{
                  fontFamily: 'var(--font-geist-sans)',
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  color: c.textMuted,
                  margin: 0,
                  textAlign: 'center',
                }}
              >
                Recording
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
