'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useDictation } from '@/lib/use-dictation'
import { useRouter } from 'next/navigation'
import { motion as m, AnimatePresence } from 'motion/react'
import { readTextStream } from '@/lib/stream-client'
import { formatDateAsRelative } from '@/lib/dates'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { PrimaryButton } from '@/components/ui/buttons'
import { Pill } from '@/components/ui/pill'
import { Thread, Composer, type ThreadMessage } from '@/components/conversation/thread'
import { toneHue, type as typeRoles, widths } from '@/lib/design-tokens'

interface PendingAction {
  concept?: string
  trajectory?: string
  tone?: string
}

interface Trajectory {
  statement: string
  born_project: string | null
  tone: string | null
  created_at: string
}

export default function ZoomOutPage() {
  const router = useRouter()
  const { t } = useTheme()
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [inputText, setInputText] = useState('')
  const inputTextRef = useRef('')
  inputTextRef.current = inputText
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [isCommitting, setIsCommitting] = useState(false)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null)
  const [trajectoryLoaded, setTrajectoryLoaded] = useState(false)

  const { isRecording, interimText: dictationInterim, handleRecordToggle, clearInterim } = useDictation({
    onAppend: useCallback((text: string) => {
      setInputText((prev) => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text)
    }, []),
    getContext: () => inputTextRef.current.slice(-80),
  })
  const threadRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)
  const programmaticScrollRef = useRef(false)
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // The current direction is the opening card. No AI call until you speak.
  useEffect(() => {
    fetch('/api/trajectory/current')
      .then((r) => r.json())
      .then((d) => setTrajectory(d.trajectory || null))
      .catch(() => {})
      .finally(() => setTrajectoryLoaded(true))
  }, [])

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

  useEffect(() => {
    if (userScrolledUpRef.current) return
    programmaticScrollRef.current = true
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current)
    programmaticScrollTimer.current = setTimeout(() => { programmaticScrollRef.current = false }, 800)
  }, [messages, pendingAction])

  const fetchAIResponse = async (conversationHistory: ThreadMessage[]) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/trajectory/converse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: conversationHistory }) })
      if (!res.ok) { setError('Failed to get response'); return }
      setMessages([...conversationHistory, { role: 'assistant', content: '' }])
      const { text, meta } = await readTextStream<{ concept?: string; trajectory?: string; tone?: string }>(
        res,
        (visibleText) => setMessages([...conversationHistory, { role: 'assistant', content: visibleText }]),
        ['<concept>', '<trajectory>', '<tone>']
      )
      if (!text) { setMessages(conversationHistory); setError('Failed to get response'); return }
      if (meta && (meta.concept || meta.trajectory)) setPendingAction({ concept: meta.concept, trajectory: meta.trajectory, tone: meta.tone })
      else setPendingAction(null)
    } catch (err) {
      console.error('Zoom out error:', err)
      setError('Failed to get response. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return
    const userMessage: ThreadMessage = { role: 'user', content: inputText.trim() }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInputText('')
    clearInterim()
    setPendingAction(null)
    setConfirmation(null)
    await fetchAIResponse(updatedMessages)
  }

  const commit = async (payload: Record<string, unknown>, then: () => void) => {
    setIsCommitting(true)
    try {
      const res = await fetch('/api/trajectory/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, conversation: messages }) })
      if (res.ok) then()
      else setError('Failed to confirm — please try again.')
    } catch (err) {
      console.error('Commit error:', err)
      setError('Failed to confirm — please try again.')
    } finally {
      setIsCommitting(false)
    }
  }

  const handleCommitConcept = () => {
    if (!pendingAction?.concept) return
    commit({ statement: pendingAction.trajectory || pendingAction.concept, born_project: pendingAction.concept, tone: pendingAction.tone }, () =>
      router.push(`/idea-lab/conceptualise?seed=${encodeURIComponent(pendingAction.concept!)}`)
    )
  }

  const handleCommitTrajectoryOnly = () => {
    if (!pendingAction?.trajectory) return
    commit({ statement: pendingAction.trajectory, tone: pendingAction.tone }, () => {
      setConfirmation('Direction updated.')
      setTrajectory({ statement: pendingAction.trajectory!, born_project: null, tone: pendingAction.tone ?? null, created_at: new Date().toISOString() })
      setPendingAction(null)
    })
  }

  const mood = trajectory?.tone ? toneHue[trajectory.tone] ?? 'verdant' : 'verdant'

  return (
    <PageShell mood={mood} maxWidth={widths.conversation + 160} fill>
      <PageHeader eyebrow="Project Board" title="Zoom out" size="md" back="/project-board" />

      <Container fill flush padding={0}>
        <div ref={threadRef} className="zoom-out-scroll" style={{ flex: 1, overflowY: 'auto', padding: '28px 24px' }}>
          <style>{`.zoom-out-scroll::-webkit-scrollbar { display: none; } .zoom-out-scroll { scrollbar-width: none; }`}</style>
          <div style={{ maxWidth: widths.conversation, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {trajectoryLoaded && (
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  <Eyebrow>{trajectory ? 'Your current direction' : 'No direction yet'}</Eyebrow>
                  {trajectory?.tone && <Pill hue={toneHue[trajectory.tone] ?? 'verdant'} dot>{trajectory.tone}</Pill>}
                </div>
                {trajectory ? (
                  <>
                    <p style={{ ...typeRoles.quote, color: t.textPrimary }}>{trajectory.statement}</p>
                    <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, marginTop: 10 }}>Agreed {formatDateAsRelative(trajectory.created_at)}. Tell me what&apos;s off, or where you are, and we&apos;ll look at it from higher up.</p>
                  </>
                ) : (
                  <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary }}>Say where you are with the work and what feels off or alive. We&apos;ll find a direction you can stand behind.</p>
                )}
              </Card>
            )}

            <Thread messages={messages} streaming={isLoading}>
              <AnimatePresence>
                {pendingAction && !isLoading && (
                  <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
                    <Card>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                        <Eyebrow>{pendingAction.concept ? 'Project seed' : 'New direction'}</Eyebrow>
                        {pendingAction.tone && <Pill hue={toneHue[pendingAction.tone] ?? 'verdant'} dot>{pendingAction.tone}</Pill>}
                      </div>
                      <p style={{ ...typeRoles.quote, color: t.textPrimary, marginBottom: 14 }}>{pendingAction.concept ?? pendingAction.trajectory}</p>
                      <PrimaryButton onClick={pendingAction.concept ? handleCommitConcept : handleCommitTrajectoryOnly} disabled={isCommitting} loading={isCommitting} loadingLabel="Confirming…" full>
                        {pendingAction.concept ? 'Confirm & begin conceptualising' : 'Confirm this direction'}
                      </PrimaryButton>
                      <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, textAlign: 'center', marginTop: 10 }}>or keep talking below</p>
                    </Card>
                  </m.div>
                )}
              </AnimatePresence>
              {confirmation && <p style={{ ...typeRoles.small, fontSize: 12, color: t.verdant, textAlign: 'center' }}>{confirmation}</p>}
              {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>{error}</p>}
            </Thread>
            <div ref={messagesEndRef} style={{ height: 1 }} />
          </div>
        </div>

        <div style={{ padding: '14px 24px 18px', borderTop: `1px solid ${t.divider}`, flexShrink: 0 }}>
          <div style={{ maxWidth: widths.conversation, margin: '0 auto' }}>
            <Composer
              value={inputText + (dictationInterim ? (inputText && !inputText.endsWith(' ') ? ' ' : '') + dictationInterim : '')}
              onChange={(v) => { clearInterim(); setInputText(v) }}
              onSend={handleSend}
              disabled={isLoading}
              placeholder="Tell me what's off, or where you're at…"
              recording={isRecording}
              onToggleRecording={handleRecordToggle}
            />
          </div>
        </div>
      </Container>
    </PageShell>
  )
}
