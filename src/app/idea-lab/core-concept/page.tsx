'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { shellBackground, cardPalette } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'

const c = cardPalette['dark']
const GREEN = '#10B981'

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

interface DocumentSection {
  title: string
  status: 'pending' | 'active' | 'confirmed'
  content: Record<string, string>
}

function EmotionalJourneyWidget({ text }: { text: string }) {
  const stages = useMemo(() => {
    const sentences = text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 8)
    if (sentences.length === 0) return ['Beginning', 'Rising', 'Resolution']
    return sentences.slice(0, 5).map(s => {
      const words = s.split(' ')
      return words.slice(0, Math.min(3, words.length)).join(' ')
    })
  }, [text])

  const n = stages.length
  const W = 500, H = 64, PAD = 40

  const heights = useMemo(() => stages.map((stage, i) => {
    const t = i / (n - 1 || 1)
    const base = Math.sin(t * Math.PI) * 0.8
    const hash = stage.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
    return Math.max(0.08, Math.min(0.92, base + (hash % 15 - 7) / 100))
  }), [stages, n])

  const pts = heights.map((h, i) => ({
    x: n <= 1 ? W / 2 : PAD + (i / (n - 1)) * (W - PAD * 2),
    y: H - h * (H - 8),
  }))

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const cpx = ((pts[i - 1].x + pts[i].x) / 2).toFixed(1)
    d += ` C ${cpx} ${pts[i - 1].y.toFixed(1)} ${cpx} ${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`
  }

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 28}`} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id="ejGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={GREEN} stopOpacity="0.15" />
          <stop offset="100%" stopColor={GREEN} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${pts[pts.length - 1].x} ${H + 2} L ${pts[0].x} ${H + 2} Z`} fill="url(#ejGrad)" />
      <path d={d} fill="none" stroke={GREEN} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={3} fill={GREEN} />
          <text x={p.x} y={H + 20} textAnchor="middle" fontSize={8.5} fontFamily="inherit" fill={c.textMuted}>
            {stages[i].length > 15 ? stages[i].slice(0, 14) + '…' : stages[i]}
          </text>
        </g>
      ))}
    </svg>
  )
}

function DashedList({ text }: { text: string }) {
  const lines = text.split('\n').map(l => l.replace(/^[\-\*•]\s*/, '').trim()).filter(Boolean)
  if (lines.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lines.map((line, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, fontSize: 14, color: c.textPrimary, lineHeight: 1.55 }}>
          <span style={{ color: c.textMuted, flexShrink: 0, fontWeight: 300 }}>—</span>
          <span>{line}</span>
        </div>
      ))}
    </div>
  )
}

