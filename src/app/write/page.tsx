'use client'

import { useState, useEffect, useRef, Suspense, useCallback, type ReactNode } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { Editor } from '@tiptap/react'
import { readTextStream } from '@/lib/stream-client'
import { useTheme } from '@/components/theme/theme-provider'
import { shell, journeyStepFromStage } from '@/lib/design-tokens'
import { ensureHtml, ensureSectionsHtml, htmlToPlainText, plainTextToHtml } from '@/lib/rich-text'
import { JourneyNav } from '@/components/widgets'
import { IconButton } from '@/components/ui/icon-button'
import { TextField } from '@/components/ui/field'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { PrimaryButton, QuietButton, GhostButton } from '@/components/ui/buttons'
import { Thread, Composer } from '@/components/conversation/thread'
import { SectionEditor } from '@/components/writing/section-editor'

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
  stage?: string
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
  from: number
  to: number
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

/** A scroll-snap "wheel" column — one number per row, the centered one is
 * selected. Used by the assistant write-lock duration picker. */
function WheelColumn({
  value,
  onChange,
  options,
  format,
}: {
  value: number
  onChange: (v: number) => void
  options: number[]
  format?: (v: number) => string
}) {
  const { t } = useTheme()
  const itemHeight = 36
  const visibleCount = 5
  const containerHeight = itemHeight * visibleCount
  const padding = itemHeight * Math.floor(visibleCount / 2)
  const ref = useRef<HTMLDivElement>(null)
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const idx = options.indexOf(value)
    if (idx === -1) return
    el.scrollTop = idx * itemHeight
    // Only ever snap to the initial value on mount — after that, scrolling
    // itself is what drives value changes, so re-running this would fight
    // the user's own scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleScroll = () => {
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current)
    scrollTimeout.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const idx = Math.round(el.scrollTop / itemHeight)
      const clamped = Math.max(0, Math.min(options.length - 1, idx))
      const next = options[clamped]
      if (next !== value) onChange(next)
    }, 120)
  }

  // Clicking a row (instead of scrolling to it) — center that row and commit
  // the value immediately rather than waiting on the scroll settle/debounce.
  const selectIndex = (idx: number) => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ top: idx * itemHeight, behavior: 'smooth' })
    onChange(options[idx])
  }

  return (
    <div style={{ position: 'relative', width: 68 }}>
      <div
        ref={ref}
        onScroll={handleScroll}
        style={{
          height: containerHeight,
          overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
          borderRadius: 10,
          background: t.inputBg,
          border: `1px solid ${t.inputBorder}`,
        }}
      >
        <div style={{ height: padding }} />
        {options.map((opt, idx) => (
          <div
            key={opt}
            onClick={() => selectIndex(idx)}
            style={{
              height: itemHeight,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              scrollSnapAlign: 'center',
              cursor: 'pointer',
              fontSize: opt === value ? 18 : 15,
              fontWeight: opt === value ? 700 : 400,
              color: opt === value ? t.textPrimary : t.textMuted,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {format ? format(opt) : String(opt).padStart(2, '0')}
          </div>
        ))}
        <div style={{ height: padding }} />
      </div>
      <div
        style={{
          position: 'absolute', top: padding, left: 0, right: 0, height: itemHeight,
          borderTop: `1px solid ${t.divider}`, borderBottom: `1px solid ${t.divider}`,
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}

function WriteContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pieceId = searchParams.get('piece_id')
  const { t } = useTheme()

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
  const [pendingEdit, setPendingEdit] = useState<{
    sectionId: string
    content: string
    anchorText: string | null
    range: { from: number; to: number } | null
  } | null>(null)
  const [pendingEditTop, setPendingEditTop] = useState<number | null>(null)
  const [isIngesting, setIsIngesting] = useState(false)
  const [ingestType, setIngestType] = useState<'draft' | 'loose' | null>(null)
  const ingestCalledRef = useRef(false)

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [newLineText, setNewLineText] = useState('')
  const [selectedText, setSelectedText] = useState<SelectedText | null>(null)
  // New sessions always start in suggest (coach) mode, regardless of what a
  // past session left the toggle on — this state is never persisted.
  const [assistantMode, setAssistantMode] = useState<AssistantMode>('coach')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [isAddingTask, setIsAddingTask] = useState(false)

  const [lockedUntil, setLockedUntil] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  const [showLockModal, setShowLockModal] = useState(false)
  const [lockHours, setLockHours] = useState(0)
  const [lockMinutes, setLockMinutes] = useState(30)
  const [isLocking, setIsLocking] = useState(false)
  const isAssistantLocked = !!lockedUntil && new Date(lockedUntil).getTime() > nowTick

  const dirtySectionsRef = useRef<Set<string>>(new Set())
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const titleTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sectionsRef = useRef<Section[]>([])
  sectionsRef.current = sections
  const chatMessagesRef = useRef<ChatMessage[]>([])
  chatMessagesRef.current = chatMessages
  const distilledUpToRef = useRef(0)
  // Live Tiptap Editor instances per section, for imperative operations
  // (splicing an approved AI edit into an exact position range) and for
  // measuring where a highlighted passage sits on screen.
  const sectionEditorsRef = useRef<Record<string, Editor | null>>({})
  const sectionContainerRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [viewport, setViewport] = useState({ isMobile: false, isPortrait: true })

  useEffect(() => {
    if (!pieceId) {
      router.push('/project-board')
      return
    }
    distilledUpToRef.current = 0
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId])

  // Write-lock status, independent of piece — it's a per-user setting. If
  // it's already active on load, the toggle opens in suggest mode regardless
  // of the (already-defaulted-to-suggest) initial state.
  useEffect(() => {
    fetch('/api/write/assistant-lock')
      .then((res) => res.json())
      .then((data) => {
        if (data.lockedUntil) {
          setLockedUntil(data.lockedUntil)
          setAssistantMode('coach')
        }
      })
      .catch((err) => console.error('Failed to load assistant lock status:', err))
  }, [])

  // Ticks so isAssistantLocked flips back to false the moment a lock expires,
  // without needing a page reload.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

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
      setSections(ensureSectionsHtml(sectionsData.sections || []))
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
      if (data.sections) setSections(ensureSectionsHtml(data.sections))
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

  // Rich section editors grow with their own content natively (no manual
  // height math needed — that entire class of textarea-resize bugs goes
  // away with them). Positioning a proposal near a highlighted passage now
  // uses the editor's own layout via coordsAtPos, which is exact — no mirror
  // measurement required.
  useEffect(() => {
    if (!pendingEdit?.range) {
      setPendingEditTop(null)
      return
    }
    const editor = sectionEditorsRef.current[pendingEdit.sectionId]
    if (!editor) {
      setPendingEditTop(null)
      return
    }
    try {
      const rect = editor.view.coordsAtPos(pendingEdit.range.to)
      const wrapperRect = editor.view.dom.getBoundingClientRect()
      setPendingEditTop(rect.bottom - wrapperRect.top)
    } catch {
      setPendingEditTop(null)
    }
  }, [pendingEdit])

  // Mobile viewport + orientation tracking.
  useEffect(() => {
    const update = () => {
      setViewport({
        isMobile: window.innerWidth < 768,
        isPortrait: window.innerHeight >= window.innerWidth,
      })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  // On mobile portrait, the assistant panel covers the bottom half of the
  // screen as a bottom sheet — scroll the section being written into the
  // visible top half so the writer can still see their cursor. In landscape
  // (and on desktop) the panel sits beside the text instead, so this isn't
  // needed there.
  useEffect(() => {
    if (!viewport.isMobile || !viewport.isPortrait || !openTool || !activeSectionId) return
    sectionContainerRefs.current[activeSectionId]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [openTool, viewport.isMobile, viewport.isPortrait, activeSectionId])

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
    if (pendingEdit?.sectionId === id) { setPendingEdit(null); setPendingEditTop(null) }
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
      if (data.section) setSections((prev) => [...prev, { ...data.section, content: ensureHtml(data.section.content) }])
    } catch (err) {
      console.error('Failed to add section:', err)
    }
  }

  const deleteSection = async (id: string) => {
    setSections((prev) => prev.filter((s) => s.id !== id))
    setAnchorLines((prev) => prev.filter((l) => l.section_id !== id))
    if (pendingEdit?.sectionId === id) { setPendingEdit(null); setPendingEditTop(null) }
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
        setSections(ensureSectionsHtml(data.sections))
        setSuggestions({})
        // Divide replaces sections, so anchor placements reset to unplaced.
        setAnchorLines((prev) => prev.map((l) => ({ ...l, section_id: null })))
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
        setSections(ensureSectionsHtml(data.sections))
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
    const priorHistory = chatMessages
    const newMessages = [...chatMessages, { role: 'user' as const, content: userMessage }]
    setChatMessages(newMessages)
    setIsChatLoading(true)

    const active = sections.find((s) => s.id === activeSectionId)
    // The model only ever sees plain prose — HTML markup would just be noise
    // in its context and risks it echoing tags back in its own reply.
    const activeSectionPayload = active
      ? {
          id: active.id,
          label: active.label,
          intended_emotion: active.intended_emotion,
          content: htmlToPlainText(active.content),
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
            content: htmlToPlainText(s.content),
            anchor_lines: anchorLines.filter((l) => l.section_id === s.id).map((l) => l.text),
          }))
      : []

    const activeSelection = selectedText?.sectionId === activeSectionId ? selectedText : null
    const selectionPayload = activeSelection?.text || null

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
      const { text, meta } = await readTextStream<{
        proposedEdit?: { section_id: string; content: string; anchor_text: string | null }
        lockedMode?: 'coach' | null
      }>(
        res,
        (visibleText) => {
          setChatMessages([...newMessages, { role: 'assistant', content: visibleText }])
        },
        ['<proposed_edit>']
      )
      // The write-lock is enforced server-side regardless of what this client
      // sent — if the server says locked, reflect that back into the toggle
      // rather than trusting local state, in case it drifted (e.g. a lock
      // started in another tab).
      if (meta?.lockedMode === 'coach' && assistantMode !== 'coach') {
        setAssistantMode('coach')
      }
      if (meta?.proposedEdit) {
        setPendingEdit({
          sectionId: meta.proposedEdit.section_id,
          content: meta.proposedEdit.content,
          anchorText: meta.proposedEdit.anchor_text,
          // Captured locally at send time — Tiptap positions are specific to
          // this client's live document, so the server never needs to know
          // them; it only needed the anchor text for its own prompt.
          range: activeSelection ? { from: activeSelection.from, to: activeSelection.to } : null,
        })
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
    const { sectionId, content, anchorText, range } = pendingEdit
    const editor = sectionEditorsRef.current[sectionId]
    if (!editor) return

    let nextHtml: string
    if (range) {
      const currentText = editor.state.doc.textBetween(range.from, range.to, ' ').trim()
      if (anchorText && currentText !== anchorText.trim()) {
        // The section changed since the proposal arrived and the highlighted
        // passage no longer matches — refuse to guess where a fragment-only
        // edit belongs rather than risk corrupting the section.
        console.error('Highlighted passage changed since the proposal arrived; declining to apply partial edit')
        return
      }
      // The model's reply is plain prose, not markup — inserted as plain
      // text it replaces exactly the highlighted range, nothing else.
      editor.chain().focus().insertContentAt(range, content).run()
      nextHtml = editor.getHTML()
    } else {
      // Whole-section rewrite: the model's prose becomes proper paragraph
      // nodes rather than one literal blob of text with embedded newlines.
      editor.chain().focus().setContent(plainTextToHtml(content), false).run()
      nextHtml = editor.getHTML()
    }

    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, content: nextHtml } : s)))
    setPendingEdit(null)
    setPendingEditTop(null)
    try {
      await fetch('/api/write/sections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sectionId, piece_id: pieceId, content: nextHtml }),
      })
    } catch (err) {
      console.error('Failed to apply edit:', err)
    }
  }

  // Optimistic toggle, persisted via the same tasks endpoint the project
  // board uses — status sticks across sessions since it lives on the row.
  const handleToggleTask = async (taskId: string, currentStatus: 'pending' | 'complete') => {
    if (!piece) return
    const nextStatus = currentStatus === 'complete' ? 'pending' : 'complete'
    setPiece({
      ...piece,
      tasks: piece.tasks.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)),
    })
    try {
      await fetch('/api/project-board/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, status: nextStatus }),
      })
    } catch (err) {
      console.error('Failed to toggle task:', err)
    }
  }

  // Creates via the same endpoint the project board uses, then refetches the
  // piece for the real row id (needed for later toggles) rather than faking one.
  const addTask = async () => {
    const title = newTaskTitle.trim()
    if (!title || !pieceId || isAddingTask) return
    setIsAddingTask(true)
    try {
      await fetch('/api/project-board/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId, title, type: 'creation' }),
      })
      setNewTaskTitle('')
      const res = await fetch(`/api/project-board/piece?id=${pieceId}`)
      const data = await res.json()
      if (data.success) setPiece(data.piece)
    } catch (err) {
      console.error('Failed to add task:', err)
    } finally {
      setIsAddingTask(false)
    }
  }

  // No UI path back to write mode while this is active — the server also
  // re-checks it on every chat request, so it can't be bypassed by calling
  // the API directly either.
  const confirmLock = async () => {
    const minutes = lockHours * 60 + lockMinutes
    if (minutes <= 0 || isLocking) return
    setIsLocking(true)
    try {
      const res = await fetch('/api/write/assistant-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      })
      const data = await res.json()
      if (data.success) {
        setLockedUntil(data.lockedUntil)
        setAssistantMode('coach')
        setShowLockModal(false)
      }
    } catch (err) {
      console.error('Failed to set assistant lock:', err)
    } finally {
      setIsLocking(false)
    }
  }

  if (isLoading || !piece) {
    return (
      <div style={{ minHeight: '100vh', background: shell.background, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="text-[#7d786f]">Loading...</p>
      </div>
    )
  }

  const wordCount = sections
    .map((s) => htmlToPlainText(s.content).split(/\s+/).filter((w) => w.length > 0).length)
    .reduce((a, b) => a + b, 0)
  const canMarkReady = wordCount > 100
  // Completed tasks sink to the bottom but stay visible — status is
  // persisted, so this ordering (and the tasks themselves) carries into
  // future writing sessions rather than resetting.
  const writingTasks = piece.tasks
    .filter((t) => t.type === 'creation' && t.is_writing_related !== false)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'complete' ? 1 : -1))
  const linesForSection = (id: string) => anchorLines.filter((l) => l.section_id === id)
  const unplacedLines = anchorLines.filter((l) => !l.section_id)
  const activeSection = sections.find((s) => s.id === activeSectionId)
  const anyLocked = sections.some((s) => s.is_locked)
  const canDivide = sections.length > 0 && wordCount > 30 && !anyLocked
  const sectionLabelFor = (id: string | null) =>
    sections.find((s) => s.id === id)?.label || 'Unplaced'

  // The writing column reserves room on the right for whatever rail panel is
  // open, so text recenters in the space that's left rather than sitting under
  // the panel. Nothing open -> full width. On mobile portrait the panel is a
  // bottom sheet instead (no horizontal reservation needed); on mobile
  // landscape it sits to the right like desktop, just narrower.
  const reservedRight = !openTool
    ? '0px'
    : viewport.isMobile
      ? viewport.isPortrait
        ? '0px'
        : '55vw'
      : openTool === 'assistant' && chatExpanded
        ? 'calc(38vw + 100px)'
        : '460px'

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: shell.background }}>
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 md:px-6 flex-shrink-0" style={{ background: 'rgba(15,14,13,0.95)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${t.divider}` }}>
        <IconButton
          ariaLabel="Back to project board"
          tone="shell"
          size={32}
          onClick={async () => {
            await flushSections()
            router.push('/project-board')
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </IconButton>
        {pieceId && (
          <div className="hidden sm:block" style={{ width: 240, flexShrink: 0 }}>
            <JourneyNav pieceId={pieceId} step={journeyStepFromStage(piece?.stage)} compact />
          </div>
        )}
        <div className="flex items-center gap-2 min-w-0">
          {canDivide && (
            <IconButton
              ariaLabel={
                isDividing
                  ? flowView ? 'Redistributing…' : 'Dividing…'
                  : flowView ? 'Redistribute into sections' : 'Divide into sections'
              }
              tone="shell"
              size={32}
              onClick={handleDivide}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: isDividing ? 0.5 : 1 }}>
                <circle cx="6" cy="6" r="3" />
                <circle cx="6" cy="18" r="3" />
                <line x1="20" y1="4" x2="8.12" y2="15.88" />
                <line x1="14.47" y1="14.48" x2="20" y2="20" />
                <line x1="8.12" y1="8.12" x2="12" y2="12" />
              </svg>
            </IconButton>
          )}
          {sections.length > 0 && (
            <IconButton
              ariaLabel={flowView ? 'Switch to section view' : 'Switch to flow view'}
              tone="shell"
              size={32}
              onClick={() => setFlowView(!flowView)}
            >
              {flowView ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="4" rx="1" />
                  <rect x="3" y="10" width="18" height="4" rx="1" />
                  <rect x="3" y="16" width="18" height="4" rx="1" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12c3-6 6 6 9 0s6-6 9 0" />
                </svg>
              )}
            </IconButton>
          )}
        </div>
      </div>

      {/* Writing surface */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          background: 'transparent',
          paddingRight: reservedRight,
          paddingBottom: viewport.isMobile && viewport.isPortrait && openTool ? '52vh' : undefined,
          transition: 'padding 0.3s ease',
          // Safari-specific: an overflow-y:auto scroller paired with a
          // position:fixed sibling (the tool panel below) is a well-known
          // WebKit compositing bug — scrolled content that Safari hasn't
          // repainted for the current layer stays stale/overlapping until
          // something forces a new layer. Promoting this container to its
          // own GPU layer stops it from sharing (and going stale with) the
          // fixed panel's paint.
          transform: 'translateZ(0)',
          WebkitTransform: 'translateZ(0)',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        <div className="max-w-[900px] mx-auto px-6 md:px-10 py-8 md:py-12">
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
              color: '#ece9e2', lineHeight: '1.3', marginBottom: '1.5rem', padding: 0,
            }}
          />

          {ingestType && sections.length > 0 && (
            <div className="mb-6 flex items-center justify-between text-xs text-[#7d786f] border border-[#352f29] rounded px-3 py-2">
              <span>
                {ingestType === 'draft'
                  ? 'Your draft has been distributed across the sections drawn from your emotional journey.'
                  : 'Your notes have been saved as anchor lines, placed into the sections that suit them.'}
              </span>
              <button onClick={() => setIngestType(null)} className="ml-3 text-[#7d786f] hover:text-[#aaa59c] flex-shrink-0">✕</button>
            </div>
          )}

          {sections.length === 0 ? (
            <div className="mt-8 border border-[#352f29] rounded-lg p-8 text-center space-y-4">
              {isIngesting ? (
                <div className="space-y-2">
                  <p className="text-base text-[#aaa59c] leading-relaxed">Reading your draft…</p>
                  <p className="text-xs text-[#7d786f]">Shaping sections from your emotional journey</p>
                </div>
              ) : (
                <>
                  <p className="text-base text-[#aaa59c] leading-relaxed">
                    Shape this piece into sections drawn from its emotional journey, or start with a blank
                    section and build it yourself.
                  </p>
                  <div className="flex flex-col gap-2 max-w-xs mx-auto">
                    <button
                      onClick={() => seedSections(false)}
                      disabled={isSeeding}
                      className="py-2 bg-[#ece9e2] text-[#0d0c0b] text-xs font-medium rounded hover:bg-[#aaa59c] transition-colors disabled:opacity-50"
                    >
                      {isSeeding ? 'Shaping…' : 'Shape from emotional journey'}
                    </button>
                    <button
                      onClick={() => addSection('')}
                      className="py-2 bg-transparent border border-[#352f29] text-[#aaa59c] text-xs font-medium rounded hover:border-[#7d786f] hover:text-[#aaa59c] transition-colors"
                    >
                      Start with a blank section
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className={flowView ? 'space-y-0' : viewport.isMobile ? 'space-y-2' : 'space-y-4'}>
              {!flowView && unplacedLines.length > 0 && (
                <div className="border border-dashed border-[#352f29] rounded p-3 space-y-1">
                  <p className="text-xs text-[#7d786f] uppercase tracking-widest mb-1">Unplaced lines</p>
                  {unplacedLines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-2">
                      <span className="text-base text-[#aaa59c] italic">“{l.text}”</span>
                      <button onClick={() => deleteAnchorLine(l.id)} className="text-[#7d786f] hover:text-red-300">✕</button>
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
                    ref={(el) => {
                      sectionContainerRefs.current[section.id] = el
                    }}
                    className={
                      flowView
                        ? ''
                        : `rounded-lg border transition-colors ${
                            isActive ? 'border-[#39a875]/50' : 'border-[#352f29]'
                          } ${section.is_locked ? 'bg-[#1c1916]' : 'bg-[#161412]'}`
                    }
                  >
                    {!flowView && (
                      <div className={`flex items-center gap-2 border-b border-[#352f29] ${viewport.isMobile ? 'px-3 py-1.5' : 'px-4 py-2'}`}>
                        <input
                          value={section.label || ''}
                          onChange={(e) =>
                            setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, label: e.target.value } : s)))
                          }
                          onBlur={(e) => handleSectionFieldSave(section.id, 'label', e.target.value)}
                          placeholder="Untitled section"
                          className={`bg-transparent font-medium text-[#ece9e2] uppercase focus:outline-none flex-1 min-w-0 ${viewport.isMobile ? 'tracking-wide' : 'tracking-widest'}`}
                          style={{ fontSize: viewport.isMobile ? 9 : 12 }}
                        />
                        {section.intended_emotion && (!viewport.isMobile || !viewport.isPortrait) && (
                          <span className="text-xs text-[#7d786f] italic flex-shrink-0">{section.intended_emotion}</span>
                        )}
                        <button
                          onClick={() => setOpenLinesFor(openLinesFor === section.id ? null : section.id)}
                          className="text-xs text-[#7d786f] hover:text-[#aaa59c] transition-colors flex-shrink-0"
                        >
                          Lines{lines.length > 0 ? ` (${lines.length})` : ''}
                        </button>
                        <button
                          onClick={() => toggleLock(section.id)}
                          className={`text-xs transition-colors flex-shrink-0 ${
                            section.is_locked ? 'text-[#39a875]' : 'text-[#7d786f] hover:text-[#aaa59c]'
                          }`}
                        >
                          {section.is_locked ? '🔒 Locked' : 'Lock'}
                        </button>
                        <button
                          onClick={() => deleteSection(section.id)}
                          className="text-xs text-[#7d786f] hover:text-red-300 transition-colors flex-shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {!flowView && openLinesFor === section.id && (
                      <div className="px-4 py-3 border-b border-[#352f29] space-y-2 bg-[#0d0c0b]">
                        {lines.length === 0 ? (
                          <p className="text-xs text-[#7d786f]">No lines placed here yet.</p>
                        ) : (
                          lines.map((l) => (
                            <div key={l.id} className="flex items-center justify-between gap-2">
                              <span className="text-base text-[#aaa59c] italic">“{l.text}”</span>
                              <button onClick={() => deleteAnchorLine(l.id)} className="text-[#7d786f] hover:text-red-300 text-xs">✕</button>
                            </div>
                          ))
                        )}
                        <textarea
                          placeholder="Add a line to this section…"
                          rows={2}
                          className="w-full bg-[#1c1916] border border-[#352f29] rounded px-2 py-1 text-base text-[#ece9e2] placeholder:text-[#7d786f] focus:outline-none focus:border-[#7d786f] resize-none overflow-hidden"
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
                        <p className="text-xs text-[#7d786f]">⌘↵ to add</p>
                      </div>
                    )}

                    <div style={{ position: 'relative', padding: flowView ? '0 1rem' : '0.25rem 1rem 1rem', fontSize: '1.125rem' }}>
                      <SectionEditor
                        content={section.content}
                        onChange={(html) => {
                          if (section.is_locked) return
                          handleSectionContentChange(section.id, html)
                        }}
                        onFocus={() => setActiveSectionId(section.id)}
                        onBlur={() => flushSections()}
                        onSelectionChange={(sel) => {
                          setSelectedText(sel ? { text: sel.text, sectionId: section.id, from: sel.from, to: sel.to } : null)
                        }}
                        onReady={(editor) => {
                          sectionEditorsRef.current[section.id] = editor
                        }}
                        editable={!section.is_locked}
                        placeholder={suggestions[section.id] || (flowView ? '' : 'Write this section…')}
                        hideToolbar={flowView}
                        textColor={section.is_locked ? '#aaa59c' : '#ece9e2'}
                      />

                      {/* Pending AI edit scoped to a highlighted passage — sits
                          right after that passage, not the section's end, so a
                          long section doesn't hide the fact a suggestion landed. */}
                      {showPending && !flowView && pendingEdit!.anchorText && pendingEditTop !== null && (
                        <div
                          className="mx-4 rounded border border-[#39a875]/30 bg-[#16241d]/95 p-3 space-y-2"
                          style={{ position: 'absolute', top: pendingEditTop, left: 0, right: 0, zIndex: 5, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
                        >
                          <p className="text-xs text-[#39a875] uppercase tracking-widest">Proposed rewrite</p>
                          <p className="text-base text-[#aaa59c] whitespace-pre-wrap leading-relaxed">{pendingEdit!.content}</p>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={approvePendingEdit}
                              className="px-3 py-1.5 bg-[#39a875]/20 text-[#39a875] text-xs font-medium rounded hover:bg-[#39a875]/30 transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => { setPendingEdit(null); setPendingEditTop(null) }}
                              className="px-3 py-1.5 bg-transparent border border-[#352f29] text-[#aaa59c] text-xs font-medium rounded hover:border-[#7d786f] transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Whole-section pending edit (no highlight was made), or a
                        fallback if the inline position couldn't be measured —
                        same placement as before, at the section's end. */}
                    {showPending && !flowView && (!pendingEdit!.anchorText || pendingEditTop === null) && (
                      <div className="mx-4 mb-4 rounded border border-[#39a875]/30 bg-[#16241d]/50 p-3 space-y-2">
                        <p className="text-xs text-[#39a875] uppercase tracking-widest">Proposed rewrite</p>
                        <p className="text-base text-[#aaa59c] whitespace-pre-wrap leading-relaxed">{pendingEdit!.content}</p>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={approvePendingEdit}
                            className="px-3 py-1.5 bg-[#39a875]/20 text-[#39a875] text-xs font-medium rounded hover:bg-[#39a875]/30 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => { setPendingEdit(null); setPendingEditTop(null) }}
                            className="px-3 py-1.5 bg-transparent border border-[#352f29] text-[#aaa59c] text-xs font-medium rounded hover:border-[#7d786f] transition-colors"
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
                  className="w-full py-2 border border-dashed border-[#352f29] text-[#7d786f] text-xs rounded hover:border-[#7d786f] hover:text-[#aaa59c] transition-colors"
                >
                  + Add section
                </button>
              )}
            </div>
          )}

          {sections.length > 0 && (
            <div className="mt-12 pt-8 border-t border-[#352f29]">
              <div className="flex justify-between items-center text-xs text-[#aaa59c]">
                <span>{wordCount} words</span>
                <span>{isSaving ? 'Saving…' : 'Saved'}</span>
              </div>
              {canMarkReady && (
                <button
                  onClick={async () => {
                    await flushSections()
                    router.push(`/write/test?piece_id=${pieceId}`)
                  }}
                  className="mt-6 text-sm text-[#aaa59c] hover:text-[#ece9e2] transition-colors underline"
                >
                  This draft is ready →
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating tool rail */}
      <div
        className="fixed right-4 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-2"
        style={{ display: viewport.isMobile && openTool ? 'none' : 'flex' }}
      >
        {TOOL_META.map((tool) => (
          <div key={tool.key} className="group relative flex items-center justify-end">
            <span
              className="absolute right-12 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded pointer-events-none"
              style={{ background: t.cardBg, color: t.textSecondary, border: `1px solid ${t.divider}`, boxShadow: t.shadow }}
            >
              {tool.label}
            </span>
            <button
              onClick={() => setOpenTool(openTool === tool.key ? null : tool.key)}
              className={viewport.isMobile ? 'w-11 h-11 rounded-full flex items-center justify-center transition-colors' : 'w-10 h-10 rounded-full flex items-center justify-center transition-colors'}
              style={{
                border: `1px solid ${openTool === tool.key ? t.textMuted : t.divider}`,
                background: openTool === tool.key ? t.cardBg : t.containerBg,
                color: openTool === tool.key ? t.textPrimary : t.textMuted,
                boxShadow: openTool === tool.key ? t.shadow : 'none',
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
          className={
            viewport.isMobile
              ? viewport.isPortrait
                ? 'fixed inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden'
                : 'fixed right-3 top-16 bottom-4 z-30 flex flex-col overflow-hidden'
              : 'fixed right-20 top-16 bottom-4 z-30 flex flex-col overflow-hidden'
          }
          style={
            viewport.isMobile
              ? viewport.isPortrait
                ? {
                    height: '50vh',
                    background: t.containerBg,
                    borderTop: `1px solid ${t.divider}`,
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    boxShadow: t.containerShadow,
                    transform: 'translateZ(0)',
                    WebkitTransform: 'translateZ(0)',
                  }
                : {
                    width: '55vw',
                    background: t.containerBg,
                    border: `1px solid ${t.divider}`,
                    borderRadius: 20,
                    boxShadow: t.containerShadow,
                    transform: 'translateZ(0)',
                    WebkitTransform: 'translateZ(0)',
                  }
              : {
                  width: openTool === 'assistant' && chatExpanded ? '38%' : '360px',
                  background: t.containerBg,
                  border: `1px solid ${t.divider}`,
                  borderRadius: 20,
                  boxShadow: t.containerShadow,
                  // Safari-specific fix — see the writing surface container
                  // above for the full explanation of this compositing bug.
                  transform: 'translateZ(0)',
                  WebkitTransform: 'translateZ(0)',
                }
          }
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: `1px solid ${t.divider}` }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              {TOOL_META.find((t) => t.key === openTool)?.label}
            </span>
            <div className="flex items-center gap-3">
              {openTool === 'core' && (
                <button
                  onClick={() => setShowCoreConceptModal(true)}
                  style={{ color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = t.textPrimary }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = t.textMuted }}
                  title="View full core concept"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                </button>
              )}
              {openTool === 'assistant' && !viewport.isMobile && (
                <button
                  onClick={() => setChatExpanded(!chatExpanded)}
                  style={{ color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = t.textPrimary }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = t.textMuted }}
                  title={chatExpanded ? 'Shrink' : 'Maximize'}
                >
                  {chatExpanded ? '⤡' : '⤢'}
                </button>
              )}
              <button
                onClick={() => setOpenTool(null)}
                style={{ color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = t.textPrimary }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = t.textMuted }}
              >✕</button>
            </div>
          </div>

          {openTool === 'core' && (
            <div className="p-4 overflow-y-auto" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {piece.one_sentence && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.textMuted, margin: '0 0 8px' }}>Idea in one sentence</p>
                  <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.25, color: t.textPrimary, margin: 0 }}>{piece.one_sentence}</p>
                </div>
              )}
              {piece.conviction_statement && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.textMuted, margin: '0 0 8px' }}>Conviction</p>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
                    <div style={{ width: 3, borderRadius: 2, background: 'rgba(165,63,43,0.4)', flexShrink: 0 }} />
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: t.textSecondary, margin: 0 }}>{piece.conviction_statement}</p>
                  </div>
                </div>
              )}
              {piece.emotional_journey && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.textMuted, margin: '0 0 8px' }}>Emotional Journey</p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: t.textSecondary, margin: 0, whiteSpace: 'pre-line' }}>{piece.emotional_journey}</p>
                </div>
              )}
              {piece.core_truth && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.textMuted, margin: '0 0 8px' }}>Core Truth</p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: t.textPrimary, margin: 0, fontWeight: 500 }}>{piece.core_truth}</p>
                </div>
              )}
              {piece.substack_goals && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.textMuted, margin: '0 0 8px' }}>Writing Suggestions</p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: t.textSecondary, margin: 0, whiteSpace: 'pre-line' }}>{piece.substack_goals}</p>
                </div>
              )}
            </div>
          )}

          {openTool === 'tasks' && (
            <div className="p-4 overflow-y-auto">
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <TextField
                  value={newTaskTitle}
                  onChange={setNewTaskTitle}
                  placeholder="Add a task…"
                  ariaLabel="New task title"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTask()
                    }
                  }}
                  style={{ fontSize: 13 }}
                />
                <QuietButton size="sm" onClick={addTask} disabled={!newTaskTitle.trim() || isAddingTask}>
                  Add
                </QuietButton>
              </div>
              {writingTasks.length === 0 ? (
                <p style={{ fontSize: 13, color: t.textMuted }}>No writing tasks yet.</p>
              ) : (
                <div>
                  {writingTasks.map((task, i) => (
                    <button
                      key={task.id}
                      onClick={() => handleToggleTask(task.id, task.status)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                        padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer',
                        textAlign: 'left', font: 'inherit',
                        borderBottom: i < writingTasks.length - 1 ? `1px solid ${t.divider}` : 'none',
                      }}
                    >
                      <span
                        style={{
                          flexShrink: 0, width: 14, height: 14, borderRadius: '50%',
                          border: task.status === 'complete' ? '1px solid rgba(16,185,129,0.4)' : `1px solid ${t.textMuted}`,
                          background: task.status === 'complete' ? 'rgba(16,185,129,0.12)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {task.status === 'complete' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#39a875', display: 'block' }} />}
                      </span>
                      <span style={{ fontSize: 14, color: task.status === 'complete' ? t.textMuted : t.textSecondary, textDecoration: task.status === 'complete' ? 'line-through' : 'none' }}>
                        {task.title}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {openTool === 'anchor' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div style={{ padding: 16, borderBottom: `1px solid ${t.divider}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                    width: '100%', background: t.inputBg, border: `1px solid ${t.inputBorder}`,
                    borderRadius: 10, padding: '10px 12px', fontSize: 14, color: t.textPrimary,
                    outline: 'none', resize: 'none', overflow: 'hidden', fontFamily: 'inherit',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: 11, color: t.textMuted, margin: 0 }}>⌘↵ to add</p>
                  {newLineText.trim() && (
                    <button
                      onClick={() => { addAnchorLine(newLineText); setNewLineText('') }}
                      style={{ fontSize: 12, color: t.textSecondary, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {anchorLines.length === 0 ? (
                  <p style={{ fontSize: 13, color: t.textMuted }}>No anchor lines yet.</p>
                ) : (
                  anchorLines.map((l) => (
                    <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 14, color: t.textSecondary, fontStyle: 'italic', lineHeight: 1.5 }}>&ldquo;{l.text}&rdquo;</span>
                        <button
                          onClick={() => deleteAnchorLine(l.id)}
                          style={{ fontSize: 12, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#e05656' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = t.textMuted }}
                        >✕</button>
                      </div>
                      <p style={{ fontSize: 11, color: t.textMuted, margin: 0 }}>{sectionLabelFor(l.section_id)}</p>
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
                <div style={{ padding: '8px 16px', borderBottom: `1px solid ${t.divider}`, background: t.inputBg, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ color: t.verdant, fontSize: 12, flexShrink: 0, marginTop: 2 }}>↳</span>
                  <p style={{ fontSize: 12, color: t.textSecondary, fontStyle: 'italic', flex: 1, lineHeight: 1.5, margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    &ldquo;{selectedText.text}&rdquo;
                  </p>
                  <button
                    onClick={() => setSelectedText(null)}
                    style={{ fontSize: 11, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                  >✕</button>
                </div>
              )}
              {!selectedText && activeSection && (
                <p style={{ padding: '8px 16px', fontSize: 12, color: t.textMuted, borderBottom: `1px solid ${t.divider}`, margin: 0 }}>
                  Focused on: <span style={{ color: t.textSecondary }}>{activeSection.label || 'this section'}</span>
                  {activeSection.is_locked && ' (locked)'}
                </p>
              )}

              <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {chatMessages.length === 0 ? (
                  <p style={{ fontSize: 14, color: t.textMuted, lineHeight: 1.6, margin: 0 }}>
                    {assistantMode === 'write'
                      ? "Click into a section, then ask me to write or rewrite. Select a specific sentence first and I'll focus there — approved rewrites land in the section for you to accept."
                      : "I won't write for you here — instead I'll ask questions and reflect things back until the words come from you. Select a sentence to discuss it specifically, or ask about the piece as a whole."}
                  </p>
                ) : (
                  <Thread messages={chatMessages} streaming={isChatLoading} align="left" />
                )}
              </div>
              <div style={{ borderTop: `1px solid ${t.divider}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Composer
                  value={chatInput}
                  onChange={setChatInput}
                  onSend={handleChatSend}
                  disabled={isChatLoading}
                  placeholder={assistantMode === 'coach' ? 'What are you trying to say here?' : 'Ask something…'}
                  sendLabel="Send"
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                  {isAssistantLocked && (
                    <span style={{ fontSize: 11, color: t.textMuted }}>
                      Locked until {new Date(lockedUntil!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {(() => {
                    // Three-step slider: Lock / Suggest / Write. The ball marks
                    // the active position; the track itself carries the state
                    // colour (red once locked, a non-primary accent once write
                    // is armed, neutral for the default suggest state).
                    const position = isAssistantLocked ? 0 : assistantMode === 'write' ? 2 : 1
                    const trackBg = position === 0 ? t.soft.danger : position === 2 ? t.soft.violet : t.cardBgInner
                    const segmentW = 56
                    const ballLeft = 3 + position * segmentW + (segmentW - 24) / 2
                    const segments: { key: 'lock' | 'coach' | 'write'; label: string; pos: number }[] = [
                      { key: 'lock', label: 'Lock', pos: 0 },
                      { key: 'coach', label: 'Suggest', pos: 1 },
                      { key: 'write', label: 'Write', pos: 2 },
                    ]
                    return (
                      <div
                        style={{
                          position: 'relative', display: 'flex', width: segmentW * 3 + 6, height: 30,
                          borderRadius: 18, background: trackBg, transition: 'background-color 0.2s ease', flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute', top: 3, left: ballLeft, width: 24, height: 24, borderRadius: '50%',
                            background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.35)', transition: 'left 0.2s ease',
                          }}
                        />
                        {segments.map((seg) => (
                          <button
                            key={seg.key}
                            type="button"
                            onClick={() => {
                              if (isAssistantLocked) return
                              if (seg.key === 'lock') setShowLockModal(true)
                              else setAssistantMode(seg.key === 'write' ? 'write' : 'coach')
                            }}
                            disabled={isAssistantLocked && seg.key !== 'lock'}
                            style={{
                              position: 'relative', zIndex: 1, flex: 1, height: '100%', border: 'none', background: 'none',
                              cursor: isAssistantLocked ? 'default' : 'pointer', fontSize: 9, fontWeight: 700,
                              letterSpacing: '0.02em', color: position === seg.pos ? '#1a1815' : t.textMuted,
                              transition: 'color 0.2s ease',
                            }}
                          >
                            {seg.label}
                          </button>
                        ))}
                      </div>
                    )
                  })()}
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
              background: t.containerBg,
              border: `1px solid ${t.divider}`,
              borderRadius: 20,
              width: '100%',
              maxWidth: '640px',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: t.containerShadow,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                position: 'sticky', top: 0,
                background: t.containerBg,
                borderBottom: `1px solid ${t.divider}`,
                padding: '16px 20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderRadius: '20px 20px 0 0',
              }}
            >
              <h2 style={{ fontSize: 15, fontWeight: 700, color: t.textPrimary, letterSpacing: '-0.02em', margin: 0 }}>
                {piece.title}
              </h2>
              <button
                onClick={() => setShowCoreConceptModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.textMuted, padding: '4px', display: 'flex', alignItems: 'center' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = t.textPrimary }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = t.textMuted }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
              {piece.one_sentence && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.textMuted, margin: '0 0 8px' }}>Idea in one sentence</p>
                  <p style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.25, color: t.textPrimary, margin: 0 }}>{piece.one_sentence}</p>
                </div>
              )}
              {piece.conviction_statement && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.textMuted, margin: '0 0 8px' }}>Conviction</p>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
                    <div style={{ width: 3, borderRadius: 2, background: 'rgba(165,63,43,0.4)', flexShrink: 0 }} />
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: t.textSecondary, margin: 0 }}>{piece.conviction_statement}</p>
                  </div>
                </div>
              )}
              {piece.emotional_journey && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.textMuted, margin: '0 0 8px' }}>Emotional Journey</p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: t.textSecondary, margin: 0, whiteSpace: 'pre-line' }}>{piece.emotional_journey}</p>
                </div>
              )}
              {piece.core_truth && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.textMuted, margin: '0 0 8px' }}>Core Truth</p>
                  <p style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.55, letterSpacing: '-0.01em', color: t.textPrimary, margin: 0 }}>{piece.core_truth}</p>
                </div>
              )}
              {piece.substack_goals && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.textMuted, margin: '0 0 8px' }}>Writing Suggestions</p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: t.textSecondary, margin: 0, whiteSpace: 'pre-line' }}>{piece.substack_goals}</p>
                </div>
              )}
              {piece.short_form_goals && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.textMuted, margin: '0 0 8px' }}>Visuals Suggestions</p>
                  <p style={{ fontSize: 14, lineHeight: 1.65, color: t.textSecondary, margin: 0, whiteSpace: 'pre-line' }}>{piece.short_form_goals}</p>
                </div>
              )}
              {piece.open_threads && piece.open_threads.length > 0 && (
                <div>
                  <p style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: t.textMuted, margin: '0 0 10px' }}>Open Threads</p>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {piece.open_threads.map((thread, i) => (
                      <div key={i}>
                        <div style={{ display: 'flex', gap: 10, fontSize: 14, color: t.textSecondary, lineHeight: 1.55, padding: '8px 0' }}>
                          <span style={{ color: t.textMuted, flexShrink: 0, fontWeight: 300 }}>—</span>
                          <span>{thread}</span>
                        </div>
                        {i < piece.open_threads.length - 1 && <div style={{ height: 1, background: t.divider }} />}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showLockModal && (
        <ModalDialog
          onClose={() => setShowLockModal(false)}
          title="Lock to suggestions only"
          subtitle={
            <span style={{ display: 'block', marginTop: 6 }}>
              Once it&rsquo;s set, there&rsquo;s no early way out — not here, not anywhere else in the app.
            </span>
          }
          footer={
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <GhostButton onClick={() => setShowLockModal(false)}>Cancel</GhostButton>
              <PrimaryButton
                onClick={confirmLock}
                disabled={lockHours * 60 + lockMinutes <= 0}
                loading={isLocking}
                loadingLabel="Locking…"
              >
                Lock it in
              </PrimaryButton>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
            <p style={{ fontSize: 13, color: t.textSecondary, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
              While this is active, the assistant will only ask questions and offer brief, cautious examples — never write for you.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ textAlign: 'center' }}>
                <WheelColumn value={lockHours} onChange={setLockHours} options={Array.from({ length: 13 }, (_, i) => i)} format={(v) => String(v)} />
                <p style={{ fontSize: 11, color: t.textMuted, marginTop: 8 }}>hours</p>
              </div>
              <span style={{ fontSize: 20, color: t.textMuted, marginTop: -20 }}>:</span>
              <div style={{ textAlign: 'center' }}>
                <WheelColumn value={lockMinutes} onChange={setLockMinutes} options={[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]} />
                <p style={{ fontSize: 11, color: t.textMuted, marginTop: 8 }}>minutes</p>
              </div>
            </div>
          </div>
        </ModalDialog>
      )}
    </div>
  )
}

export default function WritePage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: shell.background, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p className="text-[#7d786f]">Loading...</p>
        </div>
      }
    >
      <WriteContent />
    </Suspense>
  )
}
