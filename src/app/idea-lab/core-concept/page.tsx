'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow, Divider } from '@/components/shell/page-shell'
import { PrimaryButton, QuietButton, GhostButton } from '@/components/ui/buttons'
import { TextArea, TextField } from '@/components/ui/field'
import { Pill } from '@/components/ui/pill'
import { ConversationLogModal } from '@/components/conversation/conversation-log-modal'
import { JourneyCurve } from '@/components/widgets'
import { arcHue, radius, type as typeRoles, type Arc } from '@/lib/design-tokens'

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
  return (
    <Suspense fallback={null}>
      <CoreConceptContent />
    </Suspense>
  )
}

function CoreConceptContent() {
  const router = useRouter()
  // Read via the router, not window.location: on an in-app navigation the
  // address bar can update after this page's first effect has already run.
  const projectParam = useSearchParams().get('project')
  const { t } = useTheme()

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
  // Came via "Skip to the core concept": there's no conversation to go back to.
  const [showTaskReview, setShowTaskReview] = useState(false)
  const [tasks, setTasks] = useState<Array<{ id?: string; title: string; type: 'creation' | 'execution' }>>([])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskType, setNewTaskType] = useState<'creation' | 'execution'>('creation')

  // ?project=<id>: building the core concept later, for a project started
  // via "Skip to writing". Seeded from what the project already holds.
  const [existingProjectId, setExistingProjectId] = useState<string | null>(null)

  useEffect(() => {
    const pid = projectParam
    if (pid) {
      setExistingProjectId(pid)
      fetch(`/api/studio/projects/${pid}`)
        .then((res) => res.json())
        .then((data) => {
          const project = data.bundle?.project
          if (!project) { setError('Could not load this project'); return }
          const log = project.conceptualisation_log as ConversationMessage[] | null | undefined
          const seeded: ConversationMessage[] = log && log.length > 0 ? log : [{ role: 'user', content: `${project.title}\n\n${project.intent ?? ''}`.trim() }]
          setConversation(seeded)
          initializePhase(seeded, 1)
        })
        .catch(() => setError('Could not load this project'))
      return
    }
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
  }, [projectParam])

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
        writing_goals: sections.phase4.content.writing_goals || '',
        open_threads: sections.phase4.content.open_threads || '',
        conversation_history: conversation,
        brought_idea: existingProjectId ? null : sessionStorage.getItem('brought_idea'),
        project_id: existingProjectId,
      }
      const res = await fetch('/api/idea-lab/core-concept/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(documentData) })
      const data = await res.json()
      if (data.success) {
        const bringIdeaFlow = sessionStorage.getItem('bring_idea_flow') === 'true'
        sessionStorage.removeItem('bring_idea_flow')
        sessionStorage.removeItem('brought_idea')
        sessionStorage.removeItem('conceptualisation_conversation')
        // Both branches route by project id, not a piece id — the project's
        // own single-piece auto-open (work-page.tsx) takes it straight into
        // writing when there's nothing else on the board yet.
        if (existingProjectId) router.push(`/p/${existingProjectId}`)
        else if (bringIdeaFlow) router.push(`/p/${data.project_id}`)
        else { setProjectId(data.project_id); setNodeId(data.node_id); setTasks(data.tasks || []); setShowTaskReview(true) }
      } else setError(data.error || 'Failed to save document')
    } catch (err) {
      console.error('Save error:', err)
      setError('Failed to save document')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteTask = async (taskId?: string, index?: number) => {
    if (!taskId || !nodeId) { setTasks((prev) => prev.filter((_, i) => i !== index)); return }
    try {
      const res = await fetch(`/api/studio/nodes/${nodeId}/tasks`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId }) })
      const data = await res.json()
      if (data.success) setTasks((prev) => prev.filter((x) => x.id !== taskId))
      else setError('Failed to delete task')
    } catch { setError('Failed to delete task') }
  }

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !nodeId) { setError('Please enter a task title'); return }
    try {
      const res = await fetch(`/api/studio/nodes/${nodeId}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTaskTitle, type: newTaskType }) })
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

  // The section's own label with the lock beside it, on one line — the badge
  // belongs to the heading, not to the card's corner where it crowds the text
  // underneath. minHeight keeps the row from growing when a section locks.
  const sectionHead = (label: string, s: DocumentSection, opts?: { center?: boolean; lock?: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: opts?.center ? 'center' : 'space-between', gap: 12, minHeight: 24, marginBottom: opts?.center ? 0 : 10 }}>
      <Eyebrow>{label}</Eyebrow>
      {s.status === 'confirmed' && opts?.lock !== false && lockedBadge}
    </div>
  )

  const phaseCard = (s: DocumentSection, children: React.ReactNode, extra?: React.CSSProperties) => (
    <Card style={{ position: 'relative', opacity: s.status === 'pending' ? 0.45 : 1, boxShadow: s.status === 'pending' ? 'none' : undefined, backgroundColor: s.status === 'pending' ? t.cardBgInner : undefined, transition: 'opacity 0.3s', ...extra }}>
      {isLoading && s.status === 'pending' && <p style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted }}>Generating…</p>}
      {s.status !== 'pending' && children}
    </Card>
  )

  const bareStyle: React.CSSProperties = { fontSize: 14, lineHeight: 1.65 }

  // ── Task review ──
  if (showTaskReview && projectId) {
    return (
      <PageShell mood="ember" maxWidth={760}>
        <PageHeader eyebrow="Idea Lab" title="Task roadmap" subtitle="Review and edit the suggested tasks before beginning." size="md" />
        <Container>
          {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger, marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasks.map((task, index) => (
              <Card key={task.id ?? index} padding="12px 16px" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary, flex: 1, minWidth: 0 }}>{task.title}</span>
                {/* Fixed-width column so the label lines up whether the title takes one row or several. */}
                <div style={{ width: 84, display: 'flex', justifyContent: 'flex-start', flexShrink: 0 }}>
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
            <PrimaryButton onClick={() => router.push(`/p/${projectId}`)} full size="lg">Begin</PrimaryButton>
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
        back={existingProjectId ? `/p/${existingProjectId}` : '/idea-lab/conceptualise'}
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
                {sectionHead('Idea in one sentence', p1)}
                {p1.status === 'confirmed' ? (
                  <p style={{ ...typeRoles.h2, fontSize: 22, color: t.textPrimary }}>{p1.content.one_sentence}</p>
                ) : (
                  <TextArea bare voice value={p1.content.one_sentence || ''} onChange={(v) => handleEditContent('phase1', 'one_sentence', v)} placeholder="Your idea in one sentence…" ariaLabel="One sentence" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.25 }} />
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
                <div>
                  <Eyebrow style={{ marginBottom: 10 }}>Movement</Eyebrow>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ARCS.map((arc) => (
                      <Pill key={arc} hue={arcHue[arc]} selected={p1.content.arc === arc} onClick={p1.status === 'confirmed' ? undefined : () => handleEditContent('phase1', 'arc', arc)} size="md" dot>
                        {arc}
                      </Pill>
                    ))}
                  </div>
                </div>
                <div>
                  <Eyebrow style={{ marginBottom: 10 }}>Theme</Eyebrow>
                  {p1.status === 'confirmed' ? (
                    <p style={{ ...typeRoles.ui, fontSize: 15, color: t.textPrimary }}>{p1.content.thematic_territory}</p>
                  ) : (
                    <TextField value={p1.content.thematic_territory || ''} onChange={(v) => handleEditContent('phase1', 'thematic_territory', v)} placeholder="What this piece is about…" ariaLabel="Theme" />
                  )}
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
                {sectionHead('Conviction statement', p2)}
                <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
                  <div style={{ width: 3, borderRadius: 2, background: t.ember, flexShrink: 0, minHeight: '2em', opacity: 0.6 }} />
                  <TextArea bare value={p2.content.conviction_statement || ''} onChange={(v) => handleEditContent('phase2', 'conviction_statement', v)} disabled={p2.status === 'confirmed'} placeholder="Your conviction about this work…" ariaLabel="Conviction" style={{ fontSize: 16, lineHeight: 1.65, fontWeight: 500 }} />
                </div>
              </div>
              <div>
                <Eyebrow style={{ marginBottom: 10 }}>Emotional journey</Eyebrow>
                {p2.content.emotional_journey && <JourneyCurve text={p2.content.emotional_journey} />}
                <div style={{ marginTop: p2.content.emotional_journey ? 12 : 0 }}>
                  <TextArea bare value={p2.content.emotional_journey || ''} onChange={(v) => handleEditContent('phase2', 'emotional_journey', v)} disabled={p2.status === 'confirmed'} placeholder={'One beat per line: a short label — what the audience goes through'} ariaLabel="Emotional journey" style={{ ...bareStyle, color: t.textSecondary }} />
                </div>
              </div>
              {p2.status !== 'confirmed' && <QuietButton onClick={() => handleConfirmSection('phase2')} full disabled={!p2.content.conviction_statement || !p2.content.emotional_journey}>Confirm</QuietButton>}
            </div>
          )}

          {/* Phase 3 — Core truth */}
          {phaseCard(
            p3,
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center' }}>
              {sectionHead('Core truth', p3, { center: true })}
              <TextArea bare value={p3.content.core_truth || ''} onChange={(v) => handleEditContent('phase3', 'core_truth', v)} disabled={p3.status === 'confirmed'} placeholder="The core truth at the heart of this work…" ariaLabel="Core truth" style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.5, letterSpacing: '-0.02em', textAlign: 'center', maxWidth: 560 }} />
              {p3.status !== 'confirmed' && <QuietButton onClick={() => handleConfirmSection('phase3')}>Confirm</QuietButton>}
            </div>,
            { padding: '36px 28px' }
          )}

          {/* Phase 4 — Writing suggestions & open threads, side by side */}
          {p4.status === 'pending' ? (
            phaseCard(p4, null)
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                <Card>
                  {sectionHead('Writing suggestions', p4, { lock: false })}
                  {p4.status === 'confirmed' ? <DashedList text={p4.content.writing_goals || ''} /> : <TextArea bare value={p4.content.writing_goals || ''} onChange={(v) => handleEditContent('phase4', 'writing_goals', v)} placeholder={'- First suggestion\n- Second suggestion'} ariaLabel="Writing suggestions" style={bareStyle} />}
                </Card>
                <Card>
                  {sectionHead('Open threads', p4)}
                  {p4.status === 'confirmed' ? <DashedList text={p4.content.open_threads || ''} /> : <TextArea bare value={p4.content.open_threads || ''} onChange={(v) => handleEditContent('phase4', 'open_threads', v)} placeholder={'- Thread one\n- Thread two'} ariaLabel="Open threads" style={bareStyle} />}
                </Card>
              </div>
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

      {showConversation && <ConversationLogModal messages={conversation} onClose={() => setShowConversation(false)} />}
    </PageShell>
  )
}