export default function CoreConceptPage() {
  const router = useRouter()
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
  }, [])

  // Auto-resize all plain textareas when section data loads
  useEffect(() => {
    document.querySelectorAll('textarea.cc-plain').forEach(el => {
      const ta = el as HTMLTextAreaElement
      ta.style.height = 'auto'
      ta.style.height = ta.scrollHeight + 'px'
    })
  }, [sections])

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
      setSections(prev => ({ ...prev, [phaseKey]: { ...prev[phaseKey], status: 'active', content: data.content } }))
    } catch (err) {
      console.error('Generate error:', err)
      setError('Failed to generate content')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePhaseGenerate = async (phase: number) => initializePhase(conversation, phase)

  const handleConfirmSection = (phaseKey: string, updatedContent?: Record<string, string>) => {
    setSections(prev => ({
      ...prev,
      [phaseKey]: { ...prev[phaseKey], status: 'confirmed', content: updatedContent || prev[phaseKey].content },
    }))
    const phaseNum = parseInt(phaseKey.replace('phase', ''))
    if (phaseNum < 4) handlePhaseGenerate(phaseNum + 1)
  }

  const handleEditContent = (phaseKey: string, field: string, value: string) => {
    setSections(prev => ({
      ...prev,
      [phaseKey]: { ...prev[phaseKey], content: { ...prev[phaseKey].content, [field]: value } },
    }))
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
      const res = await fetch('/api/idea-lab/core-concept/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(documentData),
      })
      const data = await res.json()
      if (data.success) { setPieceId(data.piece_id); setTasks(data.tasks || []); setShowTaskReview(true) }
      else setError(data.error || 'Failed to save document')
    } catch (err) {
      console.error('Save error:', err)
      setError('Failed to save document')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteTask = async (taskId?: string) => {
    if (!taskId) { setTasks(prev => prev.filter(t => t.id !== taskId)); return }
    try {
      const res = await fetch('/api/project-board/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      })
      const data = await res.json()
      if (data.success) setTasks(prev => prev.filter(t => t.id !== taskId))
      else setError('Failed to delete task')
    } catch { setError('Failed to delete task') }
  }

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !pieceId) { setError('Please enter a task title'); return }
    try {
      const res = await fetch('/api/project-board/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId, title: newTaskTitle, type: newTaskType }),
      })
      const data = await res.json()
      if (data.success) { setTasks(prev => [...prev, { title: newTaskTitle, type: newTaskType }]); setNewTaskTitle(''); setNewTaskType('creation') }
      else setError('Failed to add task')
    } catch { setError('Failed to add task') }
  }

  const handleBegin = () => { if (pieceId) router.push(`/project-board?piece_id=${pieceId}`) }

  const allConfirmed = Object.values(sections).every(s => s.status === 'confirmed')

  const autoResize = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'
  }

  const greenBadge = (
    <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(16,185,129,0.75)', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 4 }}>Locked</span>
  )

  function phaseCardStyle(s: DocumentSection): React.CSSProperties {
    return {
      background: s.status === 'pending' ? c.containerBg : c.cardBg,
      border: s.status === 'confirmed' ? '1px solid rgba(16,185,129,0.22)' : `1px solid ${c.divider}`,
      borderRadius: 16,
      boxShadow: s.status === 'pending' ? 'none' : c.shadow,
      opacity: s.status === 'pending' ? 0.42 : 1,
      transition: 'opacity 0.3s',
    }
  }

  const p1 = sections.phase1
  const p2 = sections.phase2
  const p3 = sections.phase3
  const p4 = sections.phase4

  // Task review screen
  if (showTaskReview && pieceId) {
    return (
      <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0 24px', height: 64, borderBottom: `1px solid ${c.divider}`, display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <IconButton onClick={() => router.push('/idea-lab/conceptualise')} ariaLabel="Back to Conceptualise">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </IconButton>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: c.textPrimary, letterSpacing: '-0.02em' }}>Task Roadmap</h1>
        </div>
        <div style={{ flex: 1, padding: '40px 24px 64px', maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ background: c.containerBg, borderRadius: 20, boxShadow: c.shadow, padding: '28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontSize: 13, color: c.textMuted, margin: 0 }}>Review and edit the suggested tasks before beginning.</p>
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ fontSize: 12, color: '#fca5a5', margin: 0 }}>{error}</p>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tasks.map((task, index) => (
                <div key={index} style={{ background: c.cardBg, boxShadow: c.shadow, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, color: c.textPrimary, lineHeight: 1.4 }}>{task.title}</span>
                    <span style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted, background: c.containerBg, padding: '2px 8px', borderRadius: 4, flexShrink: 0 }}>{task.type}</span>
                  </div>
                  <button onClick={() => handleDeleteTask(task.id)} style={{ fontSize: 12, color: c.textMuted, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#ef4444' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = c.textMuted }}>Remove</button>
                </div>
              ))}
            </div>
            <div style={{ background: c.cardBg, boxShadow: c.shadow, borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted, margin: 0 }}>Add task</p>
              <input type="text" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} placeholder="Task title…"
                style={{ width: '100%', background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 10, padding: '10px 14px', fontSize: 14, color: c.textPrimary, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={newTaskType} onChange={e => setNewTaskType(e.target.value as 'creation' | 'execution')}
                  style={{ flex: 1, background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 10, padding: '10px 14px', fontSize: 13, color: c.textPrimary, outline: 'none' }}>
                  <option value="creation">Creation</option>
                  <option value="execution">Execution</option>
                </select>
                <button onClick={handleAddTask} style={{ padding: '10px 18px', background: c.textPrimary, color: c.containerBg, fontSize: 13, fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer' }}>Add</button>
              </div>
            </div>
            <button onClick={handleBegin} style={{ width: '100%', padding: '13px', background: c.textPrimary, color: c.containerBg, fontSize: 14, fontWeight: 600, borderRadius: 12, border: 'none', cursor: 'pointer' }}>Begin</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .cc-plain {
          background: transparent;
          border: none;
          outline: none;
          width: 100%;
          font-family: inherit;
          resize: none;
          padding: 0;
          display: block;
          color: ${c.textPrimary};
        }
        .cc-plain:not(:disabled):hover { background: rgba(232,230,224,0.025); border-radius: 4px; }
        .cc-plain:not(:disabled):focus { box-shadow: 0 1px 0 rgba(232,230,224,0.1); border-radius: 4px 4px 0 0; }
        .cc-plain:disabled { cursor: default; opacity: 0.72; }
        .cc-label { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; color: ${c.textMuted}; margin: 0 0 10px; display: block; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '0 24px', height: 64, borderBottom: `1px solid ${c.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <IconButton onClick={() => router.push('/idea-lab/conceptualise')} ariaLabel="Back to Conceptualise">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </IconButton>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: c.textPrimary, letterSpacing: '-0.02em' }}>Core Concept</h1>
        </div>
        {conversation.length > 0 && (
          <button onClick={() => setShowConversation(true)} style={{ fontSize: 12, color: c.textSecondary, background: 'none', border: `1px solid ${c.divider}`, borderRadius: 10, padding: '7px 14px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            View conversation
          </button>
        )}
      </div>

      <div style={{ flex: 1, padding: '32px 24px 64px', maxWidth: 880, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {/* Shell container */}
        <div style={{ background: c.containerBg, borderRadius: 20, boxShadow: c.shadow, padding: '28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 12, padding: '10px 14px' }}>
              <p style={{ fontSize: 12, color: '#fca5a5', margin: 0 }}>{error}</p>
            </div>
          )}

          {/* ── PHASE 1 — Idea Essence ── */}
          <div style={{ ...phaseCardStyle(p1), padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <span className="cc-label" style={{ margin: 0 }}>{p1.title}</span>
              {p1.status === 'confirmed' && greenBadge}
              {isLoading && p1.status === 'pending' && <span style={{ fontSize: 11, color: c.textMuted }}>Generating…</span>}
            </div>
            {p1.status !== 'pending' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* One sentence (title) + Arc/Territory (right) */}
                <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <span className="cc-label">Idea in one sentence</span>
                    <textarea
                      className="cc-plain"
                      value={p1.content.one_sentence || ''}
                      onChange={e => handleEditContent('phase1', 'one_sentence', e.target.value)}
                      disabled={p1.status === 'confirmed'}
                      onInput={autoResize}
                      placeholder="Your idea in one sentence…"
                      style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.2, minHeight: '1.4em' }}
                    />
                  </div>
                  <div style={{ width: 196, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
                    <div>
                      <span className="cc-label">Arc</span>
                      <textarea
                        className="cc-plain"
                        value={p1.content.arc || ''}
                        onChange={e => handleEditContent('phase1', 'arc', e.target.value)}
                        disabled={p1.status === 'confirmed'}
                        onInput={autoResize}
                        placeholder="Arc…"
                        style={{ fontSize: 15, fontWeight: 400, lineHeight: 1.5, color: c.textSecondary }}
                      />
                    </div>
                    <div style={{ borderTop: `1px solid ${c.divider}`, paddingTop: 14 }}>
                      <span className="cc-label">Territory</span>
                      <textarea
                        className="cc-plain"
                        value={p1.content.thematic_territory || ''}
                        onChange={e => handleEditContent('phase1', 'thematic_territory', e.target.value)}
                        disabled={p1.status === 'confirmed'}
                        onInput={autoResize}
                        placeholder="Territory…"
                        style={{ fontSize: 15, fontWeight: 400, lineHeight: 1.5, color: c.textSecondary }}
                      />
                    </div>
                  </div>
                </div>
                {p1.status !== 'confirmed' && (
                  <button onClick={() => handleConfirmSection('phase1')} style={{ width: '100%', padding: '11px', background: c.textPrimary, color: c.containerBg, fontSize: 13, fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer' }}>
                    Confirm
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── PHASE 2 — Conviction & Journey ── */}
          <div style={{ ...phaseCardStyle(p2), padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <span className="cc-label" style={{ margin: 0 }}>{p2.title}</span>
              {p2.status === 'confirmed' && greenBadge}
              {isLoading && p2.status === 'pending' && <span style={{ fontSize: 11, color: c.textMuted }}>Generating…</span>}
            </div>
            {p2.status !== 'pending' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {/* Conviction — blockquote */}
                <div>
                  <span className="cc-label">Conviction Statement</span>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'stretch' }}>
                    <div style={{ width: 3, borderRadius: 2, background: 'rgba(165,63,43,0.4)', flexShrink: 0, minHeight: '2em' }} />
                    <textarea
                      className="cc-plain"
                      value={p2.content.conviction_statement || ''}
                      onChange={e => handleEditContent('phase2', 'conviction_statement', e.target.value)}
                      disabled={p2.status === 'confirmed'}
                      onInput={autoResize}
                      placeholder="Your conviction about this work…"
                      style={{ fontSize: 16, fontWeight: 400, lineHeight: 1.65, letterSpacing: '-0.01em', fontStyle: 'italic' }}
                    />
                  </div>
                </div>

                {/* Emotional Journey — widget + text */}
                <div>
                  <span className="cc-label">Emotional Journey</span>
                  {p2.content.emotional_journey ? (
                    <div style={{ marginBottom: 12 }}>
                      <EmotionalJourneyWidget text={p2.content.emotional_journey} />
                    </div>
                  ) : null}
                  <textarea
                    className="cc-plain"
                    value={p2.content.emotional_journey || ''}
                    onChange={e => handleEditContent('phase2', 'emotional_journey', e.target.value)}
                    disabled={p2.status === 'confirmed'}
                    onInput={autoResize}
                    placeholder="Describe the emotional arc of this piece…"
                    style={{ fontSize: 14, lineHeight: 1.65, color: c.textSecondary }}
                  />
                </div>

                {p2.status !== 'confirmed' && (
                  <button
                    onClick={() => handleConfirmSection('phase2')}
                    disabled={!p2.content.conviction_statement || !p2.content.emotional_journey}
                    style={{ width: '100%', padding: '11px', background: c.textPrimary, color: c.containerBg, fontSize: 13, fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer', opacity: (!p2.content.conviction_statement || !p2.content.emotional_journey) ? 0.3 : 1 }}
                  >Confirm</button>
                )}
              </div>
            )}
          </div>

          {/* ── PHASE 3 — Core Truth (centered) ── */}
          <div style={{ ...phaseCardStyle(p3), padding: '44px 40px', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24 }}>
              <span className="cc-label" style={{ margin: 0 }}>{p3.title}</span>
              {p3.status === 'confirmed' && greenBadge}
              {isLoading && p3.status === 'pending' && <span style={{ fontSize: 11, color: c.textMuted }}>Generating…</span>}
            </div>
            {p3.status !== 'pending' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                <textarea
                  className="cc-plain"
                  value={p3.content.core_truth || ''}
                  onChange={e => handleEditContent('phase3', 'core_truth', e.target.value)}
                  disabled={p3.status === 'confirmed'}
                  onInput={autoResize}
                  placeholder="The core truth at the heart of this work…"
                  style={{ fontSize: 20, fontWeight: 500, lineHeight: 1.5, letterSpacing: '-0.02em', textAlign: 'center', maxWidth: 560 }}
                />
                {p3.status !== 'confirmed' && (
                  <button onClick={() => handleConfirmSection('phase3')} style={{ padding: '11px 40px', background: c.textPrimary, color: c.containerBg, fontSize: 13, fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer' }}>
                    Confirm
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── PHASE 4 — Format & Threads ── */}
          {p4.status === 'pending' ? (
            <div style={{ ...phaseCardStyle(p4), padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="cc-label" style={{ margin: 0 }}>{p4.title}</span>
                {isLoading && <span style={{ fontSize: 11, color: c.textMuted }}>Generating…</span>}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Writing + Visuals — side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: c.cardBg, border: p4.status === 'confirmed' ? '1px solid rgba(16,185,129,0.22)' : `1px solid ${c.divider}`, borderRadius: 16, padding: '24px', boxShadow: c.shadow }}>
                  <span className="cc-label">Writing Suggestions</span>
                  {p4.status === 'confirmed' ? (
                    <DashedList text={p4.content.substack_goals || ''} />
                  ) : (
                    <textarea
                      className="cc-plain"
                      value={p4.content.substack_goals || ''}
                      onChange={e => handleEditContent('phase4', 'substack_goals', e.target.value)}
                      onInput={autoResize}
                      placeholder={'- First suggestion\n- Second suggestion'}
                      style={{ fontSize: 14, lineHeight: 1.65 }}
                    />
                  )}
                </div>
                <div style={{ background: c.cardBg, border: p4.status === 'confirmed' ? '1px solid rgba(16,185,129,0.22)' : `1px solid ${c.divider}`, borderRadius: 16, padding: '24px', boxShadow: c.shadow }}>
                  <span className="cc-label">Visuals Suggestions</span>
                  {p4.status === 'confirmed' ? (
                    <DashedList text={p4.content.short_form_goals || ''} />
                  ) : (
                    <textarea
                      className="cc-plain"
                      value={p4.content.short_form_goals || ''}
                      onChange={e => handleEditContent('phase4', 'short_form_goals', e.target.value)}
                      onInput={autoResize}
                      placeholder={'- First suggestion\n- Second suggestion'}
                      style={{ fontSize: 14, lineHeight: 1.65 }}
                    />
                  )}
                </div>
              </div>

              {/* Open Threads — standalone */}
              <div style={{ background: c.cardBg, border: p4.status === 'confirmed' ? '1px solid rgba(16,185,129,0.22)' : `1px solid ${c.divider}`, borderRadius: 16, padding: '24px', boxShadow: c.shadow }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span className="cc-label" style={{ margin: 0 }}>Open Threads</span>
                  {p4.status === 'confirmed' && greenBadge}
                </div>
                {p4.status === 'confirmed' ? (
                  <DashedList text={p4.content.open_threads || ''} />
                ) : (
                  <textarea
                    className="cc-plain"
                    value={p4.content.open_threads || ''}
                    onChange={e => handleEditContent('phase4', 'open_threads', e.target.value)}
                    onInput={autoResize}
                    placeholder={'- Thread one\n- Thread two'}
                    style={{ fontSize: 14, lineHeight: 1.65 }}
                  />
                )}
              </div>

              {p4.status !== 'confirmed' && (
                <button onClick={() => handleConfirmSection('phase4')} style={{ width: '100%', padding: '11px', background: c.textPrimary, color: c.containerBg, fontSize: 13, fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer' }}>
                  Confirm
                </button>
              )}
            </div>
          )}

          {/* Lock document */}
          {allConfirmed && (
            <button
              onClick={handleSaveDocument}
              disabled={isLoading || isSaving}
              style={{ width: '100%', padding: '14px', background: c.textPrimary, color: c.containerBg, fontSize: 14, fontWeight: 600, borderRadius: 12, border: 'none', cursor: isLoading || isSaving ? 'not-allowed' : 'pointer', opacity: isLoading || isSaving ? 0.3 : 1, letterSpacing: '-0.01em' }}
            >
              {isSaving ? 'Saving…' : 'Lock this document'}
            </button>
          )}
        </div>
      </div>

      {/* Conversation modal */}
      {showConversation && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: c.cardBg, border: `1px solid ${c.divider}`, borderRadius: 20, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
            <div style={{ position: 'sticky', top: 0, background: c.cardBg, borderBottom: `1px solid ${c.divider}`, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderRadius: '20px 20px 0 0' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: c.textPrimary, letterSpacing: '-0.02em', margin: 0 }}>Conceptualisation</h2>
              <IconButton onClick={() => setShowConversation(false)} ariaLabel="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.textSecondary} strokeWidth={2.5} strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </IconButton>
            </div>
            <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {conversation.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4, borderBottom: i < conversation.length - 1 ? `1px solid ${c.divider}` : 'none', paddingBottom: i < conversation.length - 1 ? 20 : 0 }}>
                  <p style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: msg.role === 'user' ? 'rgba(165,63,43,0.7)' : c.textMuted, margin: 0 }}>
                    {msg.role === 'user' ? 'You' : 'Claude'}
                  </p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: c.textPrimary, whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
