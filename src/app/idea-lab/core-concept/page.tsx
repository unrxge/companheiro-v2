'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow, Divider } from '@/components/shell/page-shell'
import { PrimaryButton, QuietButton, GhostButton } from '@/components/ui/buttons'
import { TextArea, TextField } from '@/components/ui/field'
import { Pill } from '@/components/ui/pill'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { JourneyCurve } from '@/components/widgets'
import { useTerritories } from '@/hooks/useTerritories'
import { arcHue, radius, type as typeRoles, type Arc } from '@/lib/design-tokens'
import { isFilled, slotShort } from '@/lib/territories'

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

interface DocumentSection {
  title: string
  status: 'pending' | 'active' | 'confirmed'
  content: Record<string, string>
}

const ARCS: Arc[] = ['Breakaway', 'Beginning', 'Expansion', 'Integration']

function DashedList({ text }: { text: string }) {
  const { t } = useTheme()
  const lines = text.split('\n').map((l) => l.replace(/^[\-\*•]\s*/, '').trim()).filter(Boolean)
  if (lines.length === 0) return null
  return (
    <div>
      {lines.map((line, i) => (
        <div key={i}>
          <div style={{ display: 'flex', gap: 10, ...typeRoles.ui, fontSize: 14, color: t.textPrimary, padding: '10px 0' }}>
            <span style={{ color: t.ember, flexShrink: 0 }}>—</span>
            <span>{line}</span>
          </div>
          {i < lines.length - 1 && <Divider />}
        </div>
      ))}
    </div>
  )
}

