'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import AutoResizeTextarea from '@/components/AutoResizeTextarea'
import { useCardTheme } from '@/hooks/useCardTheme'
import { cardPalette, shellBackground, accentColor } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'
import { ThemeToggleButton } from '@/components/ui/theme-toggle-button'
import { ModalDialog } from '@/components/ui/modal-dialog'

interface Task {
  id: string
  title: string
  type: 'creation' | 'execution'
  status: 'pending' | 'complete'
}

interface SessionLog {
  id: string
  what_was_done: string
  next_step: string
  created_at: string
  duration_minutes: number | null
}

interface ActiveCard {
  id: string
  title: string
  arc: string
  thematic_territory: string
  stage: string
  next_action: string
  tasks: Task[]
}

interface QueueCard {
  id: string
  title: string
  arc: string
  one_sentence: string
  status: 'ready' | 'developing'
}

interface CompletedCard {
  id: string
  title: string
  arc: string
  created_at: string
}

interface PieceDetail {
  id: string
  title: string
  arc: string
  thematic_territory: string
  one_sentence: string
  conviction_statement: string
  emotional_journey: string
  core_truth: string
  substack_goals: string
  short_form_goals: string
  open_threads: string[]
  substack_draft?: string
  tasks: Task[]
  session_logs: SessionLog[]
}

interface IdeaDetail {
  id: string
  title: string
  one_sentence: string
  arc: string
  thematic_territory: string
  status: 'ready' | 'developing' | 'active'
  piece_id?: string
  tasks?: Task[]
}

type ModalType = 'piece' | 'idea'
type MobileTab = 'Queue' | 'Active' | 'Completed'

interface Trajectory {
  statement: string
  born_project: string | null
  tone: string | null
  created_at: string
}

// A small mood accent dot next to the trajectory text, not the card's own
// bg/border/text — those are normal theme-aware card colors.
const TONE_DOT_COLORS: Record<string, string> = {
  grounded: '#10B981',
  restless: '#F59E0B',
  tender: '#F472B6',
  expansive: '#8B5CF6',
  urgent: '#EF4444',
}

// One sentence / conviction sit uncarded above the grid; emotional journey
// gets its own path widget. Only core_truth remains in the sectional grid.
const PLAIN_FIELDS = [
  { key: 'one_sentence', label: 'One Sentence', minRows: 1 },
  { key: 'conviction_statement', label: 'Conviction', minRows: 2 },
] as const

const CONCEPT_FIELDS = [
  { key: 'core_truth', label: 'Core Truth', minRows: 2 },
] as const

const DIRECTION_FIELDS = [
  { key: 'substack_goals', label: 'Substack Goals', minRows: 2, placeholder: '- Goal one\n- Goal two' },
  { key: 'short_form_goals', label: 'Short Form Goals', minRows: 2, placeholder: '- Goal one\n- Goal two' },
  { key: 'open_threads', label: 'Open Threads', minRows: 2, placeholder: '- Thread one\n- Thread two' },
] as const

