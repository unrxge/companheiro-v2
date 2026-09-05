'use client'

import { useState, useEffect, useLayoutEffect, useRef, Suspense, useCallback, type ReactNode } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { readTextStream } from '@/lib/stream-client'
import { shellBackground, cardPalette } from '@/lib/card-theme'

const c = cardPalette.dark

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
  one_sentence: string
  substack_draft: string
  conviction_statement: string
  emotional_journey: string
  core_truth: string
  substack_goals: string
  short_form_goals: string
  open_threads: string[]
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

interface SelectedText {
  text: string
  sectionId: string
}

type AssistantMode = 'write' | 'coach'

type ToolKey = 'core' | 'tasks' | 'anchor' | 'assistant'

const svg = (path: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    {path}
  </svg>
)

const TOOL_META: { key: ToolKey; label: string; icon: ReactNode }[] = [
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
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [openLinesFor, setOpenLinesFor] = useState<string | null>(null)
  const [flowView, setFlowView] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [openTool, setOpenTool] = useState<ToolKey | null>(null)
  const [chatExpanded, setChatExpanded] = useState(false)
  const [showCoreConceptModal, setShowCoreConceptModal] = useState(false)
  const [pendingEdit, setPendingEdit] = useState<{ sectionId: string; content: string } | null>(null)
  const [isIngesting, setIsIngesting] = useState(false)
  const [ingestType, setIngestType] = useState<'draft' | 'loose' | null>(null)
  const ingestCalledRef = useRef(false)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [newLineText, setNewLineText] = useState('')
  const [selectedText, setSelectedText] = useState<SelectedText | null>(null)
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('write')

  const dirtySectionsRef = useRef<Set<string>>(new Set())
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null)
  const sectionsRef = useRef<Section[]>([])
  sectionsRef.current = sections
  const chatMessagesRef = useRef<ChatMessage[]>([])
  chatMessagesRef.current = chatMessages
  const distilledUpToRef = useRef(0)
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const [resizeNonce, setResizeNonce] = useState(0)

  useEffect(() => {
    if (!pieceId) {
      router.push('/project-board')
      return
    }
    distilledUpToRef.current = 0
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
    } catch (err) {
      console.error('Failed to load writing studio:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-ingest: when the piece has a substack_draft and no sections yet,
  // immediately discern and distribute (full draft) or anchor-line (loose text).
  const ingestDraft = useCallback(async () => {
    if (!pieceId || isIngesting) return
    setIsIngesting(true)
    try {
      const res = await fetch('/api/write/sections/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId }),
      })
      const data = await res.json()
      if (data.sections) setSections(data.sections)
      if (data.anchorLines) setAnchorLines((prev) => [...prev, ...data.anchorLines])
      if (data.type) setIngestType(data.type)
    } catch (err) {
      console.error('Failed to ingest draft:', err)
    } finally {
      setIsIngesting(false)
    }
  }, [pieceId, isIngesting])

  useEffect(() => {
    if (!piece || sections.length > 0 || !piece.substack_draft?.trim()) return
    if (ingestCalledRef.current) return
    ingestCalledRef.current = true
    ingestDraft()
  // sections.length is the key dependency — once sections arrive, this stops firing
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece?.id, sections.length])

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

  // Feeds the writing-chat transcript to the Living Portrait as it happens —
  // never gated by section lock or draft completion, since the excavation
  // that matters can happen in a section that's never finished or locked.
  // Fires periodically during a long session, and on any way the session
  // ends, so nothing depends on the writer reaching a "done" state.
  const WRITE_DISTILL_BATCH = 8
  const flushChatDistillation = useCallback((allMessages: ChatMessage[], force = false) => {
    const pending = allMessages.slice(distilledUpToRef.current)
    if (pending.length === 0) return
    if (!force && pending.length < WRITE_DISTILL_BATCH) return
    distilledUpToRef.current = allMessages.length
    fetch('/api/write/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: pending }),
      keepalive: true,
    }).catch((err) => console.error('Failed to distill writing chat:', err))
  }, [])

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        flushSections()
        flushChatDistillation(chatMessagesRef.current, true)
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      flushChatDistillation(chatMessagesRef.current, true)
    }
  }, [flushSections, flushChatDistillation])

  // Resize section textareas to fit only on real structural/geometry change
  // (load, add, delete, flow toggle, panel open/resize, pending-edit
  // arrival, programmatic content change) — NOT on every render. Resizing
  // every textarea on every render was collapsing/re-expanding the tall
  // upper ones and letting scroll anchoring snap the view up to them.
  //
  // This runs in useLayoutEffect, not useEffect, so it recomputes heights
  // synchronously before the browser paints. useEffect fires after paint,
  // which left a visible frame where the DOM already had the new layout
  // (padding, borders, column width from openTool/chatExpanded changing
  // reservedRight) but textareas still carried stale cached heights from
  // before — the "misplaced text" flash on view/panel switches.
  const resizeAll = useCallback(() => {
    Object.values(textareaRefs.current).forEach((el) => {
      if (!el) return
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    })
  }, [])

  const structureKey = sections.map((s) => s.id).join(',')
  useLayoutEffect(() => {
    resizeAll()
  }, [structureKey, flowView, resizeNonce, openTool, chatExpanded, pendingEdit, resizeAll])

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

  const [isDividing, setIsDividing] = useState(false)
  const handleDivide = async () => {
    if (isDividing) return
    await flushSections()
    setIsDividing(true)
    try {
      const res = await fetch('/api/write/sections/divide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId }),
      })
      const data = await res.json()
      if (data.sections) {
        setSections(data.sections)
        setSuggestions({})
        // Divide replaces sections, so anchor placements reset to unplaced.
        setAnchorLines((prev) => prev.map((l) => ({ ...l, section_id: null })))
        setResizeNonce((n) => n + 1)
        // Show the sectional result — if the user was in flow view, switch so
        // they can see how the prose landed in each beat.
        setFlowView(false)
      }
    } catch (err) {
      console.error('Failed to divide:', err)
    } finally {
      setIsDividing(false)
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

  const handleChatSend = async () => {
    if (!chatInput.trim() || !pieceId || isChatLoading) return
    const userMessage = chatInput
    setChatInput('')
    if (chatInputRef.current) chatInputRef.current.style.height = 'auto'
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
          anchor_lines: anchorLines.filter((l) => l.section_id === active.id).map((l) => l.text),
        }
      : null
    const precedingSections = active
      ? sections
          .filter((s) => s.position < active.position)
          .sort((a, b) => a.position - b.position)
          .map((s) => ({
            label: s.label,
            content: s.content,
            anchor_lines: anchorLines.filter((l) => l.section_id === s.id).map((l) => l.text),
          }))
      : []

    const selectionPayload = selectedText?.sectionId === activeSectionId ? selectedText.text : null

    try {
      const res = await fetch('/api/write/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          piece_id: pieceId,
          conversation_history: priorHistory,
          active_section: activeSectionPayload,
          preceding_sections: precedingSections,
          selected_text: selectionPayload,
          assistant_mode: assistantMode,
        }),
      })
      if (!res.ok) return
      setChatMessages([...newMessages, { role: 'assistant', content: '' }])
      const { text, meta } = await readTextStream<{ proposedEdit?: { section_id: string; content: string } }>(
        res,
        (visibleText) => {
          setChatMessages([...newMessages, { role: 'assistant', content: visibleText }])
        },
        ['<proposed_edit>']
      )
      if (meta?.proposedEdit) {
        setPendingEdit({ sectionId: meta.proposedEdit.section_id, content: meta.proposedEdit.content })
      }
      if (text) {
        flushChatDistillation([...newMessages, { role: 'assistant', content: text }])
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
      <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
  const anyLocked = sections.some((s) => s.is_locked)
  const canDivide = sections.length > 0 && wordCount > 30 && !anyLocked
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
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: shellBackground }}>
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-6 flex-shrink-0" style={{ background: 'rgba(15,14,13,0.95)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${c.divider}` }}>
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
          {canDivide && (
            <button
              onClick={handleDivide}
              disabled={isDividing}
              className="text-[#8c8a87] hover:text-[#e8e6e1] text-sm transition-colors disabled:opacity-50"
              title="Split what you've written into the intended sections"
            >
              {isDividing ? (flowView ? 'Redistributing…' : 'Dividing…') : (flowView ? 'Redistribute into sections' : 'Divide into sections')}
            </button>
          )}
          {sections.length > 0 && (
            <button
              onClick={() => setFlowView(!flowView)}
              className="text-[#8c8a87] hover:text-[#e8e6e1] text-sm transition-colors"
            >
              {flowView ? 'Section view' : 'Flow view'}
            </button>
          )}
        </div>
      </div>

      {/* Writing surface */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: 'transparent', paddingRight: reservedRight, transition: 'padding 0.3s ease' }}
      >
        <div className="max-w-[900px] mx-auto px-6 md:px-10 py-12">
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

          {ingestType && sections.length > 0 && (
            <div className="mb-6 flex items-center justify-between text-xs text-[#4a4946] border border-[#1f1f1d] rounded px-3 py-2">
              <span>
                {ingestType === 'draft'
                  ? 'Your draft has been distributed across the sections drawn from your emotional journey.'
                  : 'Your notes have been saved as anchor lines, placed into the sections that suit them.'}
              </span>
              <button onClick={() => setIngestType(null)} className="ml-3 text-[#3d3c39] hover:text-[#8c8a87] flex-shrink-0">✕</button>
            </div>
          )}

          {sections.length === 0 ? (
            <div className="mt-8 border border-[#1f1f1d] rounded-lg p-8 text-center space-y-4">
              {isIngesting ? (
                <div className="space-y-2">
                  <p className="text-base text-[#8c8a87] leading-relaxed">Reading your draft…</p>
                  <p className="text-xs text-[#4a4946]">Shaping sections from your emotional journey</p>
                </div>
              ) : (
                <>
                  <p className="text-base text-[#8c8a87] leading-relaxed">
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
                    <button
                      onClick={() => addSection('')}
                      className="py-2 bg-transparent border border-[#2e2d2a] text-[#8c8a87] text-xs font-medium rounded hover:border-[#4a4946] hover:text-[#d4d2cd] transition-colors"
                    >
                      Start with a blank section
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className={flowView ? 'space-y-0' : 'space-y-4'}>
              {!flowView && unplacedLines.length > 0 && (
                <div className="border border-dashed border-[#2e2d2a] rounded p-3 space-y-1">
                  <p className="text-xs text-[#4a4946] uppercase tracking-widest mb-1">Unplaced lines</p>
                  {unplacedLines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2">
                      <span className="text-base text-[#d4d2cd] italic">“{l.text}”</span>
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
                              <span className="text-base text-[#d4d2cd] italic">“{l.text}”</span>
                              <button onClick={() => deleteAnchorLine(l.id)} className="text-[#6b6966] hover:text-red-300 text-xs">✕</button>
                            </div>
                          ))
                        )}
                        <textarea
                          placeholder="Add a line to this section…"
                          rows={2}
                          className="w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded px-2 py-1 text-base text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] resize-none overflow-hidden"
                          onInput={(e) => {
                            const el = e.currentTarget
                            el.style.height = 'auto'
                            el.style.height = el.scrollHeight + 'px'
                          }}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && e.currentTarget.value.trim()) {
                              addAnchorLine(e.currentTarget.value, section.id)
                              e.currentTarget.value = ''
                              e.currentTarget.style.height = 'auto'
                            }
                          }}
                        />
                        <p className="text-xs text-[#3d3c39]">⌘↵ to add</p>
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
                      onSelect={(e) => {
                        const el = e.target as HTMLTextAreaElement
                        const sel = el.value.substring(el.selectionStart, el.selectionEnd).trim()
                        if (sel.length > 0) {
                          setSelectedText({ text: sel, sectionId: section.id })
                        } else {
                          setSelectedText(null)
                        }
                      }}
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
                        <p className="text-base text-[#d4d2cd] whitespace-pre-wrap leading-relaxed">{pendingEdit!.content}</p>
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
                    router.push(`/write/reimagine?piece_id=${pieceId}`)
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
            <span
              className="absolute right-12 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded pointer-events-none"
              style={{ background: c.cardBg, color: c.textSecondary, border: `1px solid ${c.divider}`, boxShadow: c.shadow }}
            >
              {tool.label}
            </span>
            <button
              onClick={() => setOpenTool(openTool === tool.key ? null : tool.key)}
              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
              style={{
                border: `1px solid ${openTool === tool.key ? c.textMuted : c.divider}`,
                background: openTool === tool.key ? c.cardBg : c.containerBg,
                color: openTool === tool.key ? c.textPrimary : c.textMuted,
                boxShadow: openTool === tool.key ? c.shadow : 'none',
              }}
            >
              {tool.icon}
            </button>
          </div>
        ))}
      </div>

      {/* Floating tool panel */}
      {openTool && (
        <div
          className="fixed right-20 top-16 bottom-4 z-30 flex flex-col overflow-hidden"
          style={{
            width: openTool === 'assistant' && chatExpanded ? '38%' : '360px',
            background: c.containerBg,
            border: `1px solid ${c.divider}`,
            borderRadius: 20,
            boxShadow: c.containerShadow,
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: `1px solid ${c.divider}` }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: c.textMuted, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {TOOL_META.find((t) => t.key === openTool)?.label}
            </span>
            <div className="flex items-center gap-3">
              {openTool === 'core' && (
                <button
                  onClick={() => setShowCoreConceptModal(true)}
                  style={{ color: c.textMuted, background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = c.textPrimary }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = c.textMuted }}
                  title="View full core concept"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </button>
              )}
              {openTool === 'assistant' && (
                <button
                  onClick={() => setChatExpanded(!chatExpanded)}
                  style={{ color: c.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = c.textPrimary }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = c.textMuted }}
                  title={chatExpanded ? 'Shrink' : 'Maximize'}
                >
                  {chatExpanded ? '⤡' : '⤢'}
                </button>
              )}
              <button
                onClick={() => setOpenTool(null)}
                style={{ color: c.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = c.textPrimary }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = c.textMuted }}
              >✕</button>
            </div>
          </div>

          {openTool === 'core' && (
            <div className="p-4 overflow-y-auto" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {piece.one_sentence && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: c.textMuted, margin: '0 0 8px' }}>Idea in one sentence</p>
                  <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.25, color: c.textPrimary, margin: 0 }}>{piece.one_sentence}</p>
                </div>
              )}
              {piece.conviction_statement && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: c.textMuted, margin: '0 0 8px' }}>Conviction</p>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
                    <div style={{ width: 3, borderRadius: 2, background: 'rgba(165,63,43,0.4)', flexShrink: 0 }} />
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: c.textSecondary, margin: 0 }}>{piece.conviction_statement}</p>
                  </div>
                </div>
              )}
              {piece.emotional_journey && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: c.textMuted, margin: '0 0 8px' }}>Emotional Journey</p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: c.textSecondary, margin: 0, whiteSpace: 'pre-line' }}>{piece.emotional_journey}</p>
                </div>
              )}
              {piece.core_truth && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: c.textMuted, margin: '0 0 8px' }}>Core Truth</p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: c.textPrimary, margin: 0, fontWeight: 500 }}>{piece.core_truth}</p>
                </div>
              )}
              {piece.substack_goals && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: c.textMuted, margin: '0 0 8px' }}>Writing Suggestions</p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: c.textSecondary, margin: 0, whiteSpace: 'pre-line' }}>{piece.substack_goals}</p>
                </div>
              )}
            </div>
          )}

          {openTool === 'tasks' && (
            <div className="p-4 overflow-y-auto">
              {writingTasks.length === 0 ? (
                <p style={{ fontSize: 13, color: c.textMuted }}>No writing tasks yet.</p>
              ) : (
                <div>
                  {writingTasks.map((task, i) => (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 0',
                        borderBottom: i < writingTasks.length - 1 ? `1px solid ${c.divider}` : 'none',
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0, width: 14, height: 14, borderRadius: '50%',
                          border: task.status === 'complete' ? '1px solid rgba(16,185,129,0.4)' : `1px solid ${c.textMuted}`,
                          background: task.status === 'complete' ? 'rgba(16,185,129,0.12)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {task.status === 'complete' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'block' }} />}
                      </span>
                      <span style={{ fontSize: 14, color: task.status === 'complete' ? c.textMuted : c.textSecondary, textDecoration: task.status === 'complete' ? 'line-through' : 'none' }}>
                        {task.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {openTool === 'anchor' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ padding: 16, borderBottom: `1px solid ${c.divider}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                  value={newLineText}
                  onChange={(e) => {
                    setNewLineText(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = e.target.scrollHeight + 'px'
                  }}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && newLineText.trim()) {
                      addAnchorLine(newLineText)
                      setNewLineText('')
                      e.currentTarget.style.height = 'auto'
                    }
                  }}
                  placeholder="A line dear to you - we'll place it..."
                  rows={3}
                  style={{
                    width: '100%', background: c.inputBg, border: `1px solid ${c.inputBorder}`,
                    borderRadius: 10, padding: '10px 12px', fontSize: 14, color: c.textPrimary,
                    outline: 'none', resize: 'none', overflow: 'hidden', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: 11, color: c.textMuted, margin: 0 }}>⌘↵ to add</p>
                  {newLineText.trim() && (
                    <button
                      onClick={() => { addAnchorLine(newLineText); setNewLineText('') }}
                      style={{ fontSize: 12, color: c.textSecondary, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {anchorLines.length === 0 ? (
                  <p style={{ fontSize: 13, color: c.textMuted }}>No anchor lines yet.</p>
                ) : (
                  anchorLines.map((l) => (
                    <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 14, color: c.textSecondary, fontStyle: 'italic', lineHeight: 1.5 }}>&ldquo;{l.text}&rdquo;</span>
                        <button
                          onClick={() => deleteAnchorLine(l.id)}
                          style={{ fontSize: 12, color: c.textMuted, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = c.textMuted }}
                        >✕</button>
                      </div>
                      <p style={{ fontSize: 11, color: c.textMuted, margin: 0 }}>{sectionLabelFor(l.section_id)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {openTool === 'assistant' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {/* Context strip: selection or focused section */}
              {selectedText && sections.find(s => s.id === selectedText.sectionId) && (
                <div style={{ padding: '8px 16px', borderBottom: `1px solid ${c.divider}`, background: c.inputBg, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: '#10B981', fontSize: 12, flexShrink: 0, marginTop: 2 }}>↳</span>
                  <p style={{ fontSize: 12, color: c.textSecondary, fontStyle: 'italic', flex: 1, lineHeight: 1.5, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    &ldquo;{selectedText.text}&rdquo;
                  </p>
                  <button
                    onClick={() => setSelectedText(null)}
                    style={{ fontSize: 11, color: c.textMuted, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                  >✕</button>
                </div>
              )}
              {!selectedText && activeSection && (
                <p style={{ padding: '8px 16px', fontSize: 12, color: c.textMuted, borderBottom: `1px solid ${c.divider}`, margin: 0 }}>
                  Focused on: <span style={{ color: c.textSecondary }}>{activeSection.label || 'this section'}</span>
                  {activeSection.is_locked && ' (locked)'}
                </p>
              )}

              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {chatMessages.length === 0 ? (
                  <p style={{ fontSize: 14, color: c.textMuted, lineHeight: 1.6, margin: 0 }}>
                    {assistantMode === 'write'
                      ? "Click into a section, then ask me to write or rewrite. Select a specific sentence first and I'll focus there — approved rewrites land in the section for you to accept."
                      : "I won't write for you here — instead I'll ask questions and reflect things back until the words come from you. Select a sentence to discuss it specifically, or ask about the piece as a whole."}
                  </p>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div key={i} style={{ textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                      <div style={{
                        display: 'inline-block', maxWidth: '85%', padding: '10px 14px',
                        borderRadius: 12, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55,
                        background: msg.role === 'user' ? c.cardBg : c.inputBg,
                        color: msg.role === 'user' ? c.textPrimary : c.textSecondary,
                        boxShadow: msg.role === 'user' ? c.shadow : 'none',
                      }}>
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && <p style={{ fontSize: 12, color: c.textMuted }}>Thinking…</p>}
              </div>
              <div style={{ borderTop: `1px solid ${c.divider}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => {
                    setChatInput(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = `${e.target.scrollHeight}px`
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !isChatLoading) {
                      e.preventDefault()
                      handleChatSend()
                    }
                  }}
                  placeholder={assistantMode === 'coach' ? 'What are you trying to say here?' : 'Ask something…'}
                  rows={1}
                  style={{
                    width: '100%', background: c.inputBg, border: `1px solid ${c.inputBorder}`,
                    borderRadius: 10, padding: '10px 12px', fontSize: 14, color: c.textPrimary,
                    outline: 'none', resize: 'none', overflow: 'hidden', maxHeight: 200,
                    fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={handleChatSend}
                    disabled={!chatInput.trim() || isChatLoading}
                    style={{
                      flex: 1, padding: '10px', background: c.cardBg, color: c.textPrimary,
                      fontSize: 13, fontWeight: 600, borderRadius: 10, border: `1px solid ${c.divider}`,
                      cursor: !chatInput.trim() || isChatLoading ? 'not-allowed' : 'pointer',
                      opacity: !chatInput.trim() || isChatLoading ? 0.4 : 1,
                    }}
                  >
                    Send
                  </button>
                </div>
                {/* Mode pill toggle */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center',
                    background: 'rgba(255,255,255,0.04)', borderRadius: 20,
                    padding: '2px 3px', gap: 1,
                  }}>
                    {(['coach', 'write'] as AssistantMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setAssistantMode(mode)}
                        style={{
                          padding: '3px 10px', fontSize: 11, fontWeight: 500,
                          borderRadius: 16, border: 'none', cursor: 'pointer',
                          transition: 'all 0.15s',
                          background: assistantMode === mode ? 'rgba(232,230,224,0.12)' : 'transparent',
                          color: assistantMode === mode ? '#d4d2cd' : '#4a4946',
                        }}
                      >
                        {mode === 'coach' ? 'suggest' : 'write'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Core Concept full-view modal */}
      {showCoreConceptModal && piece && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.72)', padding: '24px' }}
          onClick={() => setShowCoreConceptModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: c.containerBg,
              border: `1px solid ${c.divider}`,
              borderRadius: 20,
              width: '100%',
              maxWidth: '640px',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: c.containerShadow,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                position: 'sticky', top: 0,
                background: c.containerBg,
                borderBottom: `1px solid ${c.divider}`,
                padding: '16px 20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderRadius: '20px 20px 0 0',
              }}
            >
              <h2 style={{ fontSize: 15, fontWeight: 700, color: c.textPrimary, letterSpacing: '-0.02em', margin: 0 }}>
                {piece.title}
              </h2>
              <button
                onClick={() => setShowCoreConceptModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.textMuted, padding: '4px', display: 'flex', alignItems: 'center' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = c.textPrimary }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = c.textMuted }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
              {piece.one_sentence && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: c.textMuted, margin: '0 0 8px' }}>Idea in one sentence</p>
                  <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.25, color: c.textPrimary, margin: 0 }}>{piece.one_sentence}</p>
                </div>
              )}
              {piece.conviction_statement && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: c.textMuted, margin: '0 0 8px' }}>Conviction</p>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
                    <div style={{ width: 3, borderRadius: 2, background: 'rgba(165,63,43,0.4)', flexShrink: 0 }} />
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: c.textSecondary, margin: 0 }}>{piece.conviction_statement}</p>
                  </div>
                </div>
              )}
              {piece.emotional_journey && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: c.textMuted, margin: '0 0 8px' }}>Emotional Journey</p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: c.textSecondary, margin: 0, whiteSpace: 'pre-line' }}>{piece.emotional_journey}</p>
                </div>
              )}
              {piece.core_truth && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: c.textMuted, margin: '0 0 8px' }}>Core Truth</p>
                  <p style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.55, letterSpacing: '-0.01em', color: c.textPrimary, margin: 0 }}>{piece.core_truth}</p>
                </div>
              )}
              {piece.substack_goals && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: c.textMuted, margin: '0 0 8px' }}>Writing Suggestions</p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: c.textSecondary, margin: 0, whiteSpace: 'pre-line' }}>{piece.substack_goals}</p>
                </div>
              )}
              {piece.short_form_goals && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: c.textMuted, margin: '0 0 8px' }}>Visuals Suggestions</p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: c.textSecondary, margin: 0, whiteSpace: 'pre-line' }}>{piece.short_form_goals}</p>
                </div>
              )}
              {piece.open_threads && piece.open_threads.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: c.textMuted, margin: '0 0 10px' }}>Open Threads</p>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {piece.open_threads.map((thread, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', gap: 10, fontSize: 14, color: c.textSecondary, lineHeight: 1.55, padding: '8px 0' }}>
                          <span style={{ color: c.textMuted, flexShrink: 0, fontWeight: 300 }}>—</span>
                          <span>{thread}</span>
                        </div>
                        {i < piece.open_threads.length - 1 && <div style={{ height: 1, background: c.divider }} />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function WritePage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p className="text-[#4a4946]">Loading...</p>
        </div>
      }
    >
      <WriteContent />
    </Suspense>
  )
}
