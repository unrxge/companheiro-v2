'use client'

import { useState, useEffect, useRef, Suspense, useCallback, type ReactNode } from 'react'
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

type ToolKey = 'ethos' | 'core' | 'tasks' | 'anchor' | 'assistant'

const svg = (path: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
)

const TOOL_META: { key: ToolKey; label: string; icon: ReactNode }[] = [
  { key: 'ethos', label: 'Ethos', icon: svg(<><circle cx="12" cy="12" r="9" /><polygon points="12 7 14 12 12 17 10 12" /></>) },
  { key: 'core', label: 'Core Concept', icon: svg(<><rect x="5" y="3" width="14" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="13" y2="16" /></>) },
  { key: 'tasks', label: 'Tasks', icon: svg(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 12l2 2 4-4" /></>) },
  { key: 'anchor', label: 'Anchor a line', icon: svg(<><path d="M6 4h12v16l-6-4-6 4z" /></>) },
  { key: 'assistant', label: 'Writing Assistant', icon: svg(<><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" /></>) },
]

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
  const [flowView, setFlowView] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [openTool, setOpenTool] = useState<ToolKey | null>(null)
  const [chatExpanded, setChatExpanded] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<{ sectionId: string; content: string } | null>(null)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [newLineText, setNewLineText] = useState('')

  const dirtySectionsRef = useRef<Set<string>>(new Set())
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const ethosTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sectionsRef = useRef<Section[]>([])
  sectionsRef.current = sections
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const [resizeNonce, setResizeNonce] = useState(0)

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

  // Resize section textareas to fit only on real structural change (load, add,
  // delete, flow toggle, programmatic content change) — NOT on every render.
  // Resizing every textarea on every render was collapsing/re-expanding the
  // tall upper ones and letting scroll anchoring snap the view up to them.
  const resizeAll = useCallback(() => {
    Object.values(textareaRefs.current).forEach((el) => {
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    })
  }, [])

  const structureKey = sections.map((s) => s.id).join(',')
  useEffect(() => {
    resizeAll()
  }, [structureKey, flowView, resizeNonce, resizeAll])

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
    if (dirtySectionsRef.current.has(id)) await flushSections()
    const next = !target.is_locked
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, is_locked: next } : s)))
    if (pendingEdit?.sectionId === id) setPendingEdit(null)
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
    if (pendingEdit?.sectionId === id) setPendingEdit(null)
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

    const active = sections.find((s) => s.id === activeSectionId)
    const activeSectionPayload = active
      ? {
          id: active.id,
          label: active.label,
          intended_emotion: active.intended_emotion,
          content: active.content,
          is_locked: active.is_locked,
        }
      : null

    try {
      const res = await fetch('/api/write/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          piece_id: pieceId,
          conversation_history: priorHistory,
          active_section: activeSectionPayload,
        }),
      })
      if (!res.ok) return
      setChatMessages([...newMessages, { role: 'assistant', content: '' }])
      const { meta } = await readTextStream<{ proposedEdit?: { section_id: string; content: string } }>(
        res,
        (visibleText) => {
          setChatMessages([...newMessages, { role: 'assistant', content: visibleText }])
        },
        ['<proposed_edit>']
      )
      if (meta?.proposedEdit) {
        setPendingEdit({ sectionId: meta.proposedEdit.section_id, content: meta.proposedEdit.content })
      }
    } catch (err) {
      console.error('Failed to send chat message:', err)
    } finally {
      setIsChatLoading(false)
    }
  }

  const approvePendingEdit = async () => {
    if (!pendingEdit || !pieceId) return
    const { sectionId, content } = pendingEdit
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, content } : s)))
    setPendingEdit(null)
    setResizeNonce((n) => n + 1)
    try {
      await fetch('/api/write/sections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sectionId, piece_id: pieceId, content }),
      })
    } catch (err) {
      console.error('Failed to apply edit:', err)
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
  const activeSection = sections.find((s) => s.id === activeSectionId)
  const sectionLabelFor = (id: string | null) =>
    sections.find((s) => s.id === id)?.label || 'Unplaced'

  // The writing column reserves room on the right for whatever rail panel is
  // open, so text recenters in the space that's left rather than sitting under
  // the panel. Nothing open -> full width.
  const reservedRight = !openTool
    ? '0px'
    : openTool === 'assistant' && chatExpanded
      ? 'calc(38vw + 100px)'
      : '460px'

  return (
    <div className="h-screen bg-[#111110] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-12 border-b border-[#1f1f1d] flex items-center justify-between px-6 flex-shrink-0" style={{ background: '#111110' }}>
        <button
          onClick={async () => {
            await flushSections()
            router.push('/project-board')
          }}
          className="text-[#8c8a87] hover:text-[#e8e6e1] text-sm transition-colors"
        >
          ← Back
        </button>
        {sections.length > 0 && (
          <button
            onClick={() => setFlowView(!flowView)}
            className="text-[#8c8a87] hover:text-[#e8e6e1] text-sm transition-colors"
          >
            {flowView ? 'Section view' : 'Flow view'}
          </button>
        )}
      </div>

      {/* Writing surface */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: '#111110', paddingRight: reservedRight, transition: 'padding 0.3s ease' }}
      >
        <div className="max-w-[820px] mx-auto px-10 md:px-16 py-12">
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
              width: '100%', background: 'transparent', border: 'none', outline: 'none',
              resize: 'none', overflow: 'hidden', fontSize: '2rem', fontWeight: 700,
              color: '#e8e6e0', lineHeight: '1.3', marginBottom: '1.5rem', padding: 0,
            }}
          />

          {sections.length === 0 ? (
            <div className="mt-8 border border-[#1f1f1d] rounded-lg p-8 text-center space-y-4">
              <p className="text-sm text-[#8c8a87] leading-relaxed">
                Shape this piece into sections drawn from its emotional journey, or start with a blank
                section and build it yourself.
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
                const showPending = pendingEdit?.sectionId === section.id
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
                    {!flowView && (
                      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#1f1f1d]">
                        <input
                          value={section.label || ''}
                          onChange={(e) =>
                            setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, label: e.target.value } : s)))
                          }
                          onBlur={(e) => handleSectionFieldSave(section.id, 'label', e.target.value)}
                          placeholder="Untitled section"
                          className="bg-transparent text-xs font-medium text-[#e8e6e1] uppercase tracking-widest focus:outline-none flex-1 min-w-0"
                        />
                        {section.intended_emotion && (
                          <span className="text-xs text-[#6b6966] italic flex-shrink-0">{section.intended_emotion}</span>
                        )}
                        <button
                          onClick={() => setOpenLinesFor(openLinesFor === section.id ? null : section.id)}
                          className="text-xs text-[#6b6966] hover:text-[#d4d2cd] transition-colors flex-shrink-0"
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
                        textareaRefs.current[section.id] = el
                      }}
                      style={{
                        width: '100%', background: 'transparent', border: 'none', outline: 'none',
                        resize: 'none', overflow: 'hidden', fontSize: '1.125rem',
                        color: section.is_locked ? '#a8a6a0' : '#e8e6e0', lineHeight: '1.8',
                        padding: flowView ? '0 0 1.5rem 0' : '0.75rem 1rem 1rem 1rem',
                      }}
                    />

                    {/* Pending AI edit */}
                    {showPending && !flowView && (
                      <div className="mx-4 mb-4 rounded border border-[#10B981]/30 bg-[#0d1f17]/50 p-3 space-y-2">
                        <p className="text-xs text-[#6ee7b7] uppercase tracking-widest">Proposed rewrite</p>
                        <p className="text-sm text-[#d4d2cd] whitespace-pre-wrap leading-relaxed">{pendingEdit!.content}</p>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={approvePendingEdit}
                            className="px-3 py-1.5 bg-[#10B981]/20 text-[#6ee7b7] text-xs font-medium rounded hover:bg-[#10B981]/30 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setPendingEdit(null)}
                            className="px-3 py-1.5 bg-transparent border border-[#2e2d2a] text-[#8c8a87] text-xs font-medium rounded hover:border-[#4a4946] transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

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
                    router.push(`/write/test?piece_id=${pieceId}`)
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

      {/* Floating tool rail */}
      <div className="fixed right-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-2">
        {TOOL_META.map((tool) => (
          <div key={tool.key} className="group relative flex items-center justify-end">
            <span className="absolute right-12 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity bg-[#1f1f1d] text-[#d4d2cd] text-xs px-2 py-1 rounded pointer-events-none">
              {tool.label}
            </span>
            <button
              onClick={() => setOpenTool(openTool === tool.key ? null : tool.key)}
              className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors ${
                openTool === tool.key
                  ? 'bg-[#2e2d2a] border-[#4a4946] text-[#e8e6e1]'
                  : 'bg-[#161614] border-[#1f1f1d] text-[#8c8a87] hover:text-[#e8e6e1] hover:border-[#4a4946]'
              }`}
            >
              {tool.icon}
            </button>
          </div>
        ))}
      </div>

      {/* Floating tool panel */}
      {openTool && (
        <div
          className="fixed right-20 top-16 bottom-4 z-30 flex flex-col rounded-lg border border-[#1f1f1d] bg-[#141312] shadow-2xl overflow-hidden"
          style={{ width: openTool === 'assistant' && chatExpanded ? '38%' : '360px' }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f1f1d]">
            <span className="text-xs font-medium text-[#e8e6e1] uppercase tracking-widest">
              {TOOL_META.find((t) => t.key === openTool)?.label}
            </span>
            <div className="flex items-center gap-3">
              {openTool === 'assistant' && (
                <button
                  onClick={() => setChatExpanded(!chatExpanded)}
                  className="text-[#6b6966] hover:text-[#d4d2cd] text-sm transition-colors"
                  title={chatExpanded ? 'Shrink' : 'Maximize'}
                >
                  {chatExpanded ? '⤡' : '⤢'}
                </button>
              )}
              <button onClick={() => setOpenTool(null)} className="text-[#6b6966] hover:text-[#e8e6e1] text-sm">✕</button>
            </div>
          </div>

          {openTool === 'ethos' && (
            <div className="p-4 overflow-y-auto">
              <textarea
                value={writingEthos}
                onChange={(e) => saveEthos(e.target.value)}
                placeholder="What you want this piece to be — the bullets in your head, the point you're really making…"
                rows={8}
                className="w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] resize-none leading-relaxed"
              />
            </div>
          )}

          {openTool === 'core' && (
            <div className="p-4 overflow-y-auto space-y-3 text-xs">
              {piece.conviction_statement && (
                <div>
                  <p className="text-[#4a4946] uppercase tracking-widest mb-1">Conviction</p>
                  <p className="text-[#d4d2cd] text-sm leading-relaxed">{piece.conviction_statement}</p>
                </div>
              )}
              {piece.emotional_journey && (
                <div>
                  <p className="text-[#4a4946] uppercase tracking-widest mb-1">Emotional Journey</p>
                  <p className="text-[#d4d2cd] text-sm leading-relaxed">{piece.emotional_journey}</p>
                </div>
              )}
              {piece.core_truth && (
                <div>
                  <p className="text-[#4a4946] uppercase tracking-widest mb-1">Core Truth</p>
                  <p className="text-[#d4d2cd] text-sm leading-relaxed">{piece.core_truth}</p>
                </div>
              )}
              {piece.substack_goals && (
                <div>
                  <p className="text-[#4a4946] uppercase tracking-widest mb-1">Substack Goals</p>
                  <p className="text-[#d4d2cd] text-sm leading-relaxed">{piece.substack_goals}</p>
                </div>
              )}
            </div>
          )}

          {openTool === 'tasks' && (
            <div className="p-4 overflow-y-auto">
              {writingTasks.length === 0 ? (
                <p className="text-xs text-[#3d3c39]">No writing tasks yet.</p>
              ) : (
                <div className="divide-y divide-[#1f1f1d]">
                  {writingTasks.map((task) => (
                    <div key={task.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className={`flex-shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center ${task.status === 'complete' ? 'bg-green-900/20 border-green-700/50' : 'border-[#3d3c39]'}`}>
                        {task.status === 'complete' && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
                      </span>
                      <span className={`text-sm ${task.status === 'complete' ? 'text-[#4a4946] line-through' : 'text-[#d4d2cd]'}`}>{task.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {openTool === 'anchor' && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="p-4 border-b border-[#1f1f1d]">
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
                  className="w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946]"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {anchorLines.length === 0 ? (
                  <p className="text-xs text-[#3d3c39]">No anchor lines yet.</p>
                ) : (
                  anchorLines.map((l) => (
                    <div key={l.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-[#d4d2cd] italic">“{l.text}”</span>
                        <button onClick={() => deleteAnchorLine(l.id)} className="text-[#6b6966] hover:text-red-300 text-xs flex-shrink-0">✕</button>
                      </div>
                      <p className="text-xs text-[#4a4946]">{sectionLabelFor(l.section_id)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {openTool === 'assistant' && (
            <div className="flex flex-col flex-1 min-h-0">
              {activeSection && (
                <p className="px-4 py-2 text-xs text-[#6b6966] border-b border-[#1f1f1d]">
                  Focused on: <span className="text-[#8c8a87]">{activeSection.label || 'this section'}</span>
                  {activeSection.is_locked && ' (locked)'}
                </p>
              )}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 ? (
                  <p className="text-xs text-[#3d3c39]">
                    Debate the piece, unstick a section, ask for examples. Click into a section first and I&apos;ll
                    work on that one — approved rewrites land there for you to accept.
                  </p>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div key={i} className={`text-xs ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                      <div className={`inline-block max-w-[85%] px-3 py-2 rounded whitespace-pre-wrap ${msg.role === 'user' ? 'bg-[#2e2d2a] text-[#e8e6e1]' : 'bg-[#1f1f1d] text-[#d4d2cd]'}`}>
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
                  className="w-full bg-[#2e2d2a] border border-[#2e2d2a] rounded px-3 py-2 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946]"
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
      )}
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
