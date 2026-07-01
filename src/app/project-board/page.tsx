'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'

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
  const [completingTasks, setCompletingTasks] = useState<Set<string>>(new Set())
  const [newTaskInput, setNewTaskInput] = useState('')
  const [newTaskType, setNewTaskType] = useState<'creation' | 'execution'>('creation')
  const [sessionData, setSessionData] = useState({
    what_was_done: '',
    next_step: '',
    duration_minutes: '',
    completed_task_ids: new Set<string>(),
  })

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
        setSessionData({
          what_was_done: '',
          next_step: '',
          duration_minutes: '',
          completed_task_ids: new Set(),
        })
      }
    } catch (err) {
      console.error('Failed to fetch piece:', err)
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

  const handleSubmitSession = async () => {
    if (!selectedPiece) return

    try {
      const completedIds = Array.from(sessionData.completed_task_ids)

      await fetch('/api/project-board/session-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piece_id: selectedPiece.id,
          what_was_done: sessionData.what_was_done,
          next_step: sessionData.next_step,
          duration_minutes: sessionData.duration_minutes
            ? parseInt(sessionData.duration_minutes)
            : undefined,
          completed_task_ids: completedIds,
        }),
      })

      for (const taskId of completedIds) {
        setCompletingTasks((prev) => new Set(prev).add(taskId))
      }

      setTimeout(() => {
        setCompletingTasks(new Set())
        fetchBoard()
        closeModal()
      }, 300)
    } catch (err) {
      console.error('Failed to submit session:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111110] flex items-center justify-center">
        <p className="text-[#4a4946]">Loading board...</p>
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
        backgroundColor: '#161614',
        border: '1px solid #1f1f1d',
        borderRadius: '8px',
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
        (e.currentTarget as HTMLButtonElement).style.borderColor = '#1f1f1d'
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
            color: '#e8e6e0',
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
            color: '#4a4946',
            fontSize: '11px',
            margin: '8px 0 0 0',
          }}
        >
          {arc}
        </p>
      )}
    </button>
  )

  return (
    <div className="h-screen bg-[#111110] flex flex-col overflow-hidden">
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
      <div className="px-6 py-4 border-b border-[#1f1f1d] flex justify-between items-center">
        <div>
          <button
            onClick={() => router.push('/idea-lab')}
            className="text-xs text-[#a8a6a0] underline underline-offset-2 hover:text-[#e8e6e1] transition-colors"
          >
            New idea
          </button>
        </div>
        <h1 className="text-2xl font-light text-[#e8e6e1] flex-1 text-center">Project Board</h1>
        <div>
          <button
            onClick={() => router.push('/home')}
            className="text-xs text-[#a8a6a0] underline underline-offset-2 hover:text-[#e8e6e1] transition-colors"
          >
            Home
          </button>
        </div>
      </div>

      {/* Mobile Tab Bar - Hidden on md+ */}
      <div className="md:hidden flex border-b border-[#1f1f1d]" style={{ backgroundColor: '#1a1917' }}>
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
              backgroundColor: activeTab === tab.name ? '#1f1d1b' : 'transparent',
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
            <span style={{ color: '#e8e6e0', fontSize: '12px', fontWeight: 500 }}>
              {tab.name}
            </span>
            <span style={{ color: '#4a4946', fontSize: '11px' }}>({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Desktop Layout - 3 Columns */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Queue Column */}
        <div
          className={`w-[20%] border-r flex flex-col transition-colors ${
            dragOverColumn === 'Queue' ? 'bg-[#1a1917] border-[#F59E0B]/40' : 'border-[#1f1f1d]'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOverColumn('Queue')
          }}
          onDragLeave={() => setDragOverColumn((c) => (c === 'Queue' ? null : c))}
          onDrop={(e) => {
            e.preventDefault()
            handleDropOnColumn('Queue')
          }}
        >
          <div className="px-4 py-3 border-b border-[#1f1f1d] flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#F59E0B]"></div>
            <h2 className="text-sm font-medium text-[#e8e6e1]">Queue</h2>
            <span className="text-xs text-[#4a4946]">({queue.length})</span>
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
          className={`w-[60%] border-r flex flex-col transition-colors ${
            dragOverColumn === 'Active' ? 'bg-[#1a1917] border-[#10B981]/40' : 'border-[#1f1f1d]'
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOverColumn('Active')
          }}
          onDragLeave={() => setDragOverColumn((c) => (c === 'Active' ? null : c))}
          onDrop={(e) => {
            e.preventDefault()
            handleDropOnColumn('Active')
          }}
        >
          <div className="px-4 py-3 border-b border-[#1f1f1d] flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#10B981]"></div>
            <h2 className="text-sm font-medium text-[#e8e6e1]">Active</h2>
            <span className="text-xs text-[#4a4946]">({active.length})</span>
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
          className={`w-[20%] flex flex-col transition-colors ${
            dragOverColumn === 'Completed' ? 'bg-[#1a1917]' : ''
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOverColumn('Completed')
          }}
          onDragLeave={() => setDragOverColumn((c) => (c === 'Completed' ? null : c))}
          onDrop={(e) => {
            e.preventDefault()
            handleDropOnColumn('Completed')
          }}
        >
          <div className="px-4 py-3 border-b border-[#1f1f1d] flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#8B5CF6]"></div>
            <h2 className="text-sm font-medium text-[#e8e6e1]">Completed</h2>
            <span className="text-xs text-[#4a4946]">({completed.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 pb-24 space-y-3">
            {completed.map((piece) =>
              renderCard(piece.id, piece.title, piece.arc, '#8B5CF6', () => openPieceModal(piece.id))
            )}
          </div>
        </div>
      </div>

      {/* Mobile Layout - Single Column with Tabs */}
      <div className="md:hidden flex-1 overflow-y-auto px-4 py-3 pb-28">
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
        className={`fixed bottom-0 left-0 right-0 z-40 border-t px-4 md:px-6 py-4 flex items-center justify-between gap-4 transition-colors ${
          (trajectory?.tone && TONE_STYLES[trajectory.tone]) ? TONE_STYLES[trajectory.tone].bg : TONE_STYLES.default.bg
        } ${
          (trajectory?.tone && TONE_STYLES[trajectory.tone]) ? TONE_STYLES[trajectory.tone].border : TONE_STYLES.default.border
        }`}
      >
        <div className="min-w-0 flex-1">
          {trajectory ? (
            <p
              className={`text-sm leading-snug ${
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
          className="text-sm font-medium text-[#e8e6e1] bg-[#2e2d2a] hover:bg-[#3d3c39] px-4 py-2 rounded transition-colors whitespace-nowrap flex-shrink-0"
        >
          {trajectory ? 'Zoom out' : 'Find your direction'}
        </button>
      </div>

      {/* Piece Modal */}
      {modalType === 'piece' && selectedPiece && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161614] border border-[#1f1f1d] rounded max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#161614] border-b border-[#1f1f1d] px-6 py-4 flex justify-between items-start">
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

            <div className="px-6 py-4 space-y-6">
              {/* Core Concept Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-[#e8e6e1] uppercase tracking-widest">Core Concept</h3>
                <div className="space-y-3 text-sm">
                  {selectedPiece.one_sentence && (
                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">One Sentence</p>
                      <p className="text-[#d4d2cd]">{selectedPiece.one_sentence}</p>
                    </div>
                  )}
                  {selectedPiece.conviction_statement && (
                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Conviction</p>
                      <p className="text-[#d4d2cd]">{selectedPiece.conviction_statement}</p>
                    </div>
                  )}
                  {selectedPiece.emotional_journey && (
                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Emotional Journey</p>
                      <p className="text-[#d4d2cd]">{selectedPiece.emotional_journey}</p>
                    </div>
                  )}
                  {selectedPiece.core_truth && (
                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Core Truth</p>
                      <p className="text-[#d4d2cd]">{selectedPiece.core_truth}</p>
                    </div>
                  )}
                  {selectedPiece.substack_goals && (
                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Substack Goals</p>
                      <p className="text-[#d4d2cd]">{selectedPiece.substack_goals}</p>
                    </div>
                  )}
                  {selectedPiece.short_form_goals && (
                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Short Form Goals</p>
                      <p className="text-[#d4d2cd]">{selectedPiece.short_form_goals}</p>
                    </div>
                  )}
                  {selectedPiece.open_threads.length > 0 && (
                    <div>
                      <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Open Threads</p>
                      <ul className="text-[#d4d2cd] space-y-1">
                        {selectedPiece.open_threads.map((thread, i) => (
                          <li key={i} className="text-xs">• {thread}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {/* Tasks Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-[#e8e6e1] uppercase tracking-widest">Tasks</h3>
                <div className="space-y-2">
                  {selectedPiece.tasks.filter((t) => t.status === 'pending').length === 0 &&
                  selectedPiece.tasks.filter((t) => t.status === 'complete').length === 0 ? (
                    <p className="text-xs text-[#3d3c39]">No tasks</p>
                  ) : (
                    <>
                      {selectedPiece.tasks
                        .filter((t) => t.status === 'pending')
                        .map((task) => (
                          <div
                            key={task.id}
                            className="bg-[#111110] border border-[#1f1f1d] rounded p-2 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-[#d4d2cd]">{task.title}</span>
                              <span className="text-[#4a4946] text-xs px-2 py-0.5 rounded bg-[#1f1f1d]">
                                {task.type}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => {
                                  const newIds = new Set(sessionData.completed_task_ids)
                                  if (newIds.has(task.id)) {
                                    newIds.delete(task.id)
                                  } else {
                                    newIds.add(task.id)
                                  }
                                  setSessionData({
                                    ...sessionData,
                                    completed_task_ids: newIds,
                                  })
                                }}
                                className={`text-[#6b6966] hover:text-green-300 transition-colors text-xs px-2 py-1 rounded ${
                                  sessionData.completed_task_ids.has(task.id)
                                    ? 'bg-green-900/20 text-green-400'
                                    : ''
                                }`}
                              >
                                Done
                              </button>
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="text-[#6b6966] hover:text-red-300 transition-colors text-xs px-2 py-1 rounded"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        ))}

                      {selectedPiece.tasks.filter((t) => t.status === 'complete').length > 0 && (
                        <div className="pt-2 space-y-2">
                          <p className="text-xs text-[#4a4946]">Completed</p>
                          {selectedPiece.tasks
                            .filter((t) => t.status === 'complete')
                            .map((task) => (
                              <div
                                key={task.id}
                                className={`bg-[#111110] border border-[#1f1f1d] rounded p-2 flex items-center justify-between text-xs ${
                                  completingTasks.has(task.id) ? 'complete-task' : 'opacity-60'
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-1">
                                  <span className="text-[#4a4946] line-through">{task.title}</span>
                                  <span className="text-[#3d3c39] text-xs px-2 py-0.5 rounded bg-[#1f1f1d]">
                                    {task.type}
                                  </span>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}

                      {/* Add Task Section */}
                      <div className="pt-3 border-t border-[#1f1f1d] space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newTaskInput}
                            onChange={(e) => setNewTaskInput(e.target.value)}
                            placeholder="Add task..."
                            className="flex-1 bg-[#111110] border border-[#2e2d2a] rounded px-2 py-1 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946]"
                            onKeyPress={(e) => {
                              if (e.key === 'Enter') handleAddTask()
                            }}
                          />
                          <select
                            value={newTaskType}
                            onChange={(e) => setNewTaskType(e.target.value as 'creation' | 'execution')}
                            className="bg-[#111110] border border-[#2e2d2a] rounded px-2 py-1 text-xs text-[#e8e6e1] focus:outline-none focus:border-[#4a4946]"
                          >
                            <option value="creation">Creation</option>
                            <option value="execution">Execution</option>
                          </select>
                          <button
                            onClick={handleAddTask}
                            className="px-2 py-1 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd]"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Session Logs Section */}
              {selectedPiece.session_logs.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-[#e8e6e1] uppercase tracking-widest">Session History</h3>
                  <div className="space-y-2">
                    {selectedPiece.session_logs.map((log) => (
                      <div key={log.id} className="bg-[#111110] rounded p-3 border border-[#1f1f1d] text-xs">
                        <p className="text-[#8c8a87] text-xs mb-2">
                          {new Date(log.created_at).toLocaleDateString()} •{' '}
                          {log.duration_minutes ? `${log.duration_minutes}min` : 'no duration'}
                        </p>
                        <div className="space-y-1">
                          <p className="text-[#4a4946] uppercase tracking-widest text-xs mb-1">Did</p>
                          <p className="text-[#d4d2cd]">{log.what_was_done}</p>
                        </div>
                        <div className="space-y-1 mt-2">
                          <p className="text-[#4a4946] uppercase tracking-widest text-xs mb-1">Next</p>
                          <p className="text-[#d4d2cd]">{log.next_step}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Log Session Form */}
              <div className="space-y-3 border-t border-[#1f1f1d] pt-4">
                <h3 className="text-sm font-medium text-[#e8e6e1] uppercase tracking-widest">Log Session</h3>
                <textarea
                  value={sessionData.what_was_done}
                  onChange={(e) =>
                    setSessionData({ ...sessionData, what_was_done: e.target.value })
                  }
                  placeholder="What was done..."
                  rows={3}
                  className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] resize-none"
                />
                <textarea
                  value={sessionData.next_step}
                  onChange={(e) =>
                    setSessionData({ ...sessionData, next_step: e.target.value })
                  }
                  placeholder="Next step..."
                  rows={3}
                  className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] resize-none"
                />
                <input
                  type="number"
                  value={sessionData.duration_minutes}
                  onChange={(e) =>
                    setSessionData({ ...sessionData, duration_minutes: e.target.value })
                  }
                  placeholder="Duration (minutes)"
                  className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946]"
                />

                {selectedPiece.tasks.filter((t) => t.status === 'pending').length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-[#4a4946] uppercase tracking-widest">Tasks worked on</p>
                    <div className="space-y-1">
                      {selectedPiece.tasks
                        .filter((t) => t.status === 'pending')
                        .map((task) => (
                          <label key={task.id} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sessionData.completed_task_ids.has(task.id)}
                              onChange={(e) => {
                                const newIds = new Set(sessionData.completed_task_ids)
                                if (e.target.checked) {
                                  newIds.add(task.id)
                                } else {
                                  newIds.delete(task.id)
                                }
                                setSessionData({
                                  ...sessionData,
                                  completed_task_ids: newIds,
                                })
                              }}
                              className="accent-green-600"
                            />
                            <span className="text-[#d4d2cd]">{task.title}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 flex-col">
                  <div className="flex gap-2">
                    <button
                      onClick={handleSubmitSession}
                      disabled={!sessionData.what_was_done.trim() || !sessionData.next_step.trim()}
                      className="flex-1 py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Submit Session
                    </button>
                    {allTasksComplete && (
                      <button
                        onClick={handleCompletepiece}
                        className="flex-1 py-2 bg-green-600/20 text-green-400 text-xs font-medium rounded hover:bg-green-600/30 transition-colors"
                      >
                        Mark Complete
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (selectedPiece) {
                        window.location.href = `/write?piece_id=${selectedPiece.id}`
                      }
                    }}
                    className="w-full py-2 bg-[#2e2d2a] text-[#e8e6e1] text-xs font-medium rounded hover:bg-[#3d3c39] transition-colors"
                  >
                    {selectedPiece?.substack_draft ? 'Resume writing' : 'Begin writing'}
                  </button>
                </div>
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
                          <span className="text-[#d4d2cd]">{task.title}</span>
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
