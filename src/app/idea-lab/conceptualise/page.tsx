'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useDictation } from '@/lib/use-dictation'
import { joinText } from '@/lib/dictation-text'
import { useSearchParams, useRouter } from 'next/navigation'
import { readTextStream } from '@/lib/stream-client'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { PrimaryButton, QuietButton, GhostButton } from '@/components/ui/buttons'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Thread, Composer, type ThreadMessage } from '@/components/conversation/thread'
import { PhaseDots } from '@/components/widgets'
import { shell, type as typeRoles, widths } from '@/lib/design-tokens'

interface Draft {
  id: string
  seed: string | null
  question: string | null
  messages: ThreadMessage[]
  phase: number
  ready_to_advance: boolean
  updated_at: string
  brought?: boolean
}

const PHASE_LABELS = ['First Contact', 'Expansion', 'The Reader', 'The Principle', 'Declaration']
const PHASE_MARKER = '<phase_complete/>'

function ConceptualiseContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useTheme()
  const confirm = useConfirm()
  const seed = searchParams.get('seed')
  const question = searchParams.get('question')
  const resumeId = searchParams.get('resume')
  // "Bring an idea": the person opens the conversation with an idea they
  // already carry, instead of answering a summoned question.
  const bringMode = searchParams.get('mode') === 'bring'

  const [activeQuestion, setActiveQuestion] = useState<string | null>(question)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [inputText, setInputText] = useState('')
  const inputTextRef = useRef('')
  inputTextRef.current = inputText
  const [phase, setPhase] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [readyToAdvance, setReadyToAdvance] = useState(false)
  const [brought, setBrought] = useState(bringMode)
  const broughtSeedRef = useRef<string | null>(null)

  const [isCheckingDraft, setIsCheckingDraft] = useState(!seed && !resumeId && !bringMode)
  const [existingDrafts, setExistingDrafts] = useState<Draft[]>([])
  const [resumeDecided, setResumeDecided] = useState(!!seed || !!resumeId || bringMode)
  const draftIdRef = useRef<string>(crypto.randomUUID())

  const { isRecording, interimText: dictationInterim, handleRecordToggle, clearInterim, finish: finishDictation } = useDictation({
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

  useEffect(() => {
    if (seed) {
      const seedMessage: ThreadMessage = { role: 'user', content: seed }
      setMessages([seedMessage])
      fetchAIResponse([seedMessage], 1)
      return
    }
    // Opened from the Idea Lab's "Bring an idea" box: that text is the first turn.
    if (bringMode) {
      const opening = sessionStorage.getItem('brought_opening')
      sessionStorage.removeItem('brought_opening')
      if (opening) {
        const first: ThreadMessage = { role: 'user', content: opening }
        broughtSeedRef.current = opening
        setMessages([first])
        fetchAIResponse([first], 1)
      }
      return
    }
    if (resumeId) {
      const autoResume = async () => {
        try {
          const res = await fetch('/api/idea-lab/conceptualise/draft')
          const data = await res.json()
          const draft = (data.drafts as Draft[] | undefined)?.find((d) => d.id === resumeId)
          if (draft) {
            draftIdRef.current = draft.id
            setMessages(draft.messages)
            setPhase(draft.phase)
            setReadyToAdvance(draft.ready_to_advance)
            if (draft.question) setActiveQuestion(draft.question)
            if (draft.brought) { setBrought(true); broughtSeedRef.current = draft.seed }
          }
        } catch (err) {
          console.error('Failed to auto-resume draft:', err)
        }
      }
      autoResume()
      return
    }
    const checkDraft = async () => {
      try {
        const res = await fetch('/api/idea-lab/conceptualise/draft')
        const data = await res.json()
        if (data.drafts && data.drafts.length > 0) setExistingDrafts(data.drafts)
      } catch (err) {
        console.error('Failed to check for existing draft:', err)
      } finally {
        setIsCheckingDraft(false)
      }
    }
    checkDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, resumeId, bringMode])

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
  }, [resumeDecided])

  useEffect(() => {
    if (messages.length === 0 || userScrolledUpRef.current) return
    programmaticScrollRef.current = true
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current)
    programmaticScrollTimer.current = setTimeout(() => { programmaticScrollRef.current = false }, 800)
  }, [messages, isLoading, inputText])

  const saveDraft = (finalMessages: ThreadMessage[], savedPhase: number, savedReadyToAdvance: boolean) => {
    if (!finalMessages.some((x) => x.role === 'user')) return
    fetch('/api/idea-lab/conceptualise/draft', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: draftIdRef.current, seed: seed || broughtSeedRef.current || null, question: activeQuestion || null, messages: finalMessages, phase: savedPhase, ready_to_advance: savedReadyToAdvance, brought }),
    }).catch((err) => console.error('Failed to autosave draft:', err))
  }

  const fetchAIResponse = async (conversationHistory: ThreadMessage[], currentPhase: number) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/idea-lab/conceptualise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: conversationHistory, phase: currentPhase, seed: seed || undefined, question: activeQuestion || undefined, brought: brought || undefined }),
      })
      if (!res.ok) { setError('Failed to get response'); return }

      setMessages([...conversationHistory, { role: 'assistant', content: '' }])
      const { text, meta } = await readTextStream<{ phase: number; readyToAdvance: boolean; phaseComplete?: boolean }>(
        res,
        (visibleText) => setMessages([...conversationHistory, { role: 'assistant', content: visibleText }]),
        [PHASE_MARKER]
      )
      if (!text) { setMessages(conversationHistory); setError('Failed to get response'); return }

      const finalPhase = meta?.phase ?? currentPhase
      const finalReadyToAdvance = meta?.readyToAdvance ?? false
      if (meta) { setPhase(meta.phase); setReadyToAdvance(meta.readyToAdvance) }

      // Keep the completion marker in history (hidden in display) so the
      // server advances the phase on the next turn.
      const stored = meta?.phaseComplete ? `${text}\n${PHASE_MARKER}` : text
      const finalMessages: ThreadMessage[] = [...conversationHistory, { role: 'assistant', content: stored }]
      setMessages(finalMessages)
      saveDraft(finalMessages, finalPhase, finalReadyToAdvance)
    } catch (err) {
      console.error('Conceptualise error:', err)
      setError('Failed to get response. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResumeDraft = (draft: Draft) => {
    draftIdRef.current = draft.id
    setMessages(draft.messages)
    setPhase(draft.phase)
    setReadyToAdvance(draft.ready_to_advance)
    if (draft.question) setActiveQuestion(draft.question)
    if (draft.brought) { setBrought(true); broughtSeedRef.current = draft.seed }
    setResumeDecided(true)
  }

  const handleStartFresh = () => {
    draftIdRef.current = crypto.randomUUID()
    setExistingDrafts([])
    setResumeDecided(true)
    fetchAIResponse([], 1)
  }

  const handleDeleteDraft = async (draftId: string) => {
    const ok = await confirm({ title: 'Discard this exploration?', body: 'The conversation is deleted. Nothing else is affected.', confirmLabel: 'Discard', danger: true })
    if (!ok) return
    try {
      await fetch(`/api/idea-lab/conceptualise/draft?id=${draftId}`, { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to delete draft:', err)
    }
    setExistingDrafts((prev) => prev.filter((d) => d.id !== draftId))
  }

  const handleSend = async () => {
    if (isLoading) return
    // What's on screen, including words still being punctuated.
    const text = joinText(inputText, finishDictation({ keepListening: true })).trim()
    if (!text) return
    const userMessage: ThreadMessage = { role: 'user', content: text }
    if (brought && !messages.some((x) => x.role === 'user')) broughtSeedRef.current = userMessage.content
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInputText('')
    await fetchAIResponse(updatedMessages, phase)
  }

  const handleDeclare = () => {
    // The idea as first brought becomes the piece's starting draft.
    const firstUser = messages.find((x) => x.role === 'user')
    if (brought && firstUser) sessionStorage.setItem('brought_idea', firstUser.content)
    else sessionStorage.removeItem('brought_idea')
    sessionStorage.removeItem('bring_idea_flow')
    sessionStorage.setItem('conceptualisation_conversation', JSON.stringify(messages.map((x) => ({ ...x, content: x.content.split(PHASE_MARKER).join('').trim() }))))
    fetch(`/api/idea-lab/conceptualise/draft?id=${draftIdRef.current}`, { method: 'DELETE' }).catch((err) => console.error('Failed to clear draft on declare:', err))
    router.push('/idea-lab/core-concept')
  }

  if (!seed && isCheckingDraft) {
    return (
      <PageShell mood="ember" maxWidth={widths.conversation}>
        <PageHeader eyebrow="Idea Lab" title="Conceptualise" size="md" back="/idea-lab" />
        <p style={{ ...typeRoles.small, color: shell.muted }}>Loading…</p>
      </PageShell>
    )
  }

  if (existingDrafts.length > 0 && !resumeDecided) {
    return (
      <PageShell mood="ember" maxWidth={widths.conversation}>
        <PageHeader eyebrow="Idea Lab · Unfinished explorations" title={existingDrafts.length === 1 ? 'Resume where you left off?' : `You have ${existingDrafts.length} unfinished ideas`} size="md" back="/idea-lab" />
        <Container>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {existingDrafts.map((draft) => {
              const lastMsg = draft.messages[draft.messages.length - 1]
              const raw = (lastMsg?.content ?? '').split(PHASE_MARKER).join('').trim()
              const preview = raw.slice(0, 140) + (raw.length > 140 ? '…' : '')
              return (
                <Card key={draft.id}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                    <PhaseDots phase={draft.phase} labels={PHASE_LABELS} />
                    <GhostButton size="sm" onClick={() => handleDeleteDraft(draft.id)}>Discard</GhostButton>
                  </div>
                  {preview && <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary, marginBottom: 14 }}>{preview}</p>}
                  <QuietButton onClick={() => handleResumeDraft(draft)} full>Resume this exploration</QuietButton>
                </Card>
              )
            })}
            <GhostButton onClick={handleStartFresh} full>Start a new exploration</GhostButton>
          </div>
        </Container>
      </PageShell>
    )
  }

  return (
    <PageShell mood="ember" maxWidth={widths.conversation + 160} fill>
      <PageHeader
        eyebrow="Idea Lab"
        title="Conceptualise"
        size="md"
        back="/idea-lab"
        actions={readyToAdvance && phase === 5 ? <PrimaryButton size="sm" onClick={handleDeclare}>Declare this idea</PrimaryButton> : undefined}
      />

      <Container fill flush padding={0}>
        <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${t.divider}`, flexShrink: 0 }}>
          <div style={{ maxWidth: 420 }}>
            <PhaseDots phase={phase} labels={PHASE_LABELS} />
          </div>
        </div>

        <div ref={threadRef} className="conceptualise-thread" style={{ flex: 1, overflowY: 'auto', padding: '28px 24px' }}>
          <style>{`.conceptualise-thread::-webkit-scrollbar { display: none; } .conceptualise-thread { scrollbar-width: none; }`}</style>
          <div style={{ maxWidth: widths.conversation, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {activeQuestion && (
              <Card>
                <Eyebrow style={{ marginBottom: 8, color: t.ember }}>Your prompt</Eyebrow>
                <p style={{ ...typeRoles.quote, color: t.textPrimary }}>{activeQuestion}</p>
              </Card>
            )}
            {brought && messages.length === 0 && (
              <Card>
                <Eyebrow style={{ marginBottom: 8, color: t.ember }}>Bring an idea</Eyebrow>
                <p style={{ ...typeRoles.quote, color: t.textPrimary, marginBottom: 8 }}>What&apos;s the idea you&apos;ve been carrying?</p>
                <p style={{ ...typeRoles.small, color: t.textMuted }}>Say it however it comes: the angle, the feeling, who it&apos;s for, what&apos;s still unclear. We&apos;ll work it into shape together.</p>
              </Card>
            )}
            <Thread messages={messages} streaming={isLoading}>
              {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>{error}</p>}
            </Thread>
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div style={{ padding: '14px 24px 18px', borderTop: `1px solid ${t.divider}`, flexShrink: 0 }}>
          <div style={{ maxWidth: widths.conversation, margin: '0 auto' }}>
            <Composer
              value={inputText + (dictationInterim ? (inputText && !inputText.endsWith(' ') ? ' ' : '') + dictationInterim : '')}
              onChange={(v) => { clearInterim(); setInputText(v) }}
              onSend={handleSend}
              disabled={isLoading}
              placeholder={brought && messages.length === 0 ? 'Describe your idea…' : 'Share your thought…'}
              recording={isRecording}
              onToggleRecording={handleRecordToggle}
            />
          </div>
        </div>
      </Container>
    </PageShell>
  )
}

export default function ConceptualisePage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: shell.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: shell.muted, fontSize: 14 }}>Loading…</p>
        </div>
      }
    >
      <ConceptualiseContent />
    </Suspense>
  )
}
