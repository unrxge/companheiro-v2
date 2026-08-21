'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import AutoResizeTextarea from '@/components/AutoResizeTextarea'
import { useCardTheme } from '@/hooks/useCardTheme'
import { cardPalette, shellBackground } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'
import { ThemeToggleButton } from '@/components/ui/theme-toggle-button'

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

const TONE_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  grounded: { bg: 'bg-[#0d1f17]', border: 'border-[#10B981]/40', text: 'text-[#6ee7b7]' },
  restless: { bg: 'bg-[#231a0c]', border: 'border-[#F59E0B]/40', text: 'text-[#fbbf6a]' },
  tender: { bg: 'bg-[#241420]', border: 'border-[#F472B6]/40', text: 'text-[#f9a8d4]' },
  expansive: { bg: 'bg-[#1c1729]', border: 'border-[#8B5CF6]/40', text: 'text-[#c4b5fd]' },
  urgent: { bg: 'bg-[#251313]', border: 'border-[#EF4444]/40', text: 'text-[#fca5a5]' },
  default: { bg: 'bg-[#161614]', border: 'border-[#1f1f1d]', text: 'text-[#d4d2cd]' },
}

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
        {/* Header - matches loaded state so nothing jumps once data arrives */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', padding: '20px 24px', rowGap: '12px' }}>
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
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px' }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: c.divider }} />
            ))}
          </div>
        </div>

        {/* Mobile tab bar skeleton */}
        <div
          className="md:hidden flex"
          style={{
            borderBottom: `1px solid ${c.divider}`,
            backgroundColor: c.containerBg,
            borderTopLeftRadius: '24px',
            borderTopRightRadius: '24px',
          }}
        >
          {['Queue', 'Active', 'Completed'].map((name) => (
            <div key={name} className="flex-1 py-3 flex items-center justify-center">
              <div className="h-3 w-14 rounded animate-pulse" style={{ backgroundColor: c.divider }} />
            </div>
          ))}
        </div>

        {/* Desktop skeleton columns */}
        <div
          className="hidden md:flex flex-1 overflow-hidden"
          style={{ borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}
        >
          {[
            { width: '20%', border: true },
            { width: '60%', border: true },
            { width: '20%', border: false },
          ].map((col, i) => (
            <div
              key={i}
              className="flex flex-col px-4 py-3 space-y-3"
              style={{ width: col.width, borderRight: col.border ? `1px solid ${c.divider}` : 'none' }}
            >
              <div className="h-3 w-16 rounded animate-pulse mb-2" style={{ backgroundColor: c.divider }} />
              {[...Array(3)].map((_, j) => (
                <div key={j} className="h-20 rounded-lg animate-pulse" style={{ backgroundColor: c.cardBg }} />
              ))}
            </div>
          ))}
        </div>

        {/* Mobile skeleton cards */}
        <div className="md:hidden flex-1 px-4 py-3 space-y-3" style={{ backgroundColor: c.containerBg }}>
          {[...Array(3)].map((_, j) => (
            <div key={j} className="h-20 rounded-lg animate-pulse" style={{ backgroundColor: c.cardBg }} />
          ))}
        </div>
      </div>
    )
  }

  const allTasksComplete =
    selectedPiece &&
    selectedPiece.tasks.length > 0 &&
    selectedPiece.tasks.every((t) => t.status === 'complete')

  const renderCard = (
    id: string,
    title: string,
    arc: string,
    color: string,
    onClick: () => void,
    dragItem?: { type: 'idea' | 'piece'; id: string }
  ) => (
    <button
      key={id}
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
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', padding: '28px 24px 20px', rowGap: '12px' }}>
        <h1
          style={{
            fontFamily: 'var(--font-geist-sans)',
            fontWeight: 700,
            fontSize: 'clamp(24px, 8vw, 34px)',
            color: '#e8e6e0',
            margin: 0,
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          Project Board
        </h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
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

      {/* Mobile Tab Bar - Hidden on md+ */}
      <div
        className="md:hidden flex"
        style={{
          backgroundColor: c.containerBg,
          borderBottom: `1px solid ${c.divider}`,
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
        }}
      >
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
      <div
        className="hidden md:flex flex-1 overflow-hidden"
        style={{ borderTopLeftRadius: '24px', borderTopRightRadius: '24px' }}
      >
        {/* Queue Column */}
        <div
          className="w-[20%] flex flex-col transition-colors"
          style={{
            backgroundColor: dragOverColumn === 'Queue' ? c.cardBgInner : c.containerBg,
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
          <div className="flex-1 overflow-y-auto px-4 py-3 pb-24 space-y-3">
            {queue.map((idea) =>
              renderCard(idea.id, idea.title, idea.arc, '#F59E0B', () => openIdeaModal(idea.id), {
                type: 'idea',
                id: idea.id,
              })
            )}
          </div>
        </div>

        {/* Active Column */}
        <div
          className="w-[60%] flex flex-col transition-colors"
          style={{
            backgroundColor: dragOverColumn === 'Active' ? c.cardBgInner : c.containerBg,
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
          <div className="flex-1 overflow-y-auto px-4 py-3 pb-24 space-y-3">
            {active.map((piece) =>
              renderCard(piece.id, piece.title, piece.arc, '#10B981', () => openPieceModal(piece.id), {
                type: 'piece',
                id: piece.id,
              })
            )}
          </div>
        </div>

        {/* Completed Column */}
        <div
          className="w-[20%] flex flex-col transition-colors"
          style={{ backgroundColor: dragOverColumn === 'Completed' ? c.cardBgInner : c.containerBg }}
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
          <div className="flex-1 overflow-y-auto px-4 py-3 pb-24 space-y-3">
            {completed.map((piece) =>
              renderCard(piece.id, piece.title, piece.arc, '#8B5CF6', () => openPieceModal(piece.id))
            )}
          </div>
        </div>
      </div>

      {/* Mobile Layout - Single Column with Tabs */}
      <div className="md:hidden flex-1 overflow-y-auto px-4 py-3 pb-28" style={{ backgroundColor: c.containerBg }}>
        <div className="space-y-3">
          {activeTab === 'Queue' &&
            queue.map((idea) =>
              renderCard(idea.id, idea.title, idea.arc, '#F59E0B', () => openIdeaModal(idea.id))
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

      {/* Trajectory Banner */}
      <div
        className={`fixed bottom-4 left-4 right-4 md:bottom-6 md:left-6 md:right-6 z-40 border rounded-2xl shadow-lg px-4 md:px-6 py-4 flex items-center justify-between gap-4 transition-colors ${
          (trajectory?.tone && TONE_STYLES[trajectory.tone]) ? TONE_STYLES[trajectory.tone].bg : TONE_STYLES.default.bg
        } ${
          (trajectory?.tone && TONE_STYLES[trajectory.tone]) ? TONE_STYLES[trajectory.tone].border : TONE_STYLES.default.border
        }`}
      >
        <div className="min-w-0 flex-1">
          {trajectory ? (
            <p
              className={`text-base leading-snug ${
                TONE_STYLES[trajectory.tone || '']?.text || TONE_STYLES.default.text
              }`}
            >
              {trajectory.statement}
            </p>
          ) : (
            <p className="text-sm text-[#8c8a87]">No trajectory set yet</p>
          )}
        </div>
        <button
          onClick={() => router.push('/zoom-out')}
          className="text-sm font-medium text-[#e8e6e1] bg-[#2e2d2a] hover:bg-[#3d3c39] px-4 py-2 rounded-lg transition-colors whitespace-nowrap flex-shrink-0"
          style={{ fontFamily: 'var(--font-geist-sans)', fontWeight: 600 }}
        >
          {trajectory ? 'Zoom out' : 'Find your direction'}
        </button>
      </div>

      {/* Piece Modal */}
      {modalType === 'piece' && selectedPiece && (
        <div className="fixed inset-0 bg-[#111110] z-50 flex flex-col">
          <div className="sticky top-0 bg-[#161614] border-b border-[#1f1f1d] px-6 py-4 flex justify-between items-start flex-shrink-0">
            <div className="flex-1">
              <h2 className="text-lg font-medium text-[#e8e6e1]">{selectedPiece.title}</h2>
              <div className="flex gap-3 mt-2 text-xs text-[#8c8a87]">
                <span>{selectedPiece.arc}</span>
                <span>•</span>
                <span>{selectedPiece.thematic_territory}</span>
              </div>
            </div>
            <button
              onClick={closeModal}
              className="text-[#4a4946] hover:text-[#e8e6e1] text-lg"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
              {/* Core Concept Section */}
              {coreConceptDraft && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-[#e8e6e1] uppercase tracking-widest">Core Concept</h3>
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">One Sentence</p>
                      <input
                        type="text"
                        value={coreConceptDraft.one_sentence}
                        onChange={(e) => handleCoreConceptChange('one_sentence', e.target.value)}
                        className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] focus:outline-none focus:border-[#4a4946] transition-colors"
                      />
                    </div>

                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Conviction</p>
                      <AutoResizeTextarea
                        value={coreConceptDraft.conviction_statement}
                        onChange={(value) => handleCoreConceptChange('conviction_statement', value)}
                        minRows={2}
                        className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] focus:outline-none focus:border-[#4a4946] transition-colors leading-relaxed"
                      />
                    </div>

                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Emotional Journey</p>
                      <AutoResizeTextarea
                        value={coreConceptDraft.emotional_journey}
                        onChange={(value) => handleCoreConceptChange('emotional_journey', value)}
                        minRows={2}
                        className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] focus:outline-none focus:border-[#4a4946] transition-colors leading-relaxed"
                      />
                    </div>

                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Core Truth</p>
                      <AutoResizeTextarea
                        value={coreConceptDraft.core_truth}
                        onChange={(value) => handleCoreConceptChange('core_truth', value)}
                        minRows={2}
                        className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] focus:outline-none focus:border-[#4a4946] transition-colors leading-relaxed"
                      />
                    </div>

                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Substack Goals</p>
                      <AutoResizeTextarea
                        value={coreConceptDraft.substack_goals}
                        onChange={(value) => handleCoreConceptChange('substack_goals', value)}
                        minRows={2}
                        placeholder={"- Goal one\n- Goal two"}
                        className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] focus:outline-none focus:border-[#4a4946] transition-colors leading-relaxed whitespace-pre-wrap"
                      />
                    </div>

                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Short Form Goals</p>
                      <AutoResizeTextarea
                        value={coreConceptDraft.short_form_goals}
                        onChange={(value) => handleCoreConceptChange('short_form_goals', value)}
                        minRows={2}
                        placeholder={"- Goal one\n- Goal two"}
                        className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] focus:outline-none focus:border-[#4a4946] transition-colors leading-relaxed whitespace-pre-wrap"
                      />
                    </div>

                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Open Threads</p>
                      <AutoResizeTextarea
                        value={coreConceptDraft.open_threads}
                        onChange={(value) => handleCoreConceptChange('open_threads', value)}
                        minRows={2}
                        placeholder={"- Thread one\n- Thread two"}
                        className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] focus:outline-none focus:border-[#4a4946] transition-colors leading-relaxed whitespace-pre-wrap"
                      />
                    </div>

                    <button
                      onClick={handleSaveCoreConcept}
                      disabled={isSavingCoreConcept}
                      className="w-full py-2 bg-[#2e2d2a] text-[#e8e6e1] text-xs font-medium rounded hover:bg-[#3d3c39] transition-colors disabled:opacity-50"
                    >
                      {isSavingCoreConcept ? 'Saving...' : coreConceptSaved ? 'Saved ✓' : 'Save changes'}
                    </button>
                  </div>
                </div>
              )}

              {/* Tasks Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-[#e8e6e1] uppercase tracking-widest">Tasks</h3>
                <div className="space-y-2">
                  {selectedPiece.tasks.length === 0 ? (
                    <p className="text-sm text-[#3d3c39]">No tasks</p>
                  ) : (
                    <>
                      {selectedPiece.tasks
                        .filter((t) => t.status === 'pending')
                        .map((task) => (
                          <div
                            key={task.id}
                            className="bg-[#111110] border border-[#1f1f1d] rounded p-3 flex items-center gap-3"
                          >
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => handleToggleTask(task.id, 'pending')}
                              className="accent-green-600 flex-shrink-0 cursor-pointer"
                            />
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-base text-[#d4d2cd]">{task.title}</span>
                              <span className="text-xs text-[#4a4946] px-2 py-0.5 rounded bg-[#1f1f1d] flex-shrink-0">
                                {task.type}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              className="text-xs text-[#6b6966] hover:text-red-300 transition-colors flex-shrink-0"
                            >
                              Delete
                            </button>
                          </div>
                        ))}

                      {selectedPiece.tasks.filter((t) => t.status === 'complete').length > 0 && (
                        <div className="pt-2 space-y-2">
                          <p className="text-xs text-[#4a4946] uppercase tracking-widest">Completed</p>
                          {selectedPiece.tasks
                            .filter((t) => t.status === 'complete')
                            .map((task) => (
                              <div
                                key={task.id}
                                className="bg-[#111110] border border-[#1f1f1d] rounded p-3 flex items-center gap-3 opacity-60"
                              >
                                <input
                                  type="checkbox"
                                  checked
                                  onChange={() => handleToggleTask(task.id, 'complete')}
                                  className="accent-green-600 flex-shrink-0 cursor-pointer"
                                />
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-base text-[#4a4946] line-through">{task.title}</span>
                                  <span className="text-xs text-[#3d3c39] px-2 py-0.5 rounded bg-[#1f1f1d] flex-shrink-0">
                                    {task.type}
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* Add Task */}
                  <div className="pt-3 border-t border-[#1f1f1d] space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTaskInput}
                        onChange={(e) => setNewTaskInput(e.target.value)}
                        placeholder="Add task..."
                        className="flex-1 bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946]"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') handleAddTask()
                        }}
                      />
                      <select
                        value={newTaskType}
                        onChange={(e) => setNewTaskType(e.target.value as 'creation' | 'execution')}
                        className="bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] focus:outline-none focus:border-[#4a4946]"
                      >
                        <option value="creation">Creation</option>
                        <option value="execution">Execution</option>
                      </select>
                      <button
                        onClick={handleAddTask}
                        className="px-3 py-2 bg-[#e8e6e1] text-[#111110] text-sm font-medium rounded hover:bg-[#d4d2cd]"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2 border-t border-[#1f1f1d] pt-4">
                <button
                  onClick={() => {
                    if (selectedPiece) window.location.href = `/write?piece_id=${selectedPiece.id}`
                  }}
                  className="w-full py-2.5 bg-[#e8e6e1] text-[#111110] text-sm font-medium rounded hover:bg-[#d4d2cd] transition-colors"
                >
                  {selectedPiece?.substack_draft ? 'Resume writing' : 'Begin writing'}
                </button>
                {allTasksComplete && (
                  <button
                    onClick={handleCompletepiece}
                    className="w-full py-2.5 bg-green-600/20 text-green-400 text-sm font-medium rounded hover:bg-green-600/30 transition-colors"
                  >
                    Mark piece complete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Idea Modal */}
      {modalType === 'idea' && selectedIdea && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161614] border border-[#1f1f1d] rounded max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#161614] border-b border-[#1f1f1d] px-6 py-4 flex justify-between items-start">
              <div className="flex-1">
                <h2 className="text-lg font-medium text-[#e8e6e1]">{selectedIdea.title}</h2>
                <div className="flex gap-3 mt-2 text-xs text-[#8c8a87]">
                  <span>{selectedIdea.arc}</span>
                  <span>•</span>
                  <span>{selectedIdea.thematic_territory}</span>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="text-[#4a4946] hover:text-[#e8e6e1] text-lg"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 space-y-6">
              {/* Idea Details */}
              <div className="space-y-3">
                {selectedIdea.one_sentence && (
                  <div>
                    <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">One Sentence</p>
                    <p className="text-[#d4d2cd]">{selectedIdea.one_sentence}</p>
                  </div>
                )}
              </div>

              {/* Linked Tasks if piece exists */}
              {selectedIdea.piece_id && selectedIdea.tasks && selectedIdea.tasks.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-[#e8e6e1] uppercase tracking-widest">Linked Piece Tasks</h3>
                  <div className="space-y-2">
                    {selectedIdea.tasks.map((task) => (
                      <div
                        key={task.id}
                        className="bg-[#111110] border border-[#1f1f1d] rounded p-2 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-base text-[#d4d2cd]">{task.title}</span>
                          <span className="text-[#4a4946] text-xs px-2 py-0.5 rounded bg-[#1f1f1d]">
                            {task.type}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activate Button */}
              <div className="border-t border-[#1f1f1d] pt-4">
                <button
                  onClick={() => handleActivate(selectedIdea.id)}
                  className="w-full py-2 bg-[#F59E0B] text-[#111110] text-xs font-medium rounded hover:bg-[#f5a82b] transition-colors"
                >
                  Activate Idea
                </button>
              </div>
            </div>
          </div>
        </div>
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
