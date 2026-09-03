'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { shellBackground, cardPalette } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'

const STAGE_COLORS = ['#F59E0B', '#10B981', '#8B5CF6', '#a53f2b', '#3B82F6', '#EC4899']

type Palette = (typeof cardPalette)[keyof typeof cardPalette]

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

interface DocumentSection {
  title: string
  status: 'pending' | 'active' | 'confirmed'
  content: Record<string, string>
}

function EmotionalJourneyWidget({ text, palette }: { text: string; palette: Palette }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const stageData = useMemo(() => {
    const sentences = text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 8)
    if (sentences.length === 0) return [
      { label: 'Beginning', full: '' },
      { label: 'Rising', full: '' },
      { label: 'Resolution', full: '' },
    ]
    return sentences.slice(0, 6).map(s => {
      const words = s.split(/\s+/)
      return { label: words.slice(0, Math.min(3, words.length)).join(' '), full: s }
    })
  }, [text])

  const n = stageData.length
  const W = 500, H = 64, PAD = 40

  const heights = useMemo(() => stageData.map((stage, i) => {
    const t = i / (n - 1 || 1)
    const base = Math.sin(t * Math.PI) * 0.8
    const hash = stage.label.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
    return Math.max(0.08, Math.min(0.92, base + (hash % 15 - 7) / 100))
  }), [stageData, n])

  const pts = heights.map((h, i) => ({
    x: n <= 1 ? W / 2 : PAD + (i / (n - 1)) * (W - PAD * 2),
    y: H - h * (H - 8),
    color: STAGE_COLORS[i % STAGE_COLORS.length],
  }))

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const cpx = ((pts[i - 1].x + pts[i].x) / 2).toFixed(1)
    d += ` C ${cpx} ${pts[i - 1].y.toFixed(1)} ${cpx} ${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H + 30}`} style={{ overflow: 'visible', display: 'block' }}>
        <defs>
          <linearGradient id="ejFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.textMuted} stopOpacity="0.07" />
            <stop offset="100%" stopColor={palette.textMuted} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L ${pts[pts.length - 1].x} ${H + 2} L ${pts[0].x} ${H + 2} Z`} fill="url(#ejFill)" />
        <path d={d} fill="none" stroke={palette.divider} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />

        {pts.map((p, i) => (
          <g
            key={i}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
            style={{ cursor: 'default' }}
          >
            <circle cx={p.x} cy={p.y} r={18} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={hoveredIdx === i ? 5.5 : 3.5} fill={p.color} style={{ transition: 'r 0.15s' }} />
            <text
              x={p.x} y={H + 22}
              textAnchor="middle"
              fontSize={8.5}
              fontFamily="inherit"
              fill={p.color}
              fontWeight={hoveredIdx === i ? 700 : 500}
            >
              {stageData[i].label.length > 14 ? stageData[i].label.slice(0, 13) + '…' : stageData[i].label}
            </text>
          </g>
        ))}
      </svg>

      {hoveredIdx !== null && stageData[hoveredIdx].full && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: `${(pts[hoveredIdx].x / W) * 100}%`,
          transform: 'translateX(-50%)',
          marginBottom: 8,
          background: palette.cardBg,
          border: `1px solid ${pts[hoveredIdx].color}55`,
          borderRadius: 10,
          padding: '10px 14px',
          maxWidth: 220,
          boxShadow: palette.shadow,
          zIndex: 10,
          pointerEvents: 'none',
        }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: pts[hoveredIdx].color, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 5px' }}>
            {stageData[hoveredIdx].label}
          </p>
          <p style={{ fontSize: 12, color: palette.textSecondary, lineHeight: 1.55, margin: 0 }}>
            {stageData[hoveredIdx].full}
          </p>
        </div>
      )}
    </div>
  )
}

function DashedList({ text, palette }: { text: string; palette: Palette }) {
  const lines = text.split('\n').map(l => l.replace(/^[\-\*•]\s*/, '').trim()).filter(Boolean)
  if (lines.length === 0) return null
  return (
    <div>
      {lines.map((line, i) => (
        <div key={i}>
          <div style={{ display: 'flex', gap: 10, fontSize: 14, color: palette.textPrimary, lineHeight: 1.55, padding: '10px 0' }}>
            <span style={{ color: palette.textMuted, flexShrink: 0, fontWeight: 300 }}>—</span>
            <span>{line}</span>
          </div>
          {i < lines.length - 1 && <div style={{ height: 1, background: palette.divider }} />}
        </div>
      ))}
    </div>
  )
}

export default function CoreConceptPage() {
  const router = useRouter()

  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('cc_theme') as 'light' | 'dark' | null
    if (saved) setTheme(saved)
  }, [])

  const c = cardPalette[theme]

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('cc_theme', next)
      return next
    })
  }

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
    <span style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(16,185,129,0.8)', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 4 }}>Locked</span>
  )

  function phaseCardStyle(s: DocumentSection): React.CSSProperties {
    return {
      position: 'relative',
      background: s.status === 'pending' ? c.containerBg : c.cardBg,
      border: s.status === 'confirmed' ? '1px solid rgba(16,185,129,0.22)' : `1px solid ${c.divider}`,
      borderRadius: 16,
      boxShadow: s.status === 'pending' ? 'none' : c.shadow,
      opacity: s.status === 'pending' ? 0.42 : 1,
      transition: 'opacity 0.3s',
    }
  }

  const backBtn = (dest: string) => (
    <motion.button
      onClick={() => router.push(dest)}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.93 }}
      style={{
        width: 28, height: 28, borderRadius: '50%',
        border: `1px solid ${c.divider}`,
        background: 'rgba(232,230,224,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.textSecondary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </motion.button>
  )

  const themeToggle = (
    <motion.button
      onClick={toggleTheme}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.93 }}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{
        width: 32, height: 32, borderRadius: '50%',
        border: `1px solid ${c.divider}`,
        background: c.inputBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      {theme === 'dark' ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
          <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
          <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
          <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={c.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </motion.button>
  )

  const p1 = sections.phase1
  const p2 = sections.phase2
  const p3 = sections.phase3
  const p4 = sections.phase4

  // Task review screen
  if (showTaskReview && pieceId) {
    return (
      <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {backBtn('/idea-lab/conceptualise')}
            <h1 style={{ fontSize: 20, fontWeight: 700, color: c.textPrimary, letterSpacing: '-0.02em' }}>Task Roadmap</h1>
          </div>
          {themeToggle}
        </div>
        <div style={{ flex: 1, padding: '40px 24px 64px', maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ background: c.containerBg, borderRadius: 20, boxShadow: c.containerShadow, padding: '28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
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
        .cc-plain:not(:disabled):hover { background: ${theme === 'dark' ? 'rgba(232,230,224,0.025)' : 'rgba(23,22,19,0.025)'}; border-radius: 4px; }
        .cc-plain:not(:disabled):focus { box-shadow: 0 1px 0 ${theme === 'dark' ? 'rgba(232,230,224,0.1)' : 'rgba(23,22,19,0.12)'}; border-radius: 4px 4px 0 0; }
        .cc-plain:disabled { cursor: default; opacity: 0.72; }
        .cc-label { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700; color: ${c.textMuted}; margin: 0 0 10px; display: block; }
      `}</style>

      {/* Header — no divider */}
      <div style={{ padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {backBtn('/idea-lab/conceptualise')}
          <h1 style={{ fontSize: 20, fontWeight: 700, color: c.textPrimary, letterSpacing: '-0.02em' }}>Core Concept</h1>
        </div>
        {themeToggle}
      </div>

      <div style={{ flex: 1, padding: '32px 24px 64px', maxWidth: 880, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ background: c.containerBg, borderRadius: 20, boxShadow: c.containerShadow, padding: '28px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 12, padding: '10px 14px' }}>
              <p style={{ fontSize: 12, color: '#fca5a5', margin: 0 }}>{error}</p>
            </div>
          )}

          {/* ── PHASE 1 — Idea Essence ── */}
          <div style={{ ...phaseCardStyle(p1), padding: '28px' }}>
            {p1.status === 'confirmed' && (
              <div style={{ position: 'absolute', top: 16, right: 16 }}>{greenBadge}</div>
            )}
            {isLoading && p1.status === 'pending' && (
              <p style={{ fontSize: 11, color: c.textMuted, margin: 0 }}>Generating…</p>
            )}
            {p1.status !== 'pending' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
                  {/* One sentence — big title */}
                  <div style={{ flex: 1 }}>
                    <span className="cc-label">Idea in one sentence</span>
                    {p1.status === 'confirmed' ? (
                      <p style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.15, color: c.textPrimary, margin: 0 }}>
                        {p1.content.one_sentence}
                      </p>
                    ) : (
                      <textarea
                        className="cc-plain"
                        value={p1.content.one_sentence || ''}
                        onChange={e => handleEditContent('phase1', 'one_sentence', e.target.value)}
                        onInput={autoResize}
                        placeholder="Your idea in one sentence…"
                        style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.15, minHeight: '1.4em' }}
                      />
                    )}
                  </div>
                  {/* Arc + Territory — right side */}
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
                        style={{ fontSize: 16, fontWeight: 400, lineHeight: 1.5, color: c.textSecondary }}
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
                        style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.5, color: c.textMuted }}
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
            {p2.status === 'confirmed' && (
              <div style={{ position: 'absolute', top: 16, right: 16 }}>{greenBadge}</div>
            )}
            {isLoading && p2.status === 'pending' && (
              <p style={{ fontSize: 11, color: c.textMuted, margin: 0 }}>Generating…</p>
            )}
            {p2.status !== 'pending' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
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
                      style={{ fontSize: 16, fontWeight: 400, lineHeight: 1.65, letterSpacing: '-0.01em' }}
                    />
                  </div>
                </div>

                {/* Emotional Journey — widget + text */}
                <div>
                  <span className="cc-label">Emotional Journey</span>
                  {p2.content.emotional_journey ? (
                    <div style={{ marginBottom: 16 }}>
                      <EmotionalJourneyWidget text={p2.content.emotional_journey} palette={c} />
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
            {p3.status === 'confirmed' && (
              <div style={{ position: 'absolute', top: 16, right: 16 }}>{greenBadge}</div>
            )}
            {isLoading && p3.status === 'pending' && (
              <p style={{ fontSize: 11, color: c.textMuted, margin: 0 }}>Generating…</p>
            )}
            {p3.status !== 'pending' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                <span className="cc-label" style={{ margin: 0 }}>Core Truth</span>
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
              {isLoading && <p style={{ fontSize: 11, color: c.textMuted, margin: 0 }}>Generating…</p>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Writing + Visuals side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: c.cardBg, border: p4.status === 'confirmed' ? '1px solid rgba(16,185,129,0.22)' : `1px solid ${c.divider}`, borderRadius: 16, padding: '24px', boxShadow: c.shadow }}>
                  <span className="cc-label">Writing Suggestions</span>
                  {p4.status === 'confirmed' ? (
                    <DashedList text={p4.content.substack_goals || ''} palette={c} />
                  ) : (
                    <textarea className="cc-plain" value={p4.content.substack_goals || ''} onChange={e => handleEditContent('phase4', 'substack_goals', e.target.value)} onInput={autoResize} placeholder={'- First suggestion\n- Second suggestion'} style={{ fontSize: 14, lineHeight: 1.65 }} />
                  )}
                </div>
                <div style={{ background: c.cardBg, border: p4.status === 'confirmed' ? '1px solid rgba(16,185,129,0.22)' : `1px solid ${c.divider}`, borderRadius: 16, padding: '24px', boxShadow: c.shadow }}>
                  <span className="cc-label">Visuals Suggestions</span>
                  {p4.status === 'confirmed' ? (
                    <DashedList text={p4.content.short_form_goals || ''} palette={c} />
                  ) : (
                    <textarea className="cc-plain" value={p4.content.short_form_goals || ''} onChange={e => handleEditContent('phase4', 'short_form_goals', e.target.value)} onInput={autoResize} placeholder={'- First suggestion\n- Second suggestion'} style={{ fontSize: 14, lineHeight: 1.65 }} />
                  )}
                </div>
              </div>

              {/* Open Threads standalone */}
              <div style={{ background: c.cardBg, border: p4.status === 'confirmed' ? '1px solid rgba(16,185,129,0.22)' : `1px solid ${c.divider}`, borderRadius: 16, padding: '24px', boxShadow: c.shadow }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span className="cc-label" style={{ margin: 0 }}>Open Threads</span>
                  {p4.status === 'confirmed' && greenBadge}
                </div>
                {p4.status === 'confirmed' ? (
                  <DashedList text={p4.content.open_threads || ''} palette={c} />
                ) : (
                  <textarea className="cc-plain" value={p4.content.open_threads || ''} onChange={e => handleEditContent('phase4', 'open_threads', e.target.value)} onInput={autoResize} placeholder={'- Thread one\n- Thread two'} style={{ fontSize: 14, lineHeight: 1.65 }} />
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
            <button onClick={handleSaveDocument} disabled={isLoading || isSaving}
              style={{ width: '100%', padding: '14px', background: c.textPrimary, color: c.containerBg, fontSize: 14, fontWeight: 600, borderRadius: 12, border: 'none', cursor: isLoading || isSaving ? 'not-allowed' : 'pointer', opacity: isLoading || isSaving ? 0.3 : 1, letterSpacing: '-0.01em' }}>
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
