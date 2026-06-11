'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

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
        console.log('Save successful, navigating to /project-board with piece_id:', data.piece_id)
        router.push(`/project-board?piece_id=${data.piece_id}`)
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

  const allConfirmed = Object.values(sections).every((s) => s.status === 'confirmed')

  return (
    <div className="min-h-screen bg-[#111110] flex flex-col">
      <div className="flex-1 px-6 py-12 max-w-3xl mx-auto w-full">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-light text-[#e8e6e1] mb-2">Core Concept</h1>
            <p className="text-sm text-[#4a4946]">Building your idea document</p>
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
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#4a4946] block mb-2">Arc</label>
                  <input
                    type="text"
                    value={sections.phase1.content.arc || ''}
                    onChange={(e) => handleEditContent('phase1', 'arc', e.target.value)}
                    disabled={sections.phase1.status === 'confirmed'}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
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
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
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
                  <textarea
                    value={sections.phase2.content.conviction_statement || ''}
                    onChange={(e) => {
                      handleEditContent('phase2', 'conviction_statement', e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                    }}
                    disabled={sections.phase2.status === 'confirmed'}
                    rows={1}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
                    style={{ resize: 'none', overflowY: 'auto', maxHeight: '150px' }}
                  />
                </div>

                <div>
                  <label className="text-xs text-[#4a4946] block mb-2">Emotional Journey</label>
                  <textarea
                    value={sections.phase2.content.emotional_journey || ''}
                    onChange={(e) => {
                      handleEditContent('phase2', 'emotional_journey', e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                    }}
                    disabled={sections.phase2.status === 'confirmed'}
                    rows={1}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
                    style={{ resize: 'none', overflowY: 'auto', maxHeight: '150px' }}
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
                <textarea
                  value={sections.phase3.content.core_truth || ''}
                  onChange={(e) => {
                    handleEditContent('phase3', 'core_truth', e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = e.target.scrollHeight + 'px'
                  }}
                  disabled={sections.phase3.status === 'confirmed'}
                  rows={1}
                  className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
                  style={{ resize: 'none', overflowY: 'auto', maxHeight: '150px' }}
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
                  <textarea
                    value={sections.phase4.content.substack_goals || ''}
                    onChange={(e) => {
                      handleEditContent('phase4', 'substack_goals', e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                    }}
                    disabled={sections.phase4.status === 'confirmed'}
                    rows={1}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
                    style={{ resize: 'none', overflowY: 'auto', maxHeight: '150px' }}
                  />
                </div>

                <div>
                  <label className="text-xs text-[#4a4946] block mb-2">Short Form Goals</label>
                  <textarea
                    value={sections.phase4.content.short_form_goals || ''}
                    onChange={(e) => {
                      handleEditContent('phase4', 'short_form_goals', e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                    }}
                    disabled={sections.phase4.status === 'confirmed'}
                    rows={1}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
                    style={{ resize: 'none', overflowY: 'auto', maxHeight: '150px' }}
                  />
                </div>

                <div>
                  <label className="text-xs text-[#4a4946] block mb-2">Open Threads</label>
                  <textarea
                    value={sections.phase4.content.open_threads || ''}
                    onChange={(e) => {
                      handleEditContent('phase4', 'open_threads', e.target.value)
                      e.target.style.height = 'auto'
                      e.target.style.height = e.target.scrollHeight + 'px'
                    }}
                    disabled={sections.phase4.status === 'confirmed'}
                    rows={1}
                    className="w-full bg-[#111110] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] disabled:opacity-50 transition-colors"
                    style={{ resize: 'none', overflowY: 'auto', maxHeight: '150px' }}
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
    </div>
  )
}
