'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'motion/react'
import { readTextStream } from '@/lib/stream-client'
import { shellBackground, cardPalette, accentColor } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'

const c = cardPalette['dark']

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Draft {
  seed: string | null
  question: string | null
  messages: Message[]
  phase: number
  ready_to_advance: boolean
}

const PHASE_LABELS: Record<number, string> = {
  1: 'First Contact',
  2: 'Expansion',
  3: 'The Reader',
  4: 'The Principle',
  5: 'Declaration',
}

function ConceptualiseContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const seed = searchParams.get('seed')
  const question = searchParams.get('question')

  const [activeQuestion, setActiveQuestion] = useState<string | null>(question)
  const [messages, setMessages] = useState<Message[]>([])
  const [inputText, setInputText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [phase, setPhase] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readyToAdvance, setReadyToAdvance] = useState(false)

  const [isCheckingDraft, setIsCheckingDraft] = useState(!seed)
  const [existingDraft, setExistingDraft] = useState<Draft | null>(null)
  const [resumeDecided, setResumeDecided] = useState(!!seed)
  const [isDeletingDraft, setIsDeletingDraft] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const userScrolledUpRef = useRef(false)
  const programmaticScrollRef = useRef(false)
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isStreamingLast = isLoading && messages.length > 0 && messages[messages.length - 1].role === 'assistant'

  useEffect(() => {
    if (seed) {
      const seedMessage: Message = { role: 'user', content: seed }
      setMessages([seedMessage])
      fetchAIResponse([seedMessage], 1)
      return
    }

    const checkDraft = async () => {
      try {
        const res = await fetch('/api/idea-lab/conceptualise/draft')
        const data = await res.json()
        if (data.draft) {
          setExistingDraft(data.draft)
        }
      } catch (err) {
        console.error('Failed to check for existing draft:', err)
      } finally {
        setIsCheckingDraft(false)
      }
    }

    checkDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  // Resize textarea when dictation injects text (no onChange fires for state updates)
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [inputText])

  // Interruptible scroll listener
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

  // Auto-scroll to new AI content
  useEffect(() => {
    if (messages.length === 0 || userScrolledUpRef.current) return
    programmaticScrollRef.current = true
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current)
    programmaticScrollTimer.current = setTimeout(() => {
      programmaticScrollRef.current = false
    }, 800)
  }, [messages, isLoading])

  const saveDraft = (finalMessages: Message[], savedPhase: number, savedReadyToAdvance: boolean) => {
    if (!finalMessages.some((m) => m.role === 'user')) return
    fetch('/api/idea-lab/conceptualise/draft', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seed: seed || null,
        question: activeQuestion || null,
        messages: finalMessages,
        phase: savedPhase,
        ready_to_advance: savedReadyToAdvance,
      }),
    }).catch((err) => console.error('Failed to autosave draft:', err))
  }

  const fetchAIResponse = async (conversationHistory: Message[], currentPhase: number) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/idea-lab/conceptualise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: conversationHistory,
          phase: currentPhase,
          seed: seed || undefined,
          question: activeQuestion || undefined,
        }),
      })

      if (!res.ok) {
        setError('Failed to get response')
        return
      }

      setMessages([...conversationHistory, { role: 'assistant', content: '' }])
      const { text, meta } = await readTextStream<{
        phase: number
        readyToAdvance: boolean
      }>(res, (visibleText) => {
        setMessages([...conversationHistory, { role: 'assistant', content: visibleText }])
      })

      if (!text) {
        setMessages(conversationHistory)
        setError('Failed to get response')
        return
      }

      const finalPhase = meta?.phase ?? currentPhase
      const finalReadyToAdvance = meta?.readyToAdvance ?? false

      if (meta) {
        setPhase(meta.phase)
        setReadyToAdvance(meta.readyToAdvance)
      }

      saveDraft([...conversationHistory, { role: 'assistant', content: text }], finalPhase, finalReadyToAdvance)
    } catch (err) {
      console.error('Conceptualise error:', err)
      setError('Failed to get response. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResumeDraft = () => {
    if (!existingDraft) return
    setMessages(existingDraft.messages)
    setPhase(existingDraft.phase)
    setReadyToAdvance(existingDraft.ready_to_advance)
    if (existingDraft.question) setActiveQuestion(existingDraft.question)
    setResumeDecided(true)
  }

  const handleStartFresh = () => {
    setExistingDraft(null)
    setResumeDecided(true)
    fetchAIResponse([], 1)
  }

  const handleDeleteDraft = async () => {
    setIsDeletingDraft(true)
    try {
      await fetch('/api/idea-lab/conceptualise/draft', { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to delete draft:', err)
    } finally {
      setIsDeletingDraft(false)
      setExistingDraft(null)
      setResumeDecided(true)
      fetchAIResponse([], 1)
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
    recognition.onend = () => setIsRecording(false)
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
    if (isRecording) stopRecording()
    else startRecording()
  }

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return
    const userMessage: Message = { role: 'user', content: inputText.trim() }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInputText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await fetchAIResponse(updatedMessages, phase)
  }

  const handleDeclare = () => {
    sessionStorage.setItem('conceptualisation_conversation', JSON.stringify(messages))
    fetch('/api/idea-lab/conceptualise/draft', { method: 'DELETE' }).catch((err) =>
      console.error('Failed to clear draft on declare:', err)
    )
    router.push('/idea-lab/core-concept')
  }

  if (!seed && isCheckingDraft) {
    return (
      <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: c.textMuted, fontSize: 14 }}>Loading…</p>
      </div>
    )
  }

  if (existingDraft && !resumeDecided) {
    const lastMessage = existingDraft.messages[existingDraft.messages.length - 1]
    return (
      <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <div style={{ maxWidth: 440, width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted, marginBottom: 8 }}>
              Unfinished exploration
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 300, color: c.textPrimary }}>Resume where you left off?</h1>
          </div>

          <div style={{ background: c.cardBg, border: `1px solid ${c.divider}`, borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted }}>
              Phase {existingDraft.phase}: {PHASE_LABELS[existingDraft.phase]}
            </p>
            {lastMessage && (
              <p style={{ fontSize: 15, color: c.textSecondary, lineHeight: 1.6, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                {lastMessage.content}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={handleResumeDraft}
              style={{ width: '100%', padding: '12px', background: c.textPrimary, color: c.containerBg, fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none', cursor: 'pointer' }}
            >
              Resume this exploration
            </button>
            <button
              onClick={handleStartFresh}
              style={{ width: '100%', padding: '12px', background: 'transparent', border: `1px solid ${c.divider}`, color: c.textSecondary, fontSize: 14, fontWeight: 500, borderRadius: 8, cursor: 'pointer' }}
            >
              Start a new idea instead
            </button>
            <button
              onClick={handleDeleteDraft}
              disabled={isDeletingDraft}
              style={{ background: 'none', border: 'none', fontSize: 12, color: c.textMuted, cursor: 'pointer', textDecoration: 'underline', marginTop: 4, opacity: isDeletingDraft ? 0.5 : 1 }}
            >
              {isDeletingDraft ? 'Deleting…' : 'Delete this draft'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: shellBackground, overflow: 'hidden' }}>
      <style>{`
        .conceptualise-thread::-webkit-scrollbar { display: none; }
        .conceptualise-thread { scrollbar-width: none; }
      `}</style>

      {/* Phase header */}
      <div style={{
        padding: '0 24px',
        height: 56,
        borderBottom: `1px solid ${c.divider}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexShrink: 0,
      }}>
        <IconButton onClick={() => router.push('/idea-lab')} ariaLabel="Back to Idea Lab">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </IconButton>

        <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted, flex: 1, textAlign: 'center' }}>
          Phase {phase}: {PHASE_LABELS[phase]}
        </p>

        {readyToAdvance && phase === 5 ? (
          <button
            onClick={handleDeclare}
            style={{
              padding: '6px 14px',
              background: accentColor,
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Declare this idea
          </button>
        ) : (
          <div style={{ width: 36 }} />
        )}
      </div>

      {/* Thread */}
      <div
        ref={threadRef}
        className="conceptualise-thread"
        style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}
      >
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {messages.map((msg, i) => {
            const isLastAI = msg.role === 'assistant' && i === messages.length - 1
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div style={{
                  maxWidth: '80%',
                  position: 'relative',
                }}>
                  <p style={{
                    fontSize: 16,
                    lineHeight: 1.65,
                    color: msg.role === 'user' ? c.textPrimary : c.textSecondary,
                    textAlign: msg.role === 'user' ? 'right' : 'left',
                    fontWeight: msg.role === 'user' ? 500 : 400,
                  }}>
                    {msg.content}
                  </p>
                  <AnimatePresence>
                    {isStreamingLast && isLastAI && (
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
                          height: 52,
                          background: 'linear-gradient(to top, #0f0e0d, transparent)',
                          pointerEvents: 'none',
                        }}
                      />
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )
          })}

          {isLoading && messages.length === 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <p style={{ fontSize: 14, color: c.textMuted }}>…</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '8px 24px', background: 'rgba(239,68,68,0.1)', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ fontSize: 12, color: '#fca5a5' }}>{error}</p>
        </div>
      )}

      {/* Input area */}
      <div style={{ padding: '16px 24px', borderTop: `1px solid ${c.divider}`, background: c.containerBg, flexShrink: 0 }}>
        <div style={{ maxWidth: 640, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && inputText.trim() && !isLoading) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Share your thought…"
              disabled={isLoading}
              rows={1}
              style={{
                flex: 1,
                background: c.inputBg,
                border: `1px solid ${c.inputBorder}`,
                borderRadius: 8,
                padding: '10px 14px',
                fontSize: 15,
                color: c.textPrimary,
                resize: 'none',
                overflowY: 'auto',
                maxHeight: 140,
                outline: 'none',
                lineHeight: 1.5,
                opacity: isLoading ? 0.5 : 1,
                fontFamily: 'inherit',
              }}
            />

            {/* Monotone mic */}
            <button
              onClick={handleRecordToggle}
              disabled={isLoading}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              style={{
                width: 40,
                height: 40,
                borderRadius: isRecording ? 6 : '50%',
                border: isRecording ? 'none' : `1px solid ${c.inputBorder}`,
                background: isRecording ? c.textPrimary : c.inputBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                flexShrink: 0,
                opacity: isLoading ? 0.3 : 1,
                transition: 'all 0.2s',
              }}
            >
              {isRecording ? (
                <span style={{ display: 'block', width: 10, height: 10, background: c.containerBg, borderRadius: 2 }} />
              ) : (
                <span style={{ display: 'block', width: 10, height: 10, background: c.textMuted, borderRadius: '50%' }} />
              )}
            </button>

            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              style={{
                padding: '10px 16px',
                background: accentColor,
                color: '#fff',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 8,
                border: 'none',
                cursor: !inputText.trim() || isLoading ? 'not-allowed' : 'pointer',
                opacity: !inputText.trim() || isLoading ? 0.3 : 1,
                transition: 'opacity 0.2s',
                flexShrink: 0,
              }}
            >
              Send
            </button>
          </div>

          {isRecording && (
            <p style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Recording
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ConceptualisePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: cardPalette['dark'].textMuted, fontSize: 14 }}>Loading…</p>
      </div>
    }>
      <ConceptualiseContent />
    </Suspense>
  )
}
