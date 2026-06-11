'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface Task {
  id: string
  title: string
  type: 'creation' | 'execution'
}

interface ActivePiece {
  id: string
  title: string
  arc: string
  thematic_territory: string
  stage: string
  next_action: string
  tasks: Task[]
}

interface QueueIdea {
  id: string
  title: string
  one_sentence: string
}

interface ArchivedPiece {
  id: string
  title: string
  arc: string
  created_at: string
}

function ProjectBoardContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const highlightId = searchParams.get('piece_id')

  const [viewMode, setViewMode] = useState<'execution' | 'full'>('execution')
  const [active, setActive] = useState<ActivePiece[]>([])
  const [queue, setQueue] = useState<QueueIdea[]>([])
  const [archived, setArchived] = useState<ArchivedPiece[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [expandedTasks, setExpandedTasks] = useState<string | null>(null)
  const [editingTasks, setEditingTasks] = useState<string | null>(null)
  const [sessionForm, setSessionForm] = useState<string | null>(null)
  const [completingTask, setCompletingTask] = useState<string | null>(null)
  const [sessionData, setSessionData] = useState({
    what_was_done: '',
    next_step: '',
    duration_minutes: '',
  })

  const highlightRef = useRef<HTMLDivElement>(null)

  // Set default view based on day of week
  useEffect(() => {
    const day = new Date().getDay()
    // Mon(1), Tue(2), Wed(3), Fri(5) = execution
    // Thu(4), Sat(6), Sun(0) = full
    const defaultMode = [1, 2, 3, 5].includes(day) ? 'execution' : 'full'
    setViewMode(defaultMode as 'execution' | 'full')
  }, [])

  // Fetch pieces
  useEffect(() => {
    const fetchPieces = async () => {
      try {
        const res = await fetch('/api/project-board/pieces')
        const data = await res.json()
        setActive(data.active || [])
        setQueue(data.queue || [])
        setArchived(data.archived || [])
      } catch (err) {
        console.error('Failed to fetch pieces:', err)
        setError('Failed to load board')
      } finally {
        setIsLoading(false)
      }
    }

    fetchPieces()
  }, [])

  // Scroll to highlighted piece
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [highlightId, active])

  const handleSessionSubmit = async (pieceId: string, taskId?: string) => {
    if (!sessionData.what_was_done.trim() || !sessionData.next_step.trim()) {
      setError('Please fill in both fields')
      return
    }

    try {
      const res = await fetch('/api/project-board/session-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piece_id: pieceId,
          what_was_done: sessionData.what_was_done,
          next_step: sessionData.next_step,
          duration_minutes: sessionData.duration_minutes ? parseInt(sessionData.duration_minutes) : undefined,
          completed_task_id: taskId,
        }),
      })

      const data = await res.json()
      if (data.success) {
        // Refresh pieces
        const piecesRes = await fetch('/api/project-board/pieces')
        const piecesData = await piecesRes.json()
        setActive(piecesData.active || [])
        setSessionForm(null)
        setSessionData({ what_was_done: '', next_step: '', duration_minutes: '' })
      } else {
        setError(data.error || 'Failed to log session')
      }
    } catch (err) {
      console.error('Session log error:', err)
      setError('Failed to log session')
    }
  }

  const handleActivate = async (ideaId: string) => {
    try {
      const res = await fetch('/api/project-board/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_id: ideaId }),
      })

      const data = await res.json()
      if (data.success) {
        // Refresh pieces
        const piecesRes = await fetch('/api/project-board/pieces')
        const piecesData = await piecesRes.json()
        setActive(piecesData.active || [])
        setQueue(piecesData.queue || [])
      } else {
        setError(data.error || 'Failed to activate idea')
      }
    } catch (err) {
      console.error('Activate error:', err)
      setError('Failed to activate idea')
    }
  }

  const handleCompleteTask = async (pieceId: string, taskId: string) => {
    setCompletingTask(taskId)

    try {
      const res = await fetch('/api/project-board/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, status: 'complete' }),
      })

      const data = await res.json()
      if (data.success) {
        // Refresh pieces after animation
        setTimeout(() => {
          const piecesRes = fetch('/api/project-board/pieces')
          piecesRes.then(r => r.json()).then(piecesData => {
            setActive(piecesData.active || [])
            setCompletingTask(null)
          })
        }, 300)
      } else {
        setError(data.error || 'Failed to complete task')
        setCompletingTask(null)
      }
    } catch (err) {
      console.error('Complete task error:', err)
      setError('Failed to complete task')
      setCompletingTask(null)
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    try {
      const res = await fetch('/api/project-board/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      })

      const data = await res.json()
      if (data.success) {
        // Refresh pieces
        const piecesRes = await fetch('/api/project-board/pieces')
        const piecesData = await piecesRes.json()
        setActive(piecesData.active || [])
      } else {
        setError(data.error || 'Failed to delete task')
      }
    } catch (err) {
      console.error('Delete task error:', err)
      setError('Failed to delete task')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111110] flex items-center justify-center">
        <p className="text-[#4a4946]">Loading board...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#111110] flex flex-col">
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
        <h1 className="text-2xl font-light text-[#e8e6e1]">Project Board</h1>
        <button
          onClick={() => setViewMode(viewMode === 'execution' ? 'full' : 'execution')}
          className="px-3 py-1.5 text-xs bg-[#1c1c1a] border border-[#2e2d2a] text-[#8c8a87] rounded hover:border-[#4a4946] transition-colors"
        >
          {viewMode === 'execution' ? 'Full view' : 'Execution view'}
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-900/20 border border-red-700/30 rounded">
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 px-6 py-8 overflow-auto max-w-7xl mx-auto w-full space-y-12">
        {/* Active Section */}
        <div className="space-y-4">
          <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">Active ({active.length})</h2>
          {active.length === 0 ? (
            <p className="text-sm text-[#3d3c39]">No active pieces</p>
          ) : (
            <div className="space-y-3">
              {active.map((piece) => (
                <div
                  key={piece.id}
                  ref={highlightId === piece.id ? highlightRef : null}
                  className={`bg-[#161614] border rounded p-4 space-y-3 transition-all ${
                    highlightId === piece.id ? 'border-[#e8e6e1] shadow-lg' : 'border-[#1f1f1d]'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-base font-medium text-[#e8e6e1]">{piece.title}</h3>
                      <div className="flex gap-3 mt-2 text-xs text-[#8c8a87]">
                        <span>{piece.arc}</span>
                        <span>•</span>
                        <span>{piece.stage}</span>
                      </div>
                    </div>
                  </div>

                  {viewMode === 'full' && (
                    <p className="text-xs text-[#6b6966]">Next: {piece.next_action}</p>
                  )}

                  <div className="flex gap-3 flex-wrap">
                    <button
                      onClick={() => setExpandedTasks(expandedTasks === piece.id ? null : piece.id)}
                      className="text-xs text-[#6b6966] underline underline-offset-2 hover:text-[#8c8a87]"
                    >
                      Switch task
                    </button>
                    <button
                      onClick={() => setEditingTasks(editingTasks === piece.id ? null : piece.id)}
                      className="text-xs text-[#6b6966] underline underline-offset-2 hover:text-[#8c8a87]"
                    >
                      Edit tasks
                    </button>
                    <button
                      onClick={() => setSessionForm(sessionForm === piece.id ? null : piece.id)}
                      className="text-xs text-[#6b6966] underline underline-offset-2 hover:text-[#8c8a87]"
                    >
                      Log session
                    </button>
                  </div>

                  {expandedTasks === piece.id && (
                    <div className="mt-3 pt-3 border-t border-[#1f1f1d] space-y-2">
                      {piece.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-center justify-between bg-[#111110] p-2 rounded text-xs"
                        >
                          <span className="text-[#d4d2cd]">{task.title}</span>
                          <span className="text-[#4a4946]">{task.type}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {editingTasks === piece.id && (
                    <div className="mt-3 pt-3 border-t border-[#1f1f1d] space-y-3">
                      <div className="space-y-2">
                        <p className="text-xs text-[#4a4946] uppercase tracking-widest">Pending tasks</p>
                        {piece.tasks.filter(t => true).length === 0 ? (
                          <p className="text-xs text-[#3d3c39]">No pending tasks</p>
                        ) : (
                          piece.tasks.filter(t => true).map((task) => (
                            <div
                              key={task.id}
                              className={`flex items-center justify-between bg-[#111110] p-2 rounded text-xs transition-all ${
                                completingTask === task.id ? 'complete-task' : ''
                              }`}
                            >
                              <span className="flex-1">{task.title}</span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleCompleteTask(piece.id, task.id)}
                                  className="text-[#6b6966] hover:text-green-300 transition-colors text-xs"
                                >
                                  Done
                                </button>
                                <button
                                  onClick={() => handleDeleteTask(task.id)}
                                  className="text-[#6b6966] hover:text-red-300 transition-colors text-xs"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs text-[#4a4946] uppercase tracking-widest">Add task</p>
                        <input
                          type="text"
                          placeholder="Task title..."
                          className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946]"
                        />
                        <div className="flex gap-2">
                          <select className="flex-1 bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] focus:outline-none focus:border-[#4a4946]">
                            <option value="creation">Creation</option>
                            <option value="execution">Execution</option>
                          </select>
                          <button className="px-3 py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd]">
                            Add
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {sessionForm === piece.id && (
                    <div className="mt-3 pt-3 border-t border-[#1f1f1d] space-y-2">
                      <textarea
                        value={sessionData.what_was_done}
                        onChange={(e) => setSessionData({ ...sessionData, what_was_done: e.target.value })}
                        placeholder="What was done..."
                        rows={2}
                        className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] resize-none"
                      />
                      <textarea
                        value={sessionData.next_step}
                        onChange={(e) => setSessionData({ ...sessionData, next_step: e.target.value })}
                        placeholder="Next step..."
                        rows={2}
                        className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] resize-none"
                      />
                      <input
                        type="number"
                        value={sessionData.duration_minutes}
                        onChange={(e) => setSessionData({ ...sessionData, duration_minutes: e.target.value })}
                        placeholder="Duration (minutes)"
                        className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946]"
                      />
                      <button
                        onClick={() =>
                          handleSessionSubmit(
                            piece.id,
                            piece.tasks.length > 0 ? piece.tasks[0].id : undefined
                          )
                        }
                        className="w-full py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd] transition-colors"
                      >
                        Save session
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Queue Section */}
        {viewMode === 'full' && (
          <div className="space-y-4">
            <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">Queue ({queue.length})</h2>
            {queue.length === 0 ? (
              <p className="text-sm text-[#3d3c39]">No ideas in queue</p>
            ) : (
              <div className="space-y-3">
                {queue.map((idea) => (
                  <div key={idea.id} className="bg-[#161614] border border-[#1f1f1d] rounded p-4 space-y-2">
                    <h3 className="text-base font-medium text-[#e8e6e1]">{idea.title}</h3>
                    <p className="text-xs text-[#8c8a87]">{idea.one_sentence}</p>
                    <button
                      onClick={() => handleActivate(idea.id)}
                      className="text-xs text-[#6b6966] underline underline-offset-2 hover:text-[#8c8a87]"
                    >
                      Activate
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Archive Section */}
        {viewMode === 'full' && (
          <div className="space-y-4">
            <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">Archive ({archived.length})</h2>
            {archived.length === 0 ? (
              <p className="text-sm text-[#3d3c39]">No archived pieces</p>
            ) : (
              <div className="space-y-3">
                {archived.map((piece) => (
                  <div key={piece.id} className="bg-[#161614] border border-[#1f1f1d] rounded p-4">
                    <h3 className="text-base font-medium text-[#e8e6e1]">{piece.title}</h3>
                    <div className="flex gap-3 mt-2 text-xs text-[#8c8a87]">
                      <span>{piece.arc}</span>
                      <span>•</span>
                      <span>{new Date(piece.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProjectBoardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#111110] flex items-center justify-center"><p className="text-[#4a4946]">Loading...</p></div>}>
      <ProjectBoardContent />
    </Suspense>
  )
}
