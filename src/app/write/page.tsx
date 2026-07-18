'use client'

import { useState, useEffect, useRef, Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { readTextStream } from '@/lib/stream-client'

interface Task {
  id: string
  title: string
  type: 'creation' | 'execution'
  status: 'pending' | 'complete'
  is_writing_related: boolean | null
}

interface PieceCore {
  id: string
  title: string
  substack_draft: string
  conviction_statement: string
  emotional_journey: string
  core_truth: string
  substack_goals: string
  tasks: Task[]
}

interface Section {
  id: string
  position: number
  label: string | null
  intended_emotion: string | null
  content: string
  is_locked: boolean
}

interface AnchorLine {
  id: string
  section_id: string | null
  text: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function WriteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pieceId = searchParams.get('piece_id')

  const [piece, setPiece] = useState<PieceCore | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [sections, setSections] = useState<Section[]>([])
  const [anchorLines, setAnchorLines] = useState<AnchorLine[]>([])
  const [suggestions, setSuggestions] = useState<Record<string, string>>({})
  const [writingEthos, setWritingEthos] = useState('')
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [openLinesFor, setOpenLinesFor] = useState<string | null>(null)
  const [newLineText, setNewLineText] = useState('')
  const [flowView, setFlowView] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [chatExpanded, setChatExpanded] = useState(false)
  const [expandedSection, setExpandedSection] = useState<'ethos' | 'core' | 'tasks' | 'assistant' | null>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)

  const dirtySectionsRef = useRef<Set<string>>(new Set())
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const ethosTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sectionsRef = useRef<Section[]>([])
  sectionsRef.current = sections

  useEffect(() => {
    if (!pieceId) {
      router.push('/project-board')
      return
    }
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId])

  const fetchAll = async () => {
    try {
      const [pieceRes, sectionsRes] = await Promise.all([
        fetch(`/api/project-board/piece?id=${pieceId}`),
        fetch(`/api/write/sections?piece_id=${pieceId}`),
      ])
      const pieceData = await pieceRes.json()
      const sectionsData = await sectionsRes.json()

      if (pieceData.success) {
        setPiece(pieceData.piece)
        setTitle(pieceData.piece.title || '')
      }
      setSections(sectionsData.sections || [])
      setAnchorLines(sectionsData.anchorLines || [])
      setWritingEthos(sectionsData.writing_ethos || '')
    } catch (err) {
      console.error('Failed to load writing studio:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // ---- Section persistence: one debounced flush of all dirty sections ----
  const flushSections = useCallback(async () => {
    const dirty = Array.from(dirtySectionsRef.current)
    if (dirty.length === 0 || !pieceId) return
    dirtySectionsRef.current = new Set()
    setIsSaving(true)
    try {
      await Promise.all(
        dirty.map((id) => {
          const s = sectionsRef.current.find((x) => x.id === id)
          if (!s) return Promise.resolve()
          return fetch('/api/write/sections', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, piece_id: pieceId, content: s.content }),
            keepalive: true,
          })
        })
      )
    } catch (err) {
      console.error('Failed to save sections:', err)
    } finally {
      setIsSaving(false)
    }
  }, [pieceId])

  const markDirty = (id: string) => {
    dirtySectionsRef.current.add(id)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(flushSections, 1500)
  }

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushSections()
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [flushSections])

  const handleSectionContentChange = (id: string, content: string) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, content } : s)))
    markDirty(id)
  }

  const handleSectionFieldSave = async (id: string, field: 'label' | 'intended_emotion', value: string) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
    try {
      await fetch('/api/write/sections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, piece_id: pieceId, [field]: value }),
      })
    } catch (err) {
      console.error('Failed to save section field:', err)
    }
  }

  const toggleLock = async (id: string) => {
    const target = sections.find((s) => s.id === id)
    if (!target) return
    // Flush any pending content edit before locking so nothing is lost.
    if (dirtySectionsRef.current.has(id)) await flushSections()
    const next = !target.is_locked
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, is_locked: next } : s)))
    try {
      await fetch('/api/write/sections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, piece_id: pieceId, is_locked: next }),
      })
    } catch (err) {
      console.error('Failed to toggle lock:', err)
    }
  }

  const addSection = async (content = '') => {
    try {
      const res = await fetch('/api/write/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId, content }),
      })
      const data = await res.json()
      if (data.section) setSections((prev) => [...prev, data.section])
    } catch (err) {
      console.error('Failed to add section:', err)
    }
  }

  const deleteSection = async (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id))
    setAnchorLines((prev) => prev.filter((l) => l.section_id !== id))
    try {
      await fetch('/api/write/sections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, piece_id: pieceId }),
      })
    } catch (err) {
      console.error('Failed to delete section:', err)
    }
  }

  const seedSections = async (force = false) => {
    setIsSeeding(true)
    try {
      const res = await fetch('/api/write/sections/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId, force }),
      })
      const data = await res.json()
      if (data.sections) {
        setSections(data.sections)
        const map: Record<string, string> = {}
        data.sections.forEach((s: Section, i: number) => {
          if (data.suggestions?.[i]) map[s.id] = data.suggestions[i]
        })
        setSuggestions(map)
      }
    } catch (err) {
      console.error('Failed to seed sections:', err)
    } finally {
      setIsSeeding(false)
    }
  }

  const addAnchorLine = async (text: string, sectionId?: string) => {
    if (!text.trim()) return
    try {
      const res = await fetch('/api/write/anchor-lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId, text: text.trim(), section_id: sectionId }),
      })
      const data = await res.json()
      if (data.anchorLine) setAnchorLines((prev) => [...prev, data.anchorLine])
    } catch (err) {
      console.error('Failed to add anchor line:', err)
    }
  }

  const deleteAnchorLine = async (id: string) => {
    setAnchorLines((prev) => prev.filter((l) => l.id !== id))
    try {
      await fetch('/api/write/anchor-lines', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch (err) {
      console.error('Failed to delete anchor line:', err)
    }
  }

  const saveTitle = (value: string) => {
    setTitle(value)
    if (titleTimeoutRef.current) clearTimeout(titleTimeoutRef.current)
    titleTimeoutRef.current = setTimeout(() => {
      fetch('/api/write/draft', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId, title: value }),
      }).catch((err) => console.error('Failed to save title:', err))
    }, 1000)
  }

  const saveEthos = (value: string) => {
    setWritingEthos(value)
    if (ethosTimeoutRef.current) clearTimeout(ethosTimeoutRef.current)
    ethosTimeoutRef.current = setTimeout(() => {
      fetch('/api/write/draft', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId, writing_ethos: value }),
      }).catch((err) => console.error('Failed to save ethos:', err))
    }, 1000)
  }

  const handleChatSend = async () => {
    if (!chatInput.trim() || !pieceId || isChatLoading) return
    const userMessage = chatInput
    setChatInput('')
    const priorHistory = chatMessages
    const newMessages = [...chatMessages, { role: 'user' as const, content: userMessage }]
    setChatMessages(newMessages)
    setIsChatLoading(true)
    try {
      const res = await fetch('/api/write/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, piece_id: pieceId, conversation_history: priorHistory }),
      })
      if (!res.ok) return
      setChatMessages([...newMessages, { role: 'assistant', content: '' }])
      await readTextStream(res, (visibleText) => {
        setChatMessages([...newMessages, { role: 'assistant', content: visibleText }])
      })
    } catch (err) {
      console.error('Failed to send chat message:', err)
    } finally {
      setIsChatLoading(false)
    }
  }

  if (isLoading || !piece) {
    return (
      <div className="min-h-screen bg-[#111110] flex items-center justify-center">
        <p className="text-[#4a4946]">Loading...</p>
      </div>
    )
  }

  const wordCount = sections
    .map((s) => s.content.trim().split(/\s+/).filter((w) => w.length > 0).length)
    .reduce((a, b) => a + b, 0)
  const canMarkReady = wordCount > 100
  const writingTasks = piece.tasks.filter((t) => t.type === 'creation' && t.is_writing_related !== false)
  const linesForSection = (id: string) => anchorLines.filter((l) => l.section_id === id)
  const unplacedLines = anchorLines.filter((l) => !l.section_id)

  return (
    <div className="h-screen bg-[#111110] flex overflow-hidden">
      {/* Main writing area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-12 border-b border-[#1f1f1d] flex items-center justify-between px-6" style={{ background: '#111110' }}>
          <button
            onClick={async () => {
              await flushSections()
              router.push('/project-board')
            }}
            className="text-[#8c8a87] hover:text-[#e8e6e1] text-sm transition-colors"
          >
            ← Back
          </button>
          <div className="flex items-center gap-4">
            {sections.length > 0 && (
              <button
                onClick={() => setFlowView(!flowView)}
                className="text-[#8c8a87] hover:text-[#e8e6e1] text-sm transition-colors"
              >
                {flowView ? 'Section view' : 'Flow view'}
              </button>
            )}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-[#8c8a87] hover:text-[#e8e6e1] text-sm transition-colors"
            >
              {sidebarOpen ? 'Hide panel' : 'Show panel'}
            </button>
          </div>
        </div>

        {/* Writing surface */}
        <div className="flex-1 overflow-y-auto" style={{ background: '#111110' }}>
          <div className="max-w-[720px] mx-auto px-12 md:px-16 py-12">
            {/* Title */}
            <textarea
              value={title}
              onChange={(e) => {
                saveTitle(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = e.target.scrollHeight + 'px'
              }}
              placeholder="Title"
              rows={1}
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                overflow: 'hidden',
                fontSize: '2rem',
                fontWeight: 700,
                color: '#e8e6e0',
                lineHeight: '1.3',
                marginBottom: '1.5rem',
                padding: 0,
              }}
            />

            {/* Empty state */}
            {sections.length === 0 ? (
              <div className="mt-8 border border-[#1f1f1d] rounded-lg p-8 text-center space-y-4">
                <p className="text-sm text-[#8c8a87] leading-relaxed">
                  Shape this piece into sections drawn from its emotional journey, or start with a
                  blank section and build it yourself.
                </p>
                <div className="flex flex-col gap-2 max-w-xs mx-auto">
                  <button
                    onClick={() => seedSections(false)}
                    disabled={isSeeding}
                    className="py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded hover:bg-[#d4d2cd] transition-colors disabled:opacity-50"
                  >
                    {isSeeding ? 'Shaping…' : 'Shape from emotional journey'}
                  </button>
                  {piece.substack_draft?.trim() && (
                    <button
                      onClick={() => addSection(piece.substack_draft)}
                      className="py-2 bg-transparent border border-[#2e2d2a] text-[#8c8a87] text-xs font-medium rounded hover:border-[#4a4946] hover:text-[#d4d2cd] transition-colors"
                    >
                      Continue existing draft as one section
                    </button>
                  )}
                  <button
                    onClick={() => addSection('')}
                    className="py-2 bg-transparent border border-[#2e2d2a] text-[#8c8a87] text-xs font-medium rounded hover:border-[#4a4946] hover:text-[#d4d2cd] transition-colors"
                  >
                    Start with a blank section
                  </button>
                </div>
              </div>
            ) : (
              <div className={flowView ? 'space-y-0' : 'space-y-4'}>
                {/* Unplaced anchor lines */}
                {!flowView && unplacedLines.length > 0 && (
                  <div className="border border-dashed border-[#2e2d2a] rounded p-3 space-y-1">
                    <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Unplaced lines</p>
                    {unplacedLines.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-[#d4d2cd] italic">“{l.text}”</span>
                        <button onClick={() => deleteAnchorLine(l.id)} className="text-[#6b6966] hover:text-red-300">✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {sections.map((section) => {
                  const isActive = activeSectionId === section.id
                  const lines = linesForSection(section.id)
                  return (
                    <div
                      key={section.id}
                      className={
                        flowView
                          ? ''
                          : `rounded-lg border transition-colors ${
                              isActive ? 'border-[#10B981]/50' : 'border-[#1f1f1d]'
                            } ${section.is_locked ? 'bg-[#131312]' : 'bg-[#141312]'}`
                      }
                    >
                      {/* Section header (hidden in flow view) */}
                      {!flowView && (
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1f1f1d]">
                          <input
                            value={section.label || ''}
                            onChange={(e) =>
                              setSections((prev) =>
                                prev.map((s) => (s.id === section.id ? { ...s, label: e.target.value } : s))
                              )
                            }
                            onBlur={(e) => handleSectionFieldSave(section.id, 'label', e.target.value)}
                            placeholder="Untitled section"
                            className="bg-transparent text-xs font-medium text-[#e8e6e1] uppercase tracking-widest focus:outline-none flex-1 min-w-0"
                          />
                          {section.intended_emotion && (
                            <span className="text-xs text-[#6b6966] italic flex-shrink-0">
                              {section.intended_emotion}
                            </span>
                          )}
                          <button
                            onClick={() => setOpenLinesFor(openLinesFor === section.id ? null : section.id)}
                            className="text-xs text-[#6b6966] hover:text-[#d4d2cd] transition-colors flex-shrink-0"
                            title="Anchor lines"
                          >
                            Lines{lines.length > 0 ? ` (${lines.length})` : ''}
                          </button>
                          <button
                            onClick={() => toggleLock(section.id)}
                            className={`text-xs transition-colors flex-shrink-0 ${
                              section.is_locked ? 'text-[#10B981]' : 'text-[#6b6966] hover:text-[#d4d2cd]'
                            }`}
                          >
                            {section.is_locked ? '🔒 Locked' : 'Lock'}
                          </button>
                          <button
                            onClick={() => deleteSection(section.id)}
                            className="text-xs text-[#6b6966] hover:text-red-300 transition-colors flex-shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      )}

                      {/* Anchor-lines dropdown */}
                      {!flowView && openLinesFor === section.id && (
                        <div className="px-4 py-3 border-b border-[#1f1f1d] space-y-2 bg-[#111110]">
                          {lines.length === 0 ? (
                            <p className="text-xs text-[#3d3c39]">No lines placed here yet.</p>
                          ) : (
                            lines.map((l) => (
                              <div key={l.id} className="flex items-center justify-between gap-2">
                                <span className="text-xs text-[#d4d2cd] italic">“{l.text}”</span>
                                <button onClick={() => deleteAnchorLine(l.id)} className="text-[#6b6966] hover:text-red-300 text-xs">✕</button>
                              </div>
                            ))
                          )}
                          <input
                            placeholder="Add a line to this section…"
                            className="w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded px-2 py-1 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                addAnchorLine(e.currentTarget.value, section.id)
                                e.currentTarget.value = ''
                              }
                            }}
                          />
                        </div>
                      )}

                      {/* Section content */}
                      <textarea
                        value={section.content}
                        onChange={(e) => {
                          if (section.is_locked) return
                          handleSectionContentChange(section.id, e.target.value)
                          e.target.style.height = 'auto'
                          e.target.style.height = e.target.scrollHeight + 'px'
                        }}
                        onFocus={() => setActiveSectionId(section.id)}
                        onBlur={() => flushSections()}
                        readOnly={section.is_locked}
                        placeholder={suggestions[section.id] || (flowView ? '' : 'Write this section…')}
                        rows={flowView ? 1 : 3}
                        ref={(el) => {
                          if (el) {
                            el.style.height = 'auto'
                            el.style.height = el.scrollHeight + 'px'
                          }
                        }}
                        style={{
                          width: '100%',
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          resize: 'none',
                          overflow: 'hidden',
                          fontSize: '1.125rem',
                          color: section.is_locked ? '#a8a6a0' : '#e8e6e0',
                          lineHeight: '1.8',
                          padding: flowView ? '0 0 1.5rem 0' : '0.75rem 1rem 1rem 1rem',
                        }}
                      />
                    </div>
                  )
                })}

                {/* Add section + word count (section view only) */}
                {!flowView && (
                  <button
                    onClick={() => addSection('')}
                    className="w-full py-2 border border-dashed border-[#2e2d2a] text-[#6b6966] text-xs rounded hover:border-[#4a4946] hover:text-[#d4d2cd] transition-colors"
                  >
                    + Add section
                  </button>
                )}
              </div>
            )}

            {/* Word count and status */}
            {sections.length > 0 && (
              <div className="mt-12 pt-8 border-t border-[#1f1f1d]">
                <div className="flex justify-between items-center text-xs text-[#a8a6a0]">
                  <span>{wordCount} words</span>
                  <span>{isSaving ? 'Saving…' : 'Saved'}</span>
                </div>
                {canMarkReady && (
                  <button
                    onClick={async () => {
                      await flushSections()
                      router.push(`/write/translate?piece_id=${pieceId}`)
                    }}
                    className="mt-6 text-sm text-[#a8a6a0] hover:text-[#e8e6e1] transition-colors underline"
                  >
                    This draft is ready →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right sidebar */}
      <div
        className={`border-l border-[#1f1f1d] transition-all duration-300 flex flex-col ${
          sidebarOpen ? (chatExpanded ? 'w-[35%]' : 'w-80') : 'w-0'
        } overflow-hidden`}
        style={{ background: '#111110' }}
      >
        {sidebarOpen && (
          <div className="flex flex-col h-full overflow-y-auto p-4 space-y-3">
            {/* Ethos (Gather) */}
            <div className="border border-[#1f1f1d] rounded overflow-hidden">
              <button
                onClick={() => setExpandedSection(expandedSection === 'ethos' ? null : 'ethos')}
                className="w-full px-4 py-3 bg-[#111110] text-left text-xs font-medium text-[#e8e6e1] uppercase tracking-widest hover:bg-[#1f1f1d] transition-colors"
              >
                Ethos
              </button>
              {expandedSection === 'ethos' && (
                <div className="border-t border-[#1f1f1d] p-3 bg-[#111110]">
                  <textarea
                    value={writingEthos}
                    onChange={(e) => saveEthos(e.target.value)}
                    placeholder="What you want this piece to be — the bullets in your head, the point you're really making…"
                    rows={5}
                    className="w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] resize-none leading-relaxed"
                  />
                </div>
              )}
            </div>

            {/* Core Concept */}
            <div className="border border-[#1f1f1d] rounded overflow-hidden">
              <button
                onClick={() => setExpandedSection(expandedSection === 'core' ? null : 'core')}
                className="w-full px-4 py-3 bg-[#111110] text-left text-xs font-medium text-[#e8e6e1] uppercase tracking-widest hover:bg-[#1f1f1d] transition-colors"
              >
                Core Concept
              </button>
              {expandedSection === 'core' && (
                <div className="border-t border-[#1f1f1d] p-4 space-y-3 bg-[#111110] text-xs">
                  {piece.conviction_statement && (
                    <div>
                      <p className="text-[#4a4946] uppercase tracking-widest mb-1">Conviction</p>
                      <p className="text-[#d4d2cd]">{piece.conviction_statement}</p>
                    </div>
                  )}
                  {piece.emotional_journey && (
                    <div>
                      <p className="text-[#4a4946] uppercase tracking-widest mb-1">Emotional Journey</p>
                      <p className="text-[#d4d2cd]">{piece.emotional_journey}</p>
                    </div>
                  )}
                  {piece.core_truth && (
                    <div>
                      <p className="text-[#4a4946] uppercase tracking-widest mb-1">Core Truth</p>
                      <p className="text-[#d4d2cd]">{piece.core_truth}</p>
                    </div>
                  )}
                  {piece.substack_goals && (
                    <div>
                      <p className="text-[#4a4946] uppercase tracking-widest mb-1">Substack Goals</p>
                      <p className="text-[#d4d2cd]">{piece.substack_goals}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tasks */}
            <div className="border border-[#1f1f1d] rounded overflow-hidden">
              <button
                onClick={() => setExpandedSection(expandedSection === 'tasks' ? null : 'tasks')}
                className="w-full px-4 py-3 bg-[#111110] text-left text-xs font-medium text-[#e8e6e1] uppercase tracking-widest hover:bg-[#1f1f1d] transition-colors"
              >
                Tasks
              </button>
              {expandedSection === 'tasks' && (
                <div className="border-t border-[#1f1f1d] p-4 bg-[#111110]">
                  {writingTasks.length === 0 ? (
                    <p className="text-xs text-[#3d3c39]">No writing tasks yet.</p>
                  ) : (
                    <div className="divide-y divide-[#1f1f1d]">
                      {writingTasks.map((task) => (
                        <div key={task.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                          <span
                            className={`flex-shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                              task.status === 'complete' ? 'bg-green-900/20 border-green-700/50' : 'border-[#3d3c39]'
                            }`}
                          >
                            {task.status === 'complete' && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
                          </span>
                          <span className={`text-sm ${task.status === 'complete' ? 'text-[#4a4946] line-through' : 'text-[#d4d2cd]'}`}>
                            {task.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Anchor lines quick-add */}
            <div className="border border-[#1f1f1d] rounded overflow-hidden">
              <div className="px-4 py-3 bg-[#111110] flex items-center justify-between">
                <span className="text-xs font-medium text-[#e8e6e1] uppercase tracking-widest">Anchor a line</span>
              </div>
              <div className="border-t border-[#1f1f1d] p-3 bg-[#111110]">
                <input
                  value={newLineText}
                  onChange={(e) => setNewLineText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newLineText.trim()) {
                      addAnchorLine(newLineText)
                      setNewLineText('')
                    }
                  }}
                  placeholder="A line dear to you — we'll place it…"
                  className="w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946]"
                />
              </div>
            </div>

            {/* Writing Assistant */}
            <div className="border border-[#1f1f1d] rounded overflow-hidden flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between bg-[#111110]">
                <button
                  onClick={() => setExpandedSection(expandedSection === 'assistant' ? null : 'assistant')}
                  className="flex-1 px-4 py-3 text-left text-xs font-medium text-[#e8e6e1] uppercase tracking-widest hover:bg-[#1f1f1d] transition-colors"
                >
                  Writing Assistant
                </button>
                {expandedSection === 'assistant' && (
                  <button
                    onClick={() => setChatExpanded(!chatExpanded)}
                    className="px-3 py-3 text-xs text-[#6b6966] hover:text-[#d4d2cd] transition-colors"
                    title={chatExpanded ? 'Shrink' : 'Maximize'}
                  >
                    {chatExpanded ? '⤡' : '⤢'}
                  </button>
                )}
              </div>
              {expandedSection === 'assistant' && (
                <div className="border-t border-[#1f1f1d] flex flex-col flex-1 min-h-0 bg-[#111110]">
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {chatMessages.length === 0 ? (
                      <p className="text-xs text-[#3d3c39]">Ask about your piece, stuck sections, or angles.</p>
                    ) : (
                      chatMessages.map((msg, i) => (
                        <div key={i} className={`text-xs ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                          <div
                            className={`inline-block max-w-[85%] px-3 py-2 rounded whitespace-pre-wrap ${
                              msg.role === 'user' ? 'bg-[#2e2d2a] text-[#e8e6e1]' : 'bg-[#1f1f1d] text-[#d4d2cd]'
                            }`}
                          >
                            {msg.content}
                          </div>
                        </div>
                      ))
                    )}
                    {isChatLoading && <p className="text-xs text-[#4a4946]">Thinking…</p>}
                  </div>
                  <div className="border-t border-[#1f1f1d] p-3 space-y-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isChatLoading) handleChatSend()
                      }}
                      placeholder="Ask something…"
                      className="w-full bg-[#2e2d2a] border border-[#2e2d2a] rounded px-3 py-2 text-xs text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946]"
                    />
                    <button
                      onClick={handleChatSend}
                      disabled={!chatInput.trim() || isChatLoading}
                      className="w-full px-3 py-2 bg-[#2e2d2a] text-[#e8e6e1] text-xs font-medium rounded hover:bg-[#3d3c39] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function WritePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111110] flex items-center justify-center">
          <p className="text-[#4a4946]">Loading...</p>
        </div>
      }
    >
      <WriteContent />
    </Suspense>
  )
}