function ProjectBoardContent() {
  const router = useRouter()
  const { theme, toggle } = useCardTheme('light')
  const c = cardPalette[theme]
  const [active, setActive] = useState<ActiveCard[]>([])
  const [queue, setQueue] = useState<QueueCard[]>([])
  const [completed, setCompleted] = useState<CompletedCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<MobileTab>('Active')
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null)
  const [draggedItem, setDraggedItem] = useState<{ type: 'idea' | 'piece'; id: string } | null>(null)
  const [dragOverColumn, setDragOverColumn] = useState<MobileTab | null>(null)

  const [modalType, setModalType] = useState<ModalType | null>(null)
  const [selectedPiece, setSelectedPiece] = useState<PieceDetail | null>(null)
  const [selectedIdea, setSelectedIdea] = useState<IdeaDetail | null>(null)
  const [newTaskInput, setNewTaskInput] = useState('')
  const [newTaskType, setNewTaskType] = useState<'creation' | 'execution'>('creation')
  const [coreConceptDraft, setCoreConceptDraft] = useState<{
    one_sentence: string
    conviction_statement: string
    emotional_journey: string
    core_truth: string
    substack_goals: string
    short_form_goals: string
    open_threads: string
  } | null>(null)
  const [isSavingCoreConcept, setIsSavingCoreConcept] = useState(false)
  const [coreConceptSaved, setCoreConceptSaved] = useState(false)
  const [isJourneyExpanded, setIsJourneyExpanded] = useState(false)

  useEffect(() => {
    fetchBoard()
    fetchTrajectory()
  }, [])

  const fetchTrajectory = async () => {
    try {
      const res = await fetch('/api/trajectory/current')
      const data = await res.json()
      setTrajectory(data.trajectory || null)
    } catch (err) {
      console.error('Failed to fetch trajectory:', err)
    }
  }

  const fetchBoard = async () => {
    try {
      const res = await fetch('/api/project-board/pieces')
      const data = await res.json()
      setActive(data.active || [])
      setQueue(data.queue || [])
      setCompleted(data.archived || [])
    } catch (err) {
      console.error('Failed to fetch board:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const openPieceModal = async (id: string) => {
    setModalType('piece')
    try {
      const res = await fetch(`/api/project-board/piece?id=${id}`)
      const data = await res.json()
      if (data.success) {
        setSelectedPiece(data.piece)
        setCoreConceptDraft({
          one_sentence: data.piece.one_sentence || '',
          conviction_statement: data.piece.conviction_statement || '',
          emotional_journey: data.piece.emotional_journey || '',
          core_truth: data.piece.core_truth || '',
          substack_goals: data.piece.substack_goals || '',
          short_form_goals: data.piece.short_form_goals || '',
          open_threads: (data.piece.open_threads || []).map((t: string) => `- ${t}`).join('\n'),
        })
        setCoreConceptSaved(false)
        setIsJourneyExpanded(false)
      }
    } catch (err) {
      console.error('Failed to fetch piece:', err)
    }
  }

  const handleCoreConceptChange = (field: keyof NonNullable<typeof coreConceptDraft>, value: string) => {
    setCoreConceptDraft((prev) => (prev ? { ...prev, [field]: value } : prev))
    setCoreConceptSaved(false)
  }

  const handleSaveCoreConcept = async () => {
    if (!selectedPiece || !coreConceptDraft) return
    setIsSavingCoreConcept(true)

    try {
      const res = await fetch('/api/project-board/piece', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piece_id: selectedPiece.id,
          ...coreConceptDraft,
        }),
      })

      if (res.ok) {
        setCoreConceptSaved(true)
        fetchBoard()
      }
    } catch (err) {
      console.error('Failed to save core concept:', err)
    } finally {
      setIsSavingCoreConcept(false)
    }
  }

  const openIdeaModal = async (id: string) => {
    setModalType('idea')
    try {
      const res = await fetch(`/api/project-board/idea?id=${id}`)
      const data = await res.json()
      if (data.success) {
        setSelectedIdea(data.idea)
      }
    } catch (err) {
      console.error('Failed to fetch idea:', err)
    }
  }

  const closeModal = () => {
    setModalType(null)
    setSelectedPiece(null)
    setSelectedIdea(null)
    setCoreConceptDraft(null)
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      await fetch('/api/project-board/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      })
      if (selectedPiece) {
        setSelectedPiece({
          ...selectedPiece,
          tasks: selectedPiece.tasks.filter((t) => t.id !== taskId),
        })
      }
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }

  const handleAddTask = async () => {
    if (!selectedPiece || !newTaskInput.trim()) return

    try {
      const res = await fetch('/api/project-board/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piece_id: selectedPiece.id,
          title: newTaskInput.trim(),
          type: newTaskType,
        }),
      })

      if (res.ok) {
        setSelectedPiece({
          ...selectedPiece,
          tasks: [
            ...selectedPiece.tasks,
            {
              id: `new-${Date.now()}`,
              title: newTaskInput.trim(),
              type: newTaskType,
              status: 'pending',
            },
          ],
        })
        setNewTaskInput('')
        setNewTaskType('creation')
      }
    } catch (err) {
      console.error('Failed to add task:', err)
    }
  }

  const handleActivate = async (ideaId: string) => {
    try {
      const res = await fetch('/api/project-board/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_id: ideaId }),
      })

      if (res.ok) {
        fetchBoard()
        closeModal()
      }
    } catch (err) {
      console.error('Failed to activate idea:', err)
    }
  }

  const handleDeleteIdea = async (ideaId: string) => {
    if (!window.confirm('Delete this idea? This can\'t be undone.')) return
    try {
      await fetch('/api/project-board/idea', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_id: ideaId }),
      })
      setQueue((prev) => prev.filter((idea) => idea.id !== ideaId))
      if (selectedIdea?.id === ideaId) closeModal()
    } catch (err) {
      console.error('Failed to delete idea:', err)
    }
  }

  const handleCompletePieceById = async (pieceId: string) => {
    try {
      const res = await fetch('/api/project-board/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId }),
      })

      if (res.ok) {
        fetchBoard()
        closeModal()
      }
    } catch (err) {
      console.error('Failed to complete piece:', err)
    }
  }

  const handleCompletepiece = async () => {
    if (!selectedPiece) return
    await handleCompletePieceById(selectedPiece.id)
  }

  // Tick a task complete/incomplete directly (decoupled from the removed
  // session log). Optimistic update, then persist.
  const handleToggleTask = async (taskId: string, currentStatus: 'pending' | 'complete') => {
    if (!selectedPiece) return
    const nextStatus = currentStatus === 'complete' ? 'pending' : 'complete'
    setSelectedPiece({
      ...selectedPiece,
      tasks: selectedPiece.tasks.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)),
    })
    try {
      await fetch('/api/project-board/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, status: nextStatus }),
      })
      fetchBoard()
    } catch (err) {
      console.error('Failed to toggle task:', err)
    }
  }

  const handleDeactivate = async (pieceId: string) => {
    try {
      const res = await fetch('/api/project-board/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId }),
      })

      if (res.ok) {
        fetchBoard()
      }
    } catch (err) {
      console.error('Failed to move piece back to queue:', err)
    }
  }

  const handleDragStart = (type: 'idea' | 'piece', id: string) => {
    setDraggedItem({ type, id })
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragOverColumn(null)
  }

  const handleDropOnColumn = (column: MobileTab) => {
    if (!draggedItem) return

    if (column === 'Active' && draggedItem.type === 'idea') {
      handleActivate(draggedItem.id)
    } else if (column === 'Queue' && draggedItem.type === 'piece') {
      handleDeactivate(draggedItem.id)
    } else if (column === 'Completed' && draggedItem.type === 'piece') {
      handleCompletePieceById(draggedItem.id)
    }

    setDraggedItem(null)
    setDragOverColumn(null)
  }

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col overflow-hidden" style={{ background: shellBackground }}>
        <div
          style={{
            padding: '24px',
            maxWidth: '1200px',
            margin: '0 auto',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Header - matches loaded state so nothing jumps once data arrives */}
          <div style={{ marginBottom: '32px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', rowGap: '12px', flexShrink: 0 }}>
            <div style={{ flexShrink: 0 }}>
              <p
                aria-hidden="true"
                style={{
                  color: '#6e6c67',
                  fontSize: '11px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-geist-sans)',
                  fontWeight: 600,
                  marginBottom: '12px',
                  margin: 0,
                  visibility: 'hidden',
                }}
              >
                Project Board
              </p>
              <h1
                style={{
                  fontFamily: 'var(--font-geist-sans)',
                  fontWeight: 700,
                  fontSize: 'clamp(24px, 8vw, 34px)',
                  color: '#e8e6e0',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                Project Board
              </h1>
            </div>
            <div style={{ marginLeft: 'auto', marginTop: '6px', display: 'flex', gap: '12px' }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: c.divider }} />
              ))}
            </div>
          </div>

          <div
            style={{
              backgroundColor: c.containerBg,
              boxShadow: c.containerShadow,
              borderRadius: '28px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
            }}
          >
            {/* Mobile tab bar skeleton */}
            <div className="md:hidden flex" style={{ borderBottom: `1px solid ${c.divider}` }}>
              {['Queue', 'Active', 'Completed'].map((name) => (
                <div key={name} className="flex-1 py-3 flex items-center justify-center">
                  <div className="h-3 w-14 rounded animate-pulse" style={{ backgroundColor: c.divider }} />
                </div>
              ))}
            </div>

            {/* Desktop skeleton columns */}
            <div className="hidden md:flex flex-1" style={{ minHeight: 0 }}>
              {[
                { width: '240px', border: true },
                { width: undefined, border: true },
                { width: '240px', border: false },
              ].map((col, i) => (
                <div
                  key={i}
                  className="flex flex-col px-4 py-3 space-y-3"
                  style={{
                    width: col.width,
                    flex: col.width ? '0 0 auto' : '1 1 0%',
                    borderRight: col.border ? `1px solid ${c.divider}` : 'none',
                  }}
                >
                  <div className="h-3 w-16 rounded animate-pulse mb-2" style={{ backgroundColor: c.divider }} />
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="h-20 rounded-lg animate-pulse" style={{ backgroundColor: c.cardBg }} />
                  ))}
                </div>
              ))}
            </div>

            {/* Mobile skeleton cards */}
            <div className="md:hidden flex-1 px-4 py-3 space-y-3">
              {[...Array(3)].map((_, j) => (
                <div key={j} className="h-20 rounded-lg animate-pulse" style={{ backgroundColor: c.cardBg }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const allTasksComplete =
    selectedPiece &&
    selectedPiece.tasks.length > 0 &&
    selectedPiece.tasks.every((t) => t.status === 'complete')

  const completedTaskCount = selectedPiece?.tasks.filter((t) => t.status === 'complete').length ?? 0
  const totalTaskCount = selectedPiece?.tasks.length ?? 0

  const renderConceptField = (
    field: (typeof PLAIN_FIELDS)[number] | (typeof CONCEPT_FIELDS)[number] | (typeof DIRECTION_FIELDS)[number]
  ) => {
    if (!coreConceptDraft) return null
    return (
      <div key={field.key}>
        <p style={{ fontSize: '11px', color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
          {field.label}
        </p>
        {field.key === 'one_sentence' ? (
          <input
            type="text"
            value={coreConceptDraft.one_sentence}
            onChange={(e) => handleCoreConceptChange('one_sentence', e.target.value)}
            style={{
              width: '100%',
              backgroundColor: c.inputBg,
              border: `1px solid ${c.inputBorder}`,
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '14px',
              color: c.textPrimary,
              outline: 'none',
            }}
          />
        ) : (
          <AutoResizeTextarea
            value={coreConceptDraft[field.key]}
            onChange={(value) => handleCoreConceptChange(field.key, value)}
            minRows={field.minRows}
            placeholder={'placeholder' in field ? field.placeholder : undefined}
            style={{
              width: '100%',
              backgroundColor: c.inputBg,
              border: `1px solid ${c.inputBorder}`,
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '14px',
              color: c.textPrimary,
              outline: 'none',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}
          />
        )}
      </div>
    )
  }

  const renderCard = (
    id: string,
    title: string,
    arc: string,
    color: string,
    onClick: () => void,
    dragItem?: { type: 'idea' | 'piece'; id: string },
    onDelete?: () => void
  ) => (
    <div key={id} className="group" style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        draggable={!!dragItem}
        onDragStart={dragItem ? () => handleDragStart(dragItem.type, dragItem.id) : undefined}
        onDragEnd={dragItem ? handleDragEnd : undefined}
        style={{
          width: '100%',
          textAlign: 'left',
          backgroundColor: c.cardBg,
          boxShadow: c.shadow,
          border: '1px solid transparent',
          borderRadius: '12px',
          padding: '12px',
          cursor: dragItem ? 'grab' : 'pointer',
          transition: 'border-color 0.2s, opacity 0.2s',
          minHeight: '80px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          opacity: draggedItem?.id === id ? 0.4 : 1,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = color
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: color,
              flexShrink: 0,
              marginTop: '2px',
            }}
          />
          <p
            style={{
              color: c.textPrimary,
              fontWeight: 500,
              fontSize: '13px',
              margin: 0,
              whiteSpace: 'normal',
              wordWrap: 'break-word',
              lineHeight: '1.4',
            }}
          >
            {title}
          </p>
        </div>
        {arc && (
          <p
            style={{
              color: c.textMuted,
              fontSize: '11px',
              margin: '8px 0 0 0',
            }}
          >
            {arc}
          </p>
        )}
      </button>
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label="Delete idea"
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            position: 'absolute',
            top: '-7px',
            right: '-7px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            border: `1px solid ${c.divider}`,
            backgroundColor: c.cardBg,
            boxShadow: c.shadow,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: c.textMuted,
            cursor: 'pointer',
            padding: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = c.textMuted
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )

  const columnEyebrow: React.CSSProperties = {
    color: c.textSecondary,
    fontSize: '11px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-geist-sans)',
    fontWeight: 600,
    margin: 0,
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: shellBackground }}>
      <style>{`
        @keyframes strikethrough {
          from {
            text-decoration: none;
            opacity: 1;
          }
          to {
            text-decoration: line-through;
            opacity: 0.6;
            color: #4a4946;
          }
        }
        .complete-task {
          animation: strikethrough 0.3s ease-out forwards;
        }
        .board-scroll::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .board-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .board-scroll::-webkit-scrollbar-thumb {
          background-color: ${c.divider};
          border-radius: 999px;
        }
        .board-scroll {
          scrollbar-width: thin;
          scrollbar-color: ${c.divider} transparent;
        }
      `}</style>

      <div
        style={{
          padding: '24px',
          maxWidth: '1200px',
          margin: '0 auto',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '32px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', rowGap: '12px', flexShrink: 0 }}>
          <div style={{ flexShrink: 0 }}>
            {/* Invisible spacer matching the home/portrait eyebrow line, so the title sits at the exact same height */}
            <p
              aria-hidden="true"
              style={{
                color: '#6e6c67',
                fontSize: '11px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-geist-sans)',
                fontWeight: 600,
                marginBottom: '12px',
                margin: 0,
                visibility: 'hidden',
              }}
            >
              Project Board
            </p>
            <h1
              style={{
                fontFamily: 'var(--font-geist-sans)',
                fontWeight: 700,
                fontSize: 'clamp(24px, 8vw, 34px)',
                color: '#e8e6e0',
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              Project Board
            </h1>
          </div>
          <div style={{ marginLeft: 'auto', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <IconButton onClick={() => router.push('/idea-lab')} ariaLabel="New idea">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8e6e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </IconButton>
            <ThemeToggleButton theme={theme} onToggle={toggle} />
            <IconButton onClick={() => router.push('/home')} ariaLabel="Home">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8e6e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />
              </svg>
            </IconButton>
          </div>
        </div>

        {/* Kanban container: same rounded-panel treatment as the home/portrait containers */}
        <div
          style={{
            backgroundColor: c.containerBg,
            boxShadow: c.containerShadow,
            borderRadius: '28px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            transition: 'background-color 0.3s ease',
          }}
        >
        {/* Mobile Tab Bar - Hidden on md+ */}
        <div className="md:hidden flex" style={{ borderBottom: `1px solid ${c.divider}` }}>
          {[
          { name: 'Queue' as MobileTab, color: '#F59E0B', count: queue.length },
          { name: 'Active' as MobileTab, color: '#10B981', count: active.length },
          { name: 'Completed' as MobileTab, color: '#8B5CF6', count: completed.length },
        ].map((tab) => (
          <button
            key={tab.name}
            onClick={() => setActiveTab(tab.name)}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              backgroundColor: activeTab === tab.name ? c.cardBg : 'transparent',
              borderBottom: activeTab === tab.name ? `2px solid ${tab.color}` : '1px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: tab.color,
              }}
            />
            <span style={{ color: c.textPrimary, fontSize: '12px', fontWeight: 500 }}>
              {tab.name}
            </span>
            <span style={{ color: c.textMuted, fontSize: '11px' }}>({tab.count})</span>
          </button>
        ))}
      </div>

        {/* Desktop Layout - 3 Columns */}
        <div className="hidden md:flex flex-1" style={{ minHeight: 0 }}>
          {/* Queue Column - fixed width, doesn't shrink when the board narrows */}
          <div
            className="flex flex-col transition-colors"
            style={{
              width: '240px',
              flex: '0 0 auto',
              backgroundColor: dragOverColumn === 'Queue' ? c.cardBgInner : 'transparent',
              borderRight: `1px solid ${c.divider}`,
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOverColumn('Queue')
            }}
            onDragLeave={() => setDragOverColumn((col) => (col === 'Queue' ? null : col))}
            onDrop={(e) => {
              e.preventDefault()
              handleDropOnColumn('Queue')
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.divider}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="w-3 h-3 rounded-full bg-[#F59E0B]"></div>
              <h2 style={columnEyebrow}>Queue</h2>
              <span style={{ color: c.textMuted, fontSize: '11px' }}>({queue.length})</span>
            </div>
            <div className="board-scroll flex-1 overflow-y-auto px-4 py-3 pb-3 space-y-3">
              {queue.map((idea) =>
                renderCard(
                  idea.id,
                  idea.title,
                  idea.arc,
                  '#F59E0B',
                  () => openIdeaModal(idea.id),
                  { type: 'idea', id: idea.id },
                  () => handleDeleteIdea(idea.id)
                )
              )}
            </div>
          </div>

          {/* Active Column - the main focus; absorbs the width the board gives up, capped so it doesn't stretch too wide */}
          <div
            className="flex flex-col transition-colors"
            style={{
              flex: '1 1 0%',
              maxWidth: '600px',
              minWidth: 0,
              backgroundColor: dragOverColumn === 'Active' ? c.cardBgInner : 'transparent',
              borderRight: `1px solid ${c.divider}`,
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOverColumn('Active')
            }}
            onDragLeave={() => setDragOverColumn((col) => (col === 'Active' ? null : col))}
            onDrop={(e) => {
              e.preventDefault()
              handleDropOnColumn('Active')
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.divider}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="w-3 h-3 rounded-full bg-[#10B981]"></div>
              <h2 style={columnEyebrow}>Active</h2>
              <span style={{ color: c.textMuted, fontSize: '11px' }}>({active.length})</span>
            </div>
            <div className="board-scroll flex-1 overflow-y-auto px-4 py-3 pb-3 space-y-3">
              {active.map((piece) =>
                renderCard(piece.id, piece.title, piece.arc, '#10B981', () => openPieceModal(piece.id), {
                  type: 'piece',
                  id: piece.id,
                })
              )}
            </div>
          </div>

          {/* Completed Column - fixed width, doesn't shrink when the board narrows */}
          <div
            className="flex flex-col transition-colors"
            style={{
              width: '240px',
              flex: '0 0 auto',
              backgroundColor: dragOverColumn === 'Completed' ? c.cardBgInner : 'transparent',
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOverColumn('Completed')
            }}
            onDragLeave={() => setDragOverColumn((col) => (col === 'Completed' ? null : col))}
            onDrop={(e) => {
              e.preventDefault()
              handleDropOnColumn('Completed')
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.divider}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="w-3 h-3 rounded-full bg-[#8B5CF6]"></div>
              <h2 style={columnEyebrow}>Completed</h2>
              <span style={{ color: c.textMuted, fontSize: '11px' }}>({completed.length})</span>
            </div>
            <div className="board-scroll flex-1 overflow-y-auto px-4 py-3 pb-3 space-y-3">
              {completed.map((piece) =>
                renderCard(piece.id, piece.title, piece.arc, '#8B5CF6', () => openPieceModal(piece.id))
              )}
            </div>
          </div>
        </div>

        {/* Mobile Layout - Single Column with Tabs */}
        <div className="board-scroll md:hidden flex-1 overflow-y-auto px-4 py-3 pb-3">
          <div className="space-y-3">
          {activeTab === 'Queue' &&
            queue.map((idea) =>
              renderCard(
                idea.id,
                idea.title,
                idea.arc,
                '#F59E0B',
                () => openIdeaModal(idea.id),
                undefined,
                () => handleDeleteIdea(idea.id)
              )
            )}
          {activeTab === 'Active' &&
            active.map((piece) =>
              renderCard(piece.id, piece.title, piece.arc, '#10B981', () => openPieceModal(piece.id))
            )}
          {activeTab === 'Completed' &&
            completed.map((piece) =>
              renderCard(piece.id, piece.title, piece.arc, '#8B5CF6', () => openPieceModal(piece.id))
            )}
          </div>
        </div>

        {/* Trajectory: own floating rounded card, inset in the container, divided from the board above */}
        <div
          style={{
            borderTop: `1px solid ${c.divider}`,
            padding: '16px',
            flexShrink: 0,
          }}
        >
          <div
            className="flex items-center justify-between gap-4"
            style={{
              backgroundColor: c.cardBg,
              boxShadow: c.shadow,
              borderRadius: '16px',
              padding: '14px 20px',
            }}
          >
            <div className="min-w-0 flex-1" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {trajectory?.tone && (
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: TONE_DOT_COLORS[trajectory.tone] || c.textPrimary,
                    flexShrink: 0,
                  }}
                />
              )}
              {trajectory ? (
                <p style={{ fontSize: '14px', lineHeight: 1.5, color: c.textPrimary, margin: 0 }}>
                  {trajectory.statement}
                </p>
              ) : (
                <p style={{ fontSize: '13px', color: c.textMuted, margin: 0 }}>
                  No trajectory set yet
                </p>
              )}
            </div>
            <button
              onClick={() => router.push('/zoom-out')}
              className="rounded-lg transition-opacity whitespace-nowrap flex-shrink-0"
              style={{
                fontFamily: 'var(--font-geist-sans)',
                fontWeight: 600,
                fontSize: '13px',
                padding: '8px 16px',
                backgroundColor: accentColor,
                color: '#ffffff',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '1'
              }}
            >
              {trajectory ? 'Zoom out' : 'Find your direction'}
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Piece Modal: mirrors the page-level shell -> header-on-shell -> container structure exactly */}
      {modalType === 'piece' && selectedPiece && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: shellBackground }}>
          <div style={{ height: '100%', maxWidth: '960px', margin: '0 auto', padding: '24px 24px 0', display: 'flex', flexDirection: 'column' }}>
            {/* Header: plain text + actions floating directly on the dark shell, no card chrome of its own */}
            <div
              style={{
                marginBottom: '24px',
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexShrink: 0,
                gap: '16px',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <h2
                  style={{
                    fontFamily: 'var(--font-geist-sans)',
                    fontWeight: 700,
                    fontSize: 'clamp(22px, 5vw, 28px)',
                    color: '#e8e6e0',
                    margin: 0,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {selectedPiece.title}
                </h2>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: '11px', color: '#8c8a87' }}>
                  <span>{selectedPiece.arc}</span>
                  <span>•</span>
                  <span>{selectedPiece.thematic_territory}</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, marginTop: '4px' }}>
                {/* Moved up from the bottom of the modal so writing is one click away, no scrolling past Core Concept/Tasks first */}
                <button
                  onClick={() => {
                    if (selectedPiece) window.location.href = `/write?piece_id=${selectedPiece.id}`
                  }}
                  className="transition-opacity whitespace-nowrap"
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: accentColor,
                    color: '#ffffff',
                    fontFamily: 'var(--font-geist-sans)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '1'
                  }}
                >
                  {selectedPiece?.substack_draft ? 'Resume writing' : 'Begin writing'}
                </button>
                <IconButton onClick={closeModal} ariaLabel="Close">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8e6e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </IconButton>
              </div>
            </div>

            {/* Container: the toggleable rounded panel, starts below the header, holds all the cards */}
            <div
              style={{
                backgroundColor: c.containerBg,
                boxShadow: c.containerShadow,
                borderRadius: '28px 28px 0 0',
                overflow: 'hidden',
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                transition: 'background-color 0.3s ease',
              }}
            >
          <div className="board-scroll" style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ maxWidth: '880px', margin: '0 auto', padding: '32px 28px 48px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
              {/* Core Concept: one sentence / conviction / emotional journey sit uncarded, above the sectional grid */}
              {coreConceptDraft && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {PLAIN_FIELDS.map((field) => renderConceptField(field))}

                    {/* Emotional Journey: a "linear path" widget, collapsed by default */}
                    <div>
                      <p style={{ fontSize: '11px', color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                        Emotional Journey
                      </p>
                      <button
                        onClick={() => setIsJourneyExpanded((v) => !v)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          {[0, 1, 2, 3, 4].map((i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < 4 ? 1 : undefined }}>
                              <span
                                style={{
                                  width: i === 0 || i === 4 ? '9px' : '6px',
                                  height: i === 0 || i === 4 ? '9px' : '6px',
                                  borderRadius: '50%',
                                  flexShrink: 0,
                                  backgroundColor: i === 0 ? accentColor : i === 4 ? c.textMuted : c.divider,
                                }}
                              />
                              {i < 4 && (
                                <span
                                  style={{
                                    flex: 1,
                                    height: '2px',
                                    marginLeft: '3px',
                                    background: i === 0 ? `linear-gradient(to right, ${accentColor}, ${c.divider})` : c.divider,
                                  }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                          <p
                            style={{
                              fontSize: '13px',
                              color: c.textSecondary,
                              margin: 0,
                              lineHeight: 1.5,
                              flex: 1,
                              minWidth: 0,
                              ...(isJourneyExpanded
                                ? {}
                                : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
                            }}
                          >
                            {coreConceptDraft.emotional_journey
                              ? coreConceptDraft.emotional_journey.split('\n')[0]
                              : 'No journey mapped yet — tap to add one'}
                          </p>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={c.textMuted}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ flexShrink: 0, transform: isJourneyExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </div>
                      </button>
                      {isJourneyExpanded && (
                        <div style={{ marginTop: '10px' }}>
                          <AutoResizeTextarea
                            value={coreConceptDraft.emotional_journey}
                            onChange={(value) => handleCoreConceptChange('emotional_journey', value)}
                            minRows={3}
                            style={{
                              width: '100%',
                              backgroundColor: c.inputBg,
                              border: `1px solid ${c.inputBorder}`,
                              borderRadius: '10px',
                              padding: '10px 12px',
                              fontSize: '14px',
                              color: c.textPrimary,
                              outline: 'none',
                              lineHeight: 1.6,
                              whiteSpace: 'pre-wrap',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div
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
                      {CONCEPT_FIELDS.map((field) => renderConceptField(field))}
                    </div>

                    <div
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
                      <p style={{ ...columnEyebrow, marginBottom: '2px' }}>Goals & threads</p>
                      {DIRECTION_FIELDS.map((field) => renderConceptField(field))}
                    </div>
                  </div>

                  <button
                    onClick={handleSaveCoreConcept}
                    disabled={isSavingCoreConcept}
                    className="transition-opacity disabled:opacity-50"
                    style={{
                      width: '100%',
                      padding: '11px',
                      borderRadius: '10px',
                      border: 'none',
                      backgroundColor: accentColor,
                      color: '#ffffff',
                      fontFamily: 'var(--font-geist-sans)',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {isSavingCoreConcept ? 'Saving...' : coreConceptSaved ? 'Saved ✓' : 'Save changes'}
                  </button>
                </div>
              )}

              {/* Tasks Section */}
              <div
                style={{
                  backgroundColor: c.cardBg,
                  boxShadow: c.shadow,
                  borderRadius: '16px',
                  padding: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: '12px' }}>
                  <p style={columnEyebrow}>Tasks</p>
                  {totalTaskCount > 0 && (
                    <span style={{ fontSize: '11px', color: c.textMuted, flexShrink: 0 }}>
                      {completedTaskCount} of {totalTaskCount} done
                    </span>
                  )}
                </div>

                {totalTaskCount > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      width: '100%',
                      height: '6px',
                      borderRadius: '999px',
                      overflow: 'hidden',
                      backgroundColor: c.divider,
                      marginBottom: '16px',
                    }}
                  >
                    {completedTaskCount > 0 && (
                      <div style={{ flexGrow: completedTaskCount, flexBasis: 0, backgroundColor: '#10B981', transition: 'flex-grow 0.4s ease' }} />
                    )}
                    {totalTaskCount - completedTaskCount > 0 && (
                      <div style={{ flexGrow: totalTaskCount - completedTaskCount, flexBasis: 0, backgroundColor: 'transparent' }} />
                    )}
                  </div>
                )}

                {selectedPiece.tasks.length === 0 ? (
                  <p style={{ fontSize: '13px', color: c.textMuted, margin: 0 }}>No tasks</p>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {selectedPiece.tasks
                        .filter((t) => t.status === 'pending')
                        .map((task, index, arr) => (
                          <div
                            key={task.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 8px 10px 10px',
                              marginLeft: '-10px',
                              borderLeft: '2px solid transparent',
                              borderBottom: index < arr.length - 1 ? `1px solid ${c.divider}` : 'none',
                              transition: 'border-color 0.15s ease',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLDivElement).style.borderLeftColor = accentColor
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLDivElement).style.borderLeftColor = 'transparent'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => handleToggleTask(task.id, 'pending')}
                              className="accent-green-600 flex-shrink-0 cursor-pointer"
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: '13px', color: c.textPrimary }}>{task.title}</span>
                              <span
                                style={{
                                  fontSize: '11px',
                                  color: c.textMuted,
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  backgroundColor: c.containerBg,
                                  flexShrink: 0,
                                }}
                              >
                                {task.type}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              style={{ fontSize: '11px', color: c.textMuted, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.color = c.textMuted
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                    </div>

                    {selectedPiece.tasks.filter((t) => t.status === 'complete').length > 0 && (
                      <div style={{ marginTop: '14px' }}>
                        <p style={{ fontSize: '11px', color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                          Completed
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {selectedPiece.tasks
                            .filter((t) => t.status === 'complete')
                            .map((task, index, arr) => (
                              <div
                                key={task.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '10px',
                                  padding: '10px 8px 10px 10px',
                                  marginLeft: '-10px',
                                  borderLeft: '2px solid transparent',
                                  borderBottom: index < arr.length - 1 ? `1px solid ${c.divider}` : 'none',
                                  opacity: 0.6,
                                  transition: 'border-color 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  (e.currentTarget as HTMLDivElement).style.borderLeftColor = accentColor
                                }}
                                onMouseLeave={(e) => {
                                  (e.currentTarget as HTMLDivElement).style.borderLeftColor = 'transparent'
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked
                                  onChange={() => handleToggleTask(task.id, 'complete')}
                                  className="accent-green-600 flex-shrink-0 cursor-pointer"
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: '13px', color: c.textMuted, textDecoration: 'line-through' }}>{task.title}</span>
                                  <span
                                    style={{
                                      fontSize: '11px',
                                      color: c.textMuted,
                                      padding: '2px 8px',
                                      borderRadius: '999px',
                                      backgroundColor: c.containerBg,
                                      flexShrink: 0,
                                    }}
                                  >
                                    {task.type}
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Add Task */}
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: `1px solid ${c.divider}`, display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={newTaskInput}
                    onChange={(e) => setNewTaskInput(e.target.value)}
                    placeholder="Add task..."
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') handleAddTask()
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: c.inputBg,
                      border: `1px solid ${c.inputBorder}`,
                      borderRadius: '10px',
                      padding: '10px 12px',
                      fontSize: '13px',
                      color: c.textPrimary,
                      outline: 'none',
                    }}
                  />
                  <select
                    value={newTaskType}
                    onChange={(e) => setNewTaskType(e.target.value as 'creation' | 'execution')}
                    style={{
                      backgroundColor: c.inputBg,
                      border: `1px solid ${c.inputBorder}`,
                      borderRadius: '10px',
                      padding: '10px 12px',
                      fontSize: '13px',
                      color: c.textPrimary,
                      outline: 'none',
                    }}
                  >
                    <option value="creation">Creation</option>
                    <option value="execution">Execution</option>
                  </select>
                  <button
                    onClick={handleAddTask}
                    style={{
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      backgroundColor: c.textPrimary,
                      color: c.cardBg,
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Actions */}
              {allTasksComplete && (
                <button
                  onClick={handleCompletepiece}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#10B981',
                    fontFamily: 'var(--font-geist-sans)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Mark piece complete
                </button>
              )}
            </div>
          </div>
          </div>
          </div>
        </div>
      )}

      {/* Idea Modal */}
      {modalType === 'idea' && selectedIdea && (
        <ModalDialog
          theme={theme}
          onClose={closeModal}
          title={selectedIdea.title}
          subtitle={
            <>
              <span>{selectedIdea.arc}</span>
              <span>•</span>
              <span>{selectedIdea.thematic_territory}</span>
            </>
          }
          headerActions={
            <button
              onClick={() => handleDeleteIdea(selectedIdea.id)}
              aria-label="Delete idea"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: c.textMuted,
                transition: 'color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = c.textMuted
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
              </svg>
            </button>
          }
          footer={
            <button
              onClick={() => handleActivate(selectedIdea.id)}
              className="w-full transition-colors"
              style={{
                padding: '10px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: accentColor,
                color: '#ffffff',
                fontFamily: 'var(--font-geist-sans)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.opacity = '1'
              }}
            >
              Activate idea
            </button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {selectedIdea.one_sentence && (
              <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '14px', padding: '16px' }}>
                <p style={columnEyebrow}>One sentence</p>
                <p style={{ color: c.textPrimary, fontSize: '14px', lineHeight: 1.6, margin: '6px 0 0' }}>
                  {selectedIdea.one_sentence}
                </p>
              </div>
            )}

            {selectedIdea.piece_id && selectedIdea.tasks && selectedIdea.tasks.length > 0 && (
              <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '14px', padding: '16px' }}>
                <p style={columnEyebrow}>Linked piece tasks</p>
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: '10px' }}>
                  {selectedIdea.tasks.map((task, index) => (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        padding: '10px 0',
                        borderBottom: index < selectedIdea.tasks!.length - 1 ? `1px solid ${c.divider}` : 'none',
                      }}
                    >
                      <span style={{ color: c.textPrimary, fontSize: '13px' }}>{task.title}</span>
                      <span
                        style={{
                          color: c.textMuted,
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          backgroundColor: c.inputBg,
                        }}
                      >
                        {task.type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ModalDialog>
      )}
    </div>
  )
}

export default function ProjectBoardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111110] flex items-center justify-center">
          <p className="text-[#4a4946]">Loading...</p>
        </div>
      }
    >
      <ProjectBoardContent />
    </Suspense>
  )
}