export default function CoreConceptPage() {
  const router = useRouter()
  const { t } = useTheme()
  const territories = useTerritories()

  const [conversation, setConversation] = useState<ConversationMessage[]>([])
  const [sections, setSections] = useState<Record<string, DocumentSection>>({
    phase1: { title: 'Idea Essence', status: 'pending', content: {} },
    phase2: { title: 'Conviction & Journey', status: 'pending', content: {} },
    phase3: { title: 'Core Truth', status: 'pending', content: {} },
    phase4: { title: 'Format & Threads', status: 'pending', content: {} },
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showConversation, setShowConversation] = useState(false)
  const [showTaskReview, setShowTaskReview] = useState(false)
  const [tasks, setTasks] = useState<Array<{ id?: string; title: string; type: 'creation' | 'execution' }>>([])
  const [pieceId, setPieceId] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskType, setNewTaskType] = useState<'creation' | 'execution'>('creation')

  useEffect(() => {
    const stored = sessionStorage.getItem('conceptualisation_conversation')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setConversation(parsed)
        initializePhase(parsed, 1)
      } catch (err) {
        console.error('Failed to parse conversation:', err)
        setError('Failed to load conversation')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const initializePhase = async (conversationData: ConversationMessage[], phase: number) => {
    setIsLoading(true)
    setError(null)
    try {
      const phaseKey = `phase${phase}`
      const confirmedSections: Record<string, string> = {}
      Object.entries(sections).forEach(([key, section]) => {
        if (section.status === 'confirmed') confirmedSections[key] = JSON.stringify(section.content)
      })
      const res = await fetch('/api/idea-lab/core-concept/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase, conversation_history: conversationData, confirmed_sections: confirmedSections }),
      })
      const data = await res.json()
      if (!data.content || Object.keys(data.content).length === 0) { setError('Failed to generate content'); return }
      setSections((prev) => ({ ...prev, [phaseKey]: { ...prev[phaseKey], status: 'active', content: data.content } }))
    } catch (err) {
      console.error('Generate error:', err)
      setError('Failed to generate content')
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmSection = (phaseKey: string) => {
    setSections((prev) => ({ ...prev, [phaseKey]: { ...prev[phaseKey], status: 'confirmed' } }))
    const phaseNum = parseInt(phaseKey.replace('phase', ''))
    if (phaseNum < 4) initializePhase(conversation, phaseNum + 1)
  }

  const handleEditContent = (phaseKey: string, field: string, value: string) => {
    setSections((prev) => ({ ...prev, [phaseKey]: { ...prev[phaseKey], content: { ...prev[phaseKey].content, [field]: value } } }))
  }

  const handleSaveDocument = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const documentData = {
        one_sentence: sections.phase1.content.one_sentence || '',
        arc: sections.phase1.content.arc || '',
        thematic_territory: sections.phase1.content.thematic_territory || '',
        conviction_statement: sections.phase2.content.conviction_statement || '',
        emotional_journey: sections.phase2.content.emotional_journey || '',
        core_truth: sections.phase3.content.core_truth || '',
        substack_goals: sections.phase4.content.substack_goals || '',
        short_form_goals: sections.phase4.content.short_form_goals || '',
        open_threads: sections.phase4.content.open_threads || '',
        conversation_history: conversation,
      }
      const res = await fetch('/api/idea-lab/core-concept/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(documentData) })
      const data = await res.json()
      if (data.success) {
        const bringIdeaFlow = sessionStorage.getItem('bring_idea_flow') === 'true'
        sessionStorage.removeItem('bring_idea_flow')
        sessionStorage.removeItem('conceptualisation_conversation')
        if (bringIdeaFlow) router.push(`/project-board?piece_id=${data.piece_id}`)
        else { setPieceId(data.piece_id); setTasks(data.tasks || []); setShowTaskReview(true) }
      } else setError(data.error || 'Failed to save document')
    } catch (err) {
      console.error('Save error:', err)
      setError('Failed to save document')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteTask = async (taskId?: string, index?: number) => {
    if (!taskId) { setTasks((prev) => prev.filter((_, i) => i !== index)); return }
    try {
      const res = await fetch('/api/project-board/tasks', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId }) })
      const data = await res.json()
      if (data.success) setTasks((prev) => prev.filter((x) => x.id !== taskId))
      else setError('Failed to delete task')
    } catch { setError('Failed to delete task') }
  }

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !pieceId) { setError('Please enter a task title'); return }
    try {
      const res = await fetch('/api/project-board/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ piece_id: pieceId, title: newTaskTitle, type: newTaskType }) })
      const data = await res.json()
      if (data.success) { setTasks((prev) => [...prev, { id: data.task?.id, title: newTaskTitle, type: newTaskType }]); setNewTaskTitle(''); setNewTaskType('creation') }
      else setError('Failed to add task')
    } catch { setError('Failed to add task') }
  }

  const allConfirmed = Object.values(sections).every((s) => s.status === 'confirmed')
  const p1 = sections.phase1
  const p2 = sections.phase2
  const p3 = sections.phase3
  const p4 = sections.phase4

  const lockedBadge = <Pill hue="verdant" dot>Locked</Pill>

  const phaseCard = (s: DocumentSection, children: React.ReactNode, extra?: React.CSSProperties) => (
    <Card style={{ position: 'relative', opacity: s.status === 'pending' ? 0.45 : 1, boxShadow: s.status === 'pending' ? 'none' : undefined, backgroundColor: s.status === 'pending' ? t.cardBgInner : undefined, transition: 'opacity 0.3s', ...extra }}>
      {s.status === 'confirmed' && <div style={{ position: 'absolute', top: 16, right: 16 }}>{lockedBadge}</div>}
      {isLoading && s.status === 'pending' && <p style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted }}>Generating…</p>}
      {s.status !== 'pending' && children}
    </Card>
  )

  const bareStyle: React.CSSProperties = { fontSize: 14, lineHeight: 1.65 }

  // ── Task review ──
  if (showTaskReview && pieceId) {
    return (
      <PageShell mood="ember" maxWidth={760}>
        <PageHeader eyebrow="Idea Lab" title="Task roadmap" subtitle="Review and edit the suggested tasks before beginning." size="md" />
        <Container>
          {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger, marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks.map((task, index) => (
              <Card key={task.id ?? index} padding="12px 16px" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <span style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary }}>{task.title}</span>
                  <Pill>{task.type}</Pill>
                </div>
                <GhostButton size="sm" onClick={() => handleDeleteTask(task.id, index)}>Remove</GhostButton>
              </Card>
            ))}
          </div>
          <Card style={{ marginTop: 16 }}>
            <Eyebrow style={{ marginBottom: 12 }}>Add task</Eyebrow>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <TextField value={newTaskTitle} onChange={setNewTaskTitle} placeholder="Task title…" ariaLabel="Task title" onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask() }} />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Pill hue="neutral" selected={newTaskType === 'creation'} onClick={() => setNewTaskType('creation')} size="md">Creation</Pill>
                <Pill hue="neutral" selected={newTaskType === 'execution'} onClick={() => setNewTaskType('execution')} size="md">Execution</Pill>
                <div style={{ flex: 1 }} />
                <QuietButton size="sm" onClick={handleAddTask}>Add</QuietButton>
              </div>
            </div>
          </Card>
          <div style={{ marginTop: 20 }}>
            <PrimaryButton onClick={() => router.push(`/project-board?piece_id=${pieceId}`)} full size="lg">Begin</PrimaryButton>
          </div>
        </Container>
      </PageShell>
    )
  }

  return (
    <PageShell mood="ember" maxWidth={900}>
      <PageHeader
        eyebrow="Idea Lab"
        title="Core concept"
        size="md"
        back="/idea-lab/conceptualise"
        actions={conversation.length > 0 ? <GhostButton size="sm" onClick={() => setShowConversation(true)}>Conversation</GhostButton> : undefined}
      />

      <Container>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{ backgroundColor: t.soft.danger, borderRadius: radius.field, padding: '10px 14px' }}>
              <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>{error}</p>
            </div>
          )}

          {/* Phase 1 — Idea essence */}
          {phaseCard(
            p1,
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <Eyebrow style={{ marginBottom: 10 }}>Idea in one sentence</Eyebrow>
                {p1.status === 'confirmed' ? (
                  <p style={{ ...typeRoles.h2, fontSize: 22, color: t.textPrimary }}>{p1.content.one_sentence}</p>
                ) : (
                  <TextArea bare voice value={p1.content.one_sentence || ''} onChange={(v) => handleEditContent('phase1', 'one_sentence', v)} placeholder="Your idea in one sentence…" ariaLabel="One sentence" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.25 }} />
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
                <div>
                  <Eyebrow style={{ marginBottom: 10 }}>Arc</Eyebrow>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ARCS.map((arc) => (
                      <Pill key={arc} hue={arcHue[arc]} selected={p1.content.arc === arc} onClick={p1.status === 'confirmed' ? undefined : () => handleEditContent('phase1', 'arc', arc)} size="md" dot>
                        {arc}
                      </Pill>
                    ))}
                  </div>
                </div>
                <div>
                  <Eyebrow style={{ marginBottom: 10 }}>Territory</Eyebrow>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {territories.slots.filter(isFilled).map((slot) => (
                      <Pill key={slot.key} hue={territories.hue(slot.key)} selected={p1.content.thematic_territory === slot.key || p1.content.thematic_territory === slotShort(slot)} onClick={p1.status === 'confirmed' ? undefined : () => handleEditContent('phase1', 'thematic_territory', slot.key)} size="md">
                        {slotShort(slot)}
                      </Pill>
                    ))}
                  </div>
                </div>
              </div>
              {p1.status !== 'confirmed' && <QuietButton onClick={() => handleConfirmSection('phase1')} full disabled={!p1.content.one_sentence || !p1.content.arc}>Confirm</QuietButton>}
            </div>
          )}

          {/* Phase 2 — Conviction & journey */}
          {phaseCard(
            p2,
            <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
              <div>
                <Eyebrow style={{ marginBottom: 10 }}>Conviction statement</Eyebrow>
                <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
                  <div style={{ width: 3, borderRadius: 2, background: t.ember, flexShrink: 0, minHeight: '2em', opacity: 0.6 }} />
                  <TextArea bare value={p2.content.conviction_statement || ''} onChange={(v) => handleEditContent('phase2', 'conviction_statement', v)} disabled={p2.status === 'confirmed'} placeholder="Your conviction about this work…" ariaLabel="Conviction" style={{ fontSize: 16, lineHeight: 1.65, fontWeight: 500 }} />
                </div>
              </div>
              <div>
                <Eyebrow style={{ marginBottom: 10 }}>Emotional journey</Eyebrow>
                {p2.content.emotional_journey && <JourneyCurve text={p2.content.emotional_journey} />}
                <div style={{ marginTop: p2.content.emotional_journey ? 12 : 0 }}>
                  <TextArea bare value={p2.content.emotional_journey || ''} onChange={(v) => handleEditContent('phase2', 'emotional_journey', v)} disabled={p2.status === 'confirmed'} placeholder="Describe the emotional arc, one beat per line…" ariaLabel="Emotional journey" style={{ ...bareStyle, color: t.textSecondary }} />
                </div>
              </div>
              {p2.status !== 'confirmed' && <QuietButton onClick={() => handleConfirmSection('phase2')} full disabled={!p2.content.conviction_statement || !p2.content.emotional_journey}>Confirm</QuietButton>}
            </div>
          )}

          {/* Phase 3 — Core truth */}
          {phaseCard(
            p3,
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center' }}>
              <Eyebrow>Core truth</Eyebrow>
              <TextArea bare value={p3.content.core_truth || ''} onChange={(v) => handleEditContent('phase3', 'core_truth', v)} disabled={p3.status === 'confirmed'} placeholder="The core truth at the heart of this work…" ariaLabel="Core truth" style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.5, letterSpacing: '-0.02em', textAlign: 'center', maxWidth: 560 }} />
              {p3.status !== 'confirmed' && <QuietButton onClick={() => handleConfirmSection('phase3')}>Confirm</QuietButton>}
            </div>,
            { padding: '36px 28px' }
          )}

          {/* Phase 4 — Format & threads */}
          {p4.status === 'pending' ? (
            phaseCard(p4, null)
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <Card>
                  <Eyebrow style={{ marginBottom: 10 }}>Writing suggestions</Eyebrow>
                  {p4.status === 'confirmed' ? <DashedList text={p4.content.substack_goals || ''} /> : <TextArea bare value={p4.content.substack_goals || ''} onChange={(v) => handleEditContent('phase4', 'substack_goals', v)} placeholder={'- First suggestion\n- Second suggestion'} ariaLabel="Writing suggestions" style={bareStyle} />}
                </Card>
                <Card>
                  <Eyebrow style={{ marginBottom: 10 }}>Visuals suggestions</Eyebrow>
                  {p4.status === 'confirmed' ? <DashedList text={p4.content.short_form_goals || ''} /> : <TextArea bare value={p4.content.short_form_goals || ''} onChange={(v) => handleEditContent('phase4', 'short_form_goals', v)} placeholder={'- First suggestion\n- Second suggestion'} ariaLabel="Visuals suggestions" style={bareStyle} />}
                </Card>
              </div>
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Eyebrow>Open threads</Eyebrow>
                  {p4.status === 'confirmed' && lockedBadge}
                </div>
                {p4.status === 'confirmed' ? <DashedList text={p4.content.open_threads || ''} /> : <TextArea bare value={p4.content.open_threads || ''} onChange={(v) => handleEditContent('phase4', 'open_threads', v)} placeholder={'- Thread one\n- Thread two'} ariaLabel="Open threads" style={bareStyle} />}
              </Card>
              {p4.status !== 'confirmed' && <QuietButton onClick={() => handleConfirmSection('phase4')} full>Confirm</QuietButton>}
            </div>
          )}

          {allConfirmed && (
            <PrimaryButton onClick={handleSaveDocument} disabled={isLoading || isSaving} loading={isSaving} loadingLabel="Saving…" full size="lg">
              Lock this document
            </PrimaryButton>
          )}
        </div>
      </Container>

      {showConversation && (
        <ModalDialog onClose={() => setShowConversation(false)} title="Conceptualisation" maxWidth="640px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {conversation.map((msg, i) => (
              <div key={i} style={{ borderBottom: i < conversation.length - 1 ? `1px solid ${t.divider}` : 'none', paddingBottom: i < conversation.length - 1 ? 18 : 0 }}>
                <Eyebrow style={{ marginBottom: 6, color: msg.role === 'user' ? t.ember : t.textMuted }}>{msg.role === 'user' ? 'You' : 'Companheiro'}</Eyebrow>
                <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
              </div>
            ))}
          </div>
        </ModalDialog>
      )}
    </PageShell>
  )
}
