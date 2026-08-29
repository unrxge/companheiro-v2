'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AutoResizeTextarea from '@/components/AutoResizeTextarea'
import { shellBackground, cardPalette } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'

const c = cardPalette['dark']

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
      <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0 24px', height: 64, borderBottom: `1px solid ${c.divider}`, display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
          <IconButton onClick={() => router.push('/idea-lab/conceptualise')} ariaLabel="Back to Conceptualise">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </IconButton>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: c.textPrimary, letterSpacing: '-0.02em' }}>Task Roadmap</h1>
        </div>
        <div style={{ flex: 1, padding: '48px 24px', maxWidth: 680, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <p style={{ fontSize: 13, color: c.textMuted }}>Review and edit the suggested tasks before beginning</p>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: 12 }}>
                <p style={{ fontSize: 12, color: '#fca5a5' }}>{error}</p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tasks.map((task, index) => (
                <div key={index} style={{ background: c.cardBg, border: `1px solid ${c.divider}`, borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <span style={{ fontSize: 14, color: c.textSecondary }}>{task.title}</span>
                    <span style={{ fontSize: 11, background: c.containerBg, color: c.textMuted, padding: '2px 8px', borderRadius: 4 }}>{task.type}</span>
                  </div>
                  <button onClick={() => handleDeleteTask(task.id)} style={{ fontSize: 12, color: c.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
                </div>
              ))}
            </div>

            <div style={{ background: c.cardBg, border: `1px solid ${c.divider}`, borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted }}>Add task</p>
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Task title…"
                style={{ width: '100%', background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 6, padding: '8px 12px', fontSize: 14, color: c.textPrimary, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={newTaskType}
                  onChange={(e) => setNewTaskType(e.target.value as 'creation' | 'execution')}
                  style={{ flex: 1, background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 6, padding: '8px 12px', fontSize: 13, color: c.textPrimary, outline: 'none' }}
                >
                  <option value="creation">Creation</option>
                  <option value="execution">Execution</option>
                </select>
                <button
                  onClick={handleAddTask}
                  style={{ padding: '8px 16px', background: c.textPrimary, color: c.containerBg, fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer' }}
                >
                  Add
                </button>
              </div>
            </div>

            <button
              onClick={handleBegin}
              style={{ width: '100%', padding: '12px', background: c.textPrimary, color: c.containerBg, fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer' }}
            >
              Begin
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '0 24px', height: 64, borderBottom: `1px solid ${c.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <IconButton onClick={() => router.push('/idea-lab/conceptualise')} ariaLabel="Back to Conceptualise">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </IconButton>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: c.textPrimary, letterSpacing: '-0.02em' }}>Core Concept</h1>
        </div>
        {conversation.length > 0 && (
          <button
            onClick={() => setShowConversation(true)}
            style={{ fontSize: 12, color: c.textSecondary, background: 'none', border: `1px solid ${c.divider}`, borderRadius: 6, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            View conversation
          </button>
        )}
      </div>

      <div style={{ flex: 1, padding: '32px 24px', maxWidth: 780, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: 12 }}>
              <p style={{ fontSize: 12, color: '#fca5a5' }}>{error}</p>
            </div>
          )}

          {(['phase1', 'phase2', 'phase3', 'phase4'] as const).map((phaseKey) => {
            const section = sections[phaseKey]
            const isPending = section.status === 'pending'
            const isConfirmed = section.status === 'confirmed'
            return (
              <div key={phaseKey} style={{
                background: isPending ? c.containerBg : c.cardBg,
                border: `1px solid ${c.divider}`,
                borderRadius: 10,
                padding: 24,
                opacity: isPending ? 0.5 : 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                transition: 'opacity 0.3s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, color: c.textMuted }}>
                    {section.title}
                  </h2>
                  {isConfirmed && <span style={{ fontSize: 12, color: c.textMuted }}>✓</span>}
                </div>

                {section.status !== 'pending' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {phaseKey === 'phase1' && (
                      <>
                        {(['one_sentence', 'arc', 'thematic_territory'] as const).map((field) => (
                          <div key={field}>
                            <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6, textTransform: 'capitalize' }}>
                              {field === 'one_sentence' ? 'Idea in one sentence' : field === 'thematic_territory' ? 'Territory' : 'Arc'}
                            </label>
                            <input
                              type="text"
                              value={section.content[field] || ''}
                              onChange={(e) => handleEditContent(phaseKey, field, e.target.value)}
                              disabled={isConfirmed}
                              style={{ width: '100%', background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 6, padding: '8px 12px', fontSize: 14, color: c.textPrimary, outline: 'none', opacity: isConfirmed ? 0.6 : 1, boxSizing: 'border-box', fontFamily: 'inherit' }}
                            />
                          </div>
                        ))}
                      </>
                    )}

                    {phaseKey === 'phase2' && (
                      <>
                        <div>
                          <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>Conviction Statement</label>
                          <AutoResizeTextarea
                            value={section.content.conviction_statement || ''}
                            onChange={(value) => handleEditContent(phaseKey, 'conviction_statement', value)}
                            disabled={isConfirmed}
                            minRows={3}
                            className=""
                            style={{ width: '100%', background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 6, padding: '8px 12px', fontSize: 14, color: c.textPrimary, outline: 'none', lineHeight: 1.6, opacity: isConfirmed ? 0.6 : 1, fontFamily: 'inherit', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>Emotional Journey</label>
                          <AutoResizeTextarea
                            value={section.content.emotional_journey || ''}
                            onChange={(value) => handleEditContent(phaseKey, 'emotional_journey', value)}
                            disabled={isConfirmed}
                            minRows={3}
                            className=""
                            style={{ width: '100%', background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 6, padding: '8px 12px', fontSize: 14, color: c.textPrimary, outline: 'none', lineHeight: 1.6, opacity: isConfirmed ? 0.6 : 1, fontFamily: 'inherit', boxSizing: 'border-box' }}
                          />
                        </div>
                      </>
                    )}

                    {phaseKey === 'phase3' && (
                      <AutoResizeTextarea
                        value={section.content.core_truth || ''}
                        onChange={(value) => handleEditContent(phaseKey, 'core_truth', value)}
                        disabled={isConfirmed}
                        minRows={2}
                        className=""
                        style={{ width: '100%', background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 6, padding: '8px 12px', fontSize: 14, color: c.textPrimary, outline: 'none', lineHeight: 1.6, opacity: isConfirmed ? 0.6 : 1, fontFamily: 'inherit', boxSizing: 'border-box' }}
                      />
                    )}

                    {phaseKey === 'phase4' && (
                      <>
                        {(['substack_goals', 'short_form_goals', 'open_threads'] as const).map((field) => (
                          <div key={field}>
                            <label style={{ fontSize: 11, color: c.textMuted, display: 'block', marginBottom: 6 }}>
                              {field === 'substack_goals' ? 'Substack Goals' : field === 'short_form_goals' ? 'Short Form Goals' : 'Open Threads'}
                            </label>
                            <AutoResizeTextarea
                              value={section.content[field] || ''}
                              onChange={(value) => handleEditContent(phaseKey, field, value)}
                              disabled={isConfirmed}
                              minRows={3}
                              placeholder={field === 'open_threads' ? '- Thread one\n- Thread two' : '- Goal one\n- Goal two'}
                              className=""
                              style={{ width: '100%', background: c.inputBg, border: `1px solid ${c.inputBorder}`, borderRadius: 6, padding: '8px 12px', fontSize: 14, color: c.textPrimary, outline: 'none', lineHeight: 1.6, opacity: isConfirmed ? 0.6 : 1, fontFamily: 'inherit', boxSizing: 'border-box' }}
                            />
                          </div>
                        ))}
                      </>
                    )}

                    {!isConfirmed && (
                      <button
                        onClick={() => handleConfirmSection(phaseKey)}
                        disabled={phaseKey === 'phase2' && (!section.content.conviction_statement || !section.content.emotional_journey)}
                        style={{ width: '100%', padding: '10px', background: c.textPrimary, color: c.containerBg, fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', opacity: (phaseKey === 'phase2' && (!section.content.conviction_statement || !section.content.emotional_journey)) ? 0.3 : 1 }}
                      >
                        Confirm
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Lock Document Button */}
          {allConfirmed && (
            <button
              onClick={handleSaveDocument}
              disabled={isLoading || isSaving}
              style={{ width: '100%', padding: '12px', background: c.textPrimary, color: c.containerBg, fontSize: 14, fontWeight: 600, borderRadius: 8, border: 'none', cursor: isLoading || isSaving ? 'not-allowed' : 'pointer', opacity: isLoading || isSaving ? 0.3 : 1 }}
            >
              {isSaving ? 'Saving…' : 'Lock this document'}
            </button>
          )}
        </div>
      </div>

      {/* Conceptualisation Conversation Modal */}
      {showConversation && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}>
          <div style={{ background: c.cardBg, border: `1px solid ${c.divider}`, borderRadius: 10, maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ position: 'sticky', top: 0, background: c.cardBg, borderBottom: `1px solid ${c.divider}`, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 600, color: c.textPrimary }}>Conceptualisation</h2>
              <button onClick={() => setShowConversation(false)} style={{ color: c.textMuted, background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {conversation.map((msg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: 480, padding: '10px 14px', borderRadius: 8, background: msg.role === 'user' ? c.textPrimary : c.inputBg, color: msg.role === 'user' ? c.containerBg : c.textSecondary }}>
                    <p style={{ fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
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
