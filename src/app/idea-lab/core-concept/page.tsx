'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AutoResizeTextarea from '@/components/AutoResizeTextarea'

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

interface DocumentSection {
  title: string
  status: 'pending' | 'active' | 'confirmed'
  content: Record<string, string>
  userInput?: string
  aiReflection?: string
}

export default function CoreConceptPage() {
  const router = useRouter()
  const [conversation, setConversation] = useState<ConversationMessage[]>([])
  const [sections, setSections] = useState<Record<string, DocumentSection>>({
    phase1: {
      title: 'Idea Essence',
      status: 'pending',
      content: {},
    },
    phase2: {
      title: 'Conviction & Journey',
      status: 'pending',
      content: {},
    },
    phase3: {
      title: 'Core Truth',
      status: 'pending',
      content: {},
    },
    phase4: {
      title: 'Format & Threads',
      status: 'pending',
      content: {},
    },
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

  // Load conversation from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('conceptualisation_conversation')
    console.log('Retrieved conversation from sessionStorage:', stored)
    if (stored) {
      try {
        const parsedConversation = JSON.parse(stored)
        console.log('Parsed conversation:', parsedConversation)
        setConversation(parsedConversation)
        // Start phase 1 with the parsed conversation
        initializePhase(parsedConversation, 1)
      } catch (err) {
        console.error('Failed to parse conversation:', err)
        setError('Failed to load conversation')
      }
    }
  }, [])

  const initializePhase = async (conversationData: ConversationMessage[], phase: number) => {
    setIsLoading(true)
    setError(null)

    try {
      const phaseKey = `phase${phase}`
      const confirmedSections: Record<string, string> = {}

      // Collect confirmed sections
      Object.entries(sections).forEach(([key, section]) => {
        if (section.status === 'confirmed') {
          confirmedSections[key] = JSON.stringify(section.content)
        }
      })

      console.log('Sending to API (init):', { phase, conversation_history: conversationData, confirmedSections })

      const res = await fetch('/api/idea-lab/core-concept/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase,
          conversation_history: conversationData,
          confirmed_sections: confirmedSections,
        }),
      })

      const data = await res.json()

      if (!data.content || Object.keys(data.content).length === 0) {
        setError('Failed to generate content')
        return
      }

      setSections((prev) => ({
        ...prev,
        [phaseKey]: {
          ...prev[phaseKey],
          status: 'active',
          content: data.content,
        },
      }))
    } catch (err) {
      console.error('Generate error:', err)
      setError('Failed to generate content')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePhaseGenerate = async (phase: number) => {
    console.log('handlePhaseGenerate called with phase:', phase, 'conversation:', conversation)
    return initializePhase(conversation, phase)
  }

  const handleConfirmSection = (phaseKey: string, updatedContent?: Record<string, string>) => {
    setSections((prev) => ({
      ...prev,
      [phaseKey]: {
        ...prev[phaseKey],
        status: 'confirmed',
        content: updatedContent || prev[phaseKey].content,
      },
    }))

    // Advance to next phase
    const phaseNum = parseInt(phaseKey.replace('phase', ''))
    if (phaseNum < 4) {
      console.log('Advancing to phase:', phaseNum + 1, 'with conversation:', conversation)
      handlePhaseGenerate(phaseNum + 1)
    }
  }

  const handleEditContent = (phaseKey: string, field: string, value: string) => {
    setSections((prev) => ({
      ...prev,
      [phaseKey]: {
        ...prev[phaseKey],
        content: {
          ...prev[phaseKey].content,
          [field]: value,
        },
      },
    }))
  }

  const handleSaveDocument = async () => {
    console.log('Locking document with data:', sections)
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

      console.log('Sending document data to save API:', documentData)

      const res = await fetch('/api/idea-lab/core-concept/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(documentData),
      })

      console.log('Save API response status:', res.status)
      const data = await res.json()
      console.log('Save response:', res.status, data)

      if (data.success) {
        console.log('Save successful, showing task review for piece_id:', data.piece_id)
        setPieceId(data.piece_id)
        setTasks(data.tasks || [])
        setShowTaskReview(true)
      } else {
        console.error('Save failed:', data.error)
        setError(data.error || 'Failed to save document')
      }
    } catch (err) {
      console.error('Save error:', err)
      setError('Failed to save document')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteTask = async (taskId?: string) => {
    if (!taskId) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
      return
    }

    try {
      const res = await fetch('/api/project-board/tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
      })

      const data = await res.json()
      if (data.success) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId))
      } else {
        setError('Failed to delete task')
      }
    } catch (err) {
      console.error('Delete task error:', err)
      setError('Failed to delete task')
    }
  }

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !pieceId) {
      setError('Please enter a task title')
      return
    }

    try {
      const res = await fetch('/api/project-board/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          piece_id: pieceId,
          title: newTaskTitle,
          type: newTaskType,
        }),
      })

      const data = await res.json()
      if (data.success) {
        setTasks((prev) => [
          ...prev,
          { title: newTaskTitle, type: newTaskType },
        ])
        setNewTaskTitle('')
        setNewTaskType('creation')
      } else {
        setError('Failed to add task')
      }
    } catch (err) {
      console.error('Add task error:', err)
      setError('Failed to add task')
    }
  }

  const handleBegin = () => {
    if (pieceId) {
      router.push(`/project-board?piece_id=${pieceId}`)
    }
  }

  const allConfirmed = Object.values(sections).every((s) => s.status === 'confirmed')

  // Task review screen
  if (showTaskReview && pieceId) {
    return (
      <div className="min-h-screen bg-[#111110] flex flex-col">
        <div className="flex-1 px-6 py-12 max-w-2xl mx-auto w-full">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-light text-[#e8e6e1] mb-2">Your task roadmap</h1>
              <p className="text-sm text-[#4a4946]">Review and edit the suggested tasks before beginning</p>
            </div>

            {error && (
              <div className="bg-red-900/20 border border-red-700/30 rounded p-3">
                <p className="text-xs text-red-200">{error}</p>
              </div>
            )}

            <div className="space-y-2">
              {tasks.map((task, index) => (
                <div key={index} className="bg-[#161614] border border-[#1f1f1d] rounded p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-base text-[#d4d2cd]">{task.title}</span>
                    <span className="text-xs bg-[#111110] text-[#4a4946] px-2 py-1 rounded">
                      {task.type}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
                    className="text-xs text-[#6b6966] hover:text-red-300 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-[#161614] border border-[#1f1f1d] rounded p-4 space-y-3">
              <p className="text-xs text-[#4a4946] uppercase tracking-widest">Add task</p>
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Task title..."
                className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946]"
              />
              <div className="flex gap-2">
                <select
                  value={newTaskType}
                  onChange={(e) => setNewTaskType(e.target.value as 'creation' | 'execution')}
                  className="flex-1 bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] focus:outline-none focus:border-[#4a4946]"
                >
                  <option value="creation">Creation</option>
                  <option value="execution">Execution</option>
                </select>
                <button
                  onClick={handleAddTask}
                  className="px-4 py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd] transition-colors"
                >
                  Add
                </button>
              </div>
            </div>

            <button
              onClick={handleBegin}
              className="w-full py-3 bg-[#e8e6e1] text-[#111110] text-sm font-medium rounded hover:bg-[#d4d2cd] transition-colors"
            >
              Begin
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#111110] flex flex-col">
      <div className="flex-1 px-6 py-12 max-w-3xl mx-auto w-full">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <button
                onClick={() => router.push('/idea-lab/conceptualise')}
                className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] transition-colors mb-3"
              >
                ← Conceptualise
              </button>
              <h1 className="text-3xl font-light text-[#e8e6e1] mb-2">Core Concept</h1>
              <p className="text-sm text-[#4a4946]">Building your idea document</p>
            </div>
            {conversation.length > 0 && (
              <button
                onClick={() => setShowConversation(true)}
                className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] border border-[#2e2d2a] hover:border-[#4a4946] rounded px-3 py-1.5 transition-colors whitespace-nowrap flex-shrink-0"
              >
                View conversation
              </button>
            )}
          </div>

          {error && (
            <div className="bg-red-900/20 border border-red-700/30 rounded p-3">
              <p className="text-xs text-red-200">{error}</p>
            </div>
          )}

          {/* Phase 1: Idea Essence */}
          <div
            className={`border rounded p-6 space-y-4 transition-all ${
              sections.phase1.status === 'pending'
                ? 'bg-[#0d0d0c] border-[#1f1f1d] opacity-50'
                : 'bg-[#161614] border-[#1f1f1d]'
            }`}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">
                {sections.phase1.title}
              </h2>
              {sections.phase1.status === 'confirmed' && (
                <span className="text-xs text-[#4a4946]">✓</span>
              )}
            </div>

            {sections.phase1.status !== 'pending' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#4a4946] block mb-2">Idea in one sentence</label>
                  <input
                    type="text"
                    value={sections.phase1.content.one_sentence || ''}
                    onChange={(e) =>
                      handleEditContent('phase1', 'one_sentence', e.target.value)
                    }
                    disabled={sections.phase1.status === 'confirmed'}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#4a4946] block mb-2">Arc</label>
                  <input
                    type="text"
                    value={sections.phase1.content.arc || ''}
                    onChange={(e) => handleEditContent('phase1', 'arc', e.target.value)}
                    disabled={sections.phase1.status === 'confirmed'}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#4a4946] block mb-2">Territory</label>
                  <input
                    type="text"
                    value={sections.phase1.content.thematic_territory || ''}
                    onChange={(e) =>
                      handleEditContent('phase1', 'thematic_territory', e.target.value)
                    }
                    disabled={sections.phase1.status === 'confirmed'}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
                  />
                </div>

                {sections.phase1.status !== 'confirmed' && (
                  <button
                    onClick={() => handleConfirmSection('phase1')}
                    className="w-full py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd]"
                  >
                    Confirm
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Phase 2: Conviction & Journey */}
          <div
            className={`border rounded p-6 space-y-4 transition-all ${
              sections.phase2.status === 'pending'
                ? 'bg-[#0d0d0c] border-[#1f1f1d] opacity-50'
                : 'bg-[#161614] border-[#1f1f1d]'
            }`}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">
                {sections.phase2.title}
              </h2>
              {sections.phase2.status === 'confirmed' && (
                <span className="text-xs text-[#4a4946]">✓</span>
              )}
            </div>

            {sections.phase2.status !== 'pending' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#4a4946] block mb-2">Conviction Statement</label>
                  <AutoResizeTextarea
                    value={sections.phase2.content.conviction_statement || ''}
                    onChange={(value) => handleEditContent('phase2', 'conviction_statement', value)}
                    disabled={sections.phase2.status === 'confirmed'}
                    minRows={3}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors leading-relaxed"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#4a4946] block mb-2">Emotional Journey</label>
                  <AutoResizeTextarea
                    value={sections.phase2.content.emotional_journey || ''}
                    onChange={(value) => handleEditContent('phase2', 'emotional_journey', value)}
                    disabled={sections.phase2.status === 'confirmed'}
                    minRows={3}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors leading-relaxed"
                  />
                </div>

                {sections.phase2.status !== 'confirmed' && (
                  <button
                    onClick={() => handleConfirmSection('phase2')}
                    disabled={!sections.phase2.content.conviction_statement || !sections.phase2.content.emotional_journey}
                    className="w-full py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Confirm
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Phase 3: Core Truth */}
          <div
            className={`border rounded p-6 space-y-4 transition-all ${
              sections.phase3.status === 'pending'
                ? 'bg-[#0d0d0c] border-[#1f1f1d] opacity-50'
                : 'bg-[#161614] border-[#1f1f1d]'
            }`}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">
                {sections.phase3.title}
              </h2>
              {sections.phase3.status === 'confirmed' && (
                <span className="text-xs text-[#4a4946]">✓</span>
              )}
            </div>

            {sections.phase3.status !== 'pending' && (
              <div className="space-y-3">
                <AutoResizeTextarea
                  value={sections.phase3.content.core_truth || ''}
                  onChange={(value) => handleEditContent('phase3', 'core_truth', value)}
                  disabled={sections.phase3.status === 'confirmed'}
                  minRows={2}
                  className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors leading-relaxed"
                />

                {sections.phase3.status !== 'confirmed' && (
                  <button
                    onClick={() => handleConfirmSection('phase3')}
                    className="w-full py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd]"
                  >
                    Confirm
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Phase 4: Format & Threads */}
          <div
            className={`border rounded p-6 space-y-4 transition-all ${
              sections.phase4.status === 'pending'
                ? 'bg-[#0d0d0c] border-[#1f1f1d] opacity-50'
                : 'bg-[#161614] border-[#1f1f1d]'
            }`}
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">
                {sections.phase4.title}
              </h2>
              {sections.phase4.status === 'confirmed' && (
                <span className="text-xs text-[#4a4946]">✓</span>
              )}
            </div>

            {sections.phase4.status !== 'pending' && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#4a4946] block mb-2">Substack Goals</label>
                  <AutoResizeTextarea
                    value={sections.phase4.content.substack_goals || ''}
                    onChange={(value) => handleEditContent('phase4', 'substack_goals', value)}
                    disabled={sections.phase4.status === 'confirmed'}
                    minRows={3}
                    placeholder={"- Goal one\n- Goal two"}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors leading-relaxed whitespace-pre-wrap"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#4a4946] block mb-2">Short Form Goals</label>
                  <AutoResizeTextarea
                    value={sections.phase4.content.short_form_goals || ''}
                    onChange={(value) => handleEditContent('phase4', 'short_form_goals', value)}
                    disabled={sections.phase4.status === 'confirmed'}
                    minRows={3}
                    placeholder={"- Goal one\n- Goal two"}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors leading-relaxed whitespace-pre-wrap"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#4a4946] block mb-2">Open Threads</label>
                  <AutoResizeTextarea
                    value={sections.phase4.content.open_threads || ''}
                    onChange={(value) => handleEditContent('phase4', 'open_threads', value)}
                    disabled={sections.phase4.status === 'confirmed'}
                    minRows={3}
                    placeholder={"- Thread one\n- Thread two"}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors leading-relaxed whitespace-pre-wrap"
                  />
                </div>

                {sections.phase4.status !== 'confirmed' && (
                  <button
                    onClick={() => handleConfirmSection('phase4')}
                    className="w-full py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd]"
                  >
                    Confirm
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Lock Document Button */}
          {allConfirmed && (
            <button
              onClick={handleSaveDocument}
              disabled={isLoading || isSaving}
              className="w-full py-3 bg-[#e8e6e1] text-[#111110] text-sm font-medium rounded transition-colors hover:bg-[#d4d2cd] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : 'Lock this document'}
            </button>
          )}
        </div>
      </div>

      {/* Conceptualisation Conversation Modal */}
      {showConversation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#161614] border border-[#1f1f1d] rounded max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#161614] border-b border-[#1f1f1d] px-6 py-4 flex justify-between items-center">
              <h2 className="text-lg font-medium text-[#e8e6e1]">Conceptualisation</h2>
              <button
                onClick={() => setShowConversation(false)}
                className="text-[#4a4946] hover:text-[#e8e6e1] text-lg"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {conversation.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-md px-4 py-3 rounded ${
                      msg.role === 'user'
                        ? 'bg-[#e8e6e1] text-[#111110]'
                        : 'bg-[#111110] border border-[#1f1f1d] text-[#d4d2cd]'
                    }`}
                  >
                    <p className="text-base leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
