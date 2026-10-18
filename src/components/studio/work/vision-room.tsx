'use client'

// The room where one project's vision is talked through. Opened from the
// canvas ("Talk about the vision"), it takes the whole window: the state of
// the vision on one side (vision-page.tsx), the conversation on the other
// (vision-talk.tsx). Part of Direction.
//
// The way in is the point of the button: the room opens out of the star that
// was pressed, as a circle of the button's own violet that clears into the
// room while the canvas behind rushes forward and blurs, so it reads as going
// into the canvas rather than a panel sliding over it. Leaving plays the same
// thing backwards, at the same pace: the room sinks, the violet floods back,
// the circle closes into the star and the canvas settles back into focus
// behind it. With reduced motion asked for, both are a plain fade.
//
// Everything here is one project's. The room is given a project id and asks
// only that project's routes; nothing from any other project is shown.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Atmosphere } from '@/components/shell/atmosphere'
import { Portal } from '@/components/ui/portal'
import { useTheme } from '@/components/theme/theme-provider'
import { VisionPage, type KeptAction } from '@/components/studio/work/vision-page'
import { VisionTalk } from '@/components/studio/work/vision-talk'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, motion, radius, shell } from '@/lib/design-tokens'
import type { Appearance, Rule, Thread, TreeNode } from '@/lib/studio/node-types'
import type { ConceptChange, KeptLine, PendingChange, Reading, VisionConversation, VisionMessage, VisionPayload, VisionUpdate } from '@/lib/studio/vision/types'
import type { ConceptAction } from '@/components/studio/work/concept-mirror'
import { WorkingDots } from '@/components/ui/working'

const talkLink = (color: string) => ({
  ...canvasType.small, fontSize: 12, flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color, textDecoration: 'underline', textUnderlineOffset: 3,
} as const)

/** "Today, 14:20", "Yesterday", "3 Oct": when a conversation was last carried on. */
function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000)
  if (days === 0) return `Today, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })
}

/** Where the room opens from: the centre of the button, in window pixels. */
export interface RoomOrigin { x: number; y: number }

const IN_MS = 820
/** The way out is the way in played backwards, a little quicker. */
const OUT_MS = 720
/** Below this the two halves take turns instead of standing side by side. */
const SIDE_BY_SIDE_MIN = 980
/** The canvas behind (stage.tsx) is pushed forward while the room is open. */
const STAGE = '.canvas-stage-content'

export function VisionRoom({
  projectId,
  origin,
  project,
  pieces,
  threads,
  appearancesFor,
  onClose,
  onOpenPiece,
  onRulesChanged,
  onConceptChanged,
  disabled = false,
  tour,
}: {
  projectId: string
  origin: RoomOrigin | null
  project: { title: string; intent: string; rules: Rule[] }
  pieces: TreeNode[]
  threads: Thread[]
  appearancesFor: (threadId: string) => Appearance[]
  /** Called once the way out has finished playing. */
  onClose: () => void
  onOpenPiece: (id: string) => void
  onRulesChanged: () => void
  /** A piece's core concept changed here, so the pieces should be read again (the writing page shows the same). */
  onConceptChanged: () => void
  disabled?: boolean
  /** Driven by the example tour: which half a narrow room shows, and when to
   *  leave (by the same way out a press of "Canvas" plays). */
  tour?: { tab?: 'page' | 'talk'; close?: boolean }
}) {
  const { t } = useTheme()
  const reduce = useReducedMotion() ?? false
  const [leaving, setLeaving] = useState(false)
  // Once it is open the circle is let go of, so a window that grows later
  // (a phone turned on its side) is never left cut off at the old size.
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(true), IN_MS + 80)
    return () => window.clearTimeout(id)
  }, [])
  const [wide, setWide] = useState(true)
  const [tab, setTab] = useState<'page' | 'talk'>('talk')
  useEffect(() => { if (tour?.tab) setTab(tour.tab) }, [tour?.tab])

  const [loaded, setLoaded] = useState(false)
  const [messages, setMessages] = useState<VisionMessage[]>([])
  const [kept, setKept] = useState<KeptLine[]>([])
  const [changes, setChanges] = useState<ConceptChange[]>([])
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  // Which conversation the talk is carrying on, and whether past ones can be
  // listed and returned to (migration 035). `talkKey` changes only when a
  // different conversation is opened, so the talk starts over on its words.
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [canList, setCanList] = useState(false)
  const [talkKey, setTalkKey] = useState(0)
  const [pastOpen, setPastOpen] = useState(false)
  const [past, setPast] = useState<VisionConversation[] | null>(null)
  const [reading, setReading] = useState<Reading | null>(null)
  const [stale, setStale] = useState(false)
  const [unread, setUnread] = useState({ images: 0, recordings: 0 })
  const [readingBusy, setReadingBusy] = useState(false)
  const [readingFailed, setReadingFailed] = useState(false)

  const at = origin ?? { x: typeof window === 'undefined' ? 0 : window.innerWidth / 2, y: typeof window === 'undefined' ? 0 : window.innerHeight - 48 }

  // How far the circle has to open to clear the farthest corner, so its whole
  // run is spent on screen instead of finishing in the first few frames.
  const reach = typeof window === 'undefined'
    ? 2400
    : Math.ceil(Math.hypot(Math.max(at.x, window.innerWidth - at.x), Math.max(at.y, window.innerHeight - at.y))) + 60

  useEffect(() => {
    const check = () => setWide(window.innerWidth >= SIDE_BY_SIDE_MIN)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── what the room knows ───────────────────────────────────────────────────
  // Opens where it was left: the conversation touched last. `which` opens a
  // past one, or 'new' none at all.
  const open = useCallback((which?: string) => {
    setLoaded(false)
    const q = which ? `?conversation=${encodeURIComponent(which)}` : ''
    return fetch(`/api/studio/projects/${projectId}/vision${q}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VisionPayload | null) => {
        if (d) {
          setMessages(d.messages ?? [])
          setConversationId(d.conversation_id ?? null)
          setCanList(!!d.conversations)
          setKept(d.kept ?? [])
          setChanges(d.changes ?? [])
          setPendingChanges(d.pending_changes ?? [])
          setReading(d.reading ?? null)
          setStale(!!d.stale)
          setUnread(d.unread ?? { images: 0, recordings: 0 })
        }
        setTalkKey((k) => k + 1)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [projectId])

  // Every visit begins on a new conversation; the ones before are a button away.
  useEffect(() => { void open('new') }, [open])

  const showPast = useCallback(() => {
    setPastOpen(true)
    setPast(null)
    fetch(`/api/studio/projects/${projectId}/vision/conversations`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { conversations: [] }))
      .then((d: { conversations?: VisionConversation[] }) => setPast(d.conversations ?? []))
      .catch(() => setPast([]))
  }, [projectId])

  const update = useCallback((u: VisionUpdate) => {
    if (u.kept) setKept(u.kept)
    if (u.changes) {
      // A concept that changed reads differently on the canvas too.
      if (u.changes.length !== changes.length || u.thread_added || u.node) onConceptChanged()
      setChanges(u.changes)
    }
    if (u.pending_changes) setPendingChanges(u.pending_changes)
  }, [changes.length, onConceptChanged])

  // ── the canvas behind, pushed forward ─────────────────────────────────────
  useEffect(() => {
    const stages = Array.from(document.querySelectorAll<HTMLElement>(STAGE))
    if (reduce) return
    for (const el of stages) {
      el.style.transformOrigin = `${at.x}px ${at.y}px`
      el.style.transition = `transform ${IN_MS}ms ${motion.enter}, filter ${IN_MS}ms ${motion.enter}`
      el.style.willChange = 'transform, filter'
    }
    const frame = requestAnimationFrame(() => {
      for (const el of stages) { el.style.transform = 'scale(1.22)'; el.style.filter = 'blur(10px)' }
    })
    return () => {
      cancelAnimationFrame(frame)
      for (const el of stages) {
        el.style.transition = `transform ${OUT_MS}ms ${motion.enter}, filter ${OUT_MS}ms ${motion.enter}`
        el.style.transform = ''
        el.style.filter = ''
        window.setTimeout(() => { el.style.transition = ''; el.style.transformOrigin = ''; el.style.willChange = '' }, OUT_MS + 40)
      }
    }
    // The origin is where the button was when the room opened; it does not move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce])

  // ── the way out ───────────────────────────────────────────────────────────
  const closed = useRef(false)
  const leave = useCallback(() => {
    if (closed.current) return
    closed.current = true
    setLeaving(true)
    // The canvas comes back into focus while the circle closes, as it went out
    // of focus while it opened, not after the room has gone.
    if (!reduce) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(STAGE))) {
        el.style.transition = `transform ${OUT_MS}ms cubic-bezier(0.85, 0, 0.5, 1), filter ${OUT_MS}ms cubic-bezier(0.85, 0, 0.5, 1)`
        el.style.transform = ''
        el.style.filter = ''
      }
    }
    window.setTimeout(onClose, reduce ? 140 : OUT_MS)
  }, [onClose, reduce])
  useEffect(() => { if (tour?.close) leave() }, [tour?.close, leave])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Escape inside a box being written in belongs to that box first.
      if (e.key !== 'Escape' || e.defaultPrevented) return
      leave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [leave])

  // ── the page's own writes ─────────────────────────────────────────────────
  const read = useCallback(async () => {
    if (readingBusy) return
    setReadingBusy(true)
    setReadingFailed(false)
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/vision/reading`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: '{}' })
      if (!res.ok) throw new Error('failed')
      const d = (await res.json()) as { reading: Reading | null }
      setReading(d.reading)
      setStale(false)
    } catch {
      setReadingFailed(true)
    } finally {
      setReadingBusy(false)
    }
  }, [projectId, readingBusy])

  const dismissGap = useCallback((gapId: string) => {
    // Gone at once; the server keeps it from coming back with the next reading.
    setReading((r) => (r ? { ...r, gaps: r.gaps.filter((g) => g.id !== gapId) } : r))
    void fetch(`/api/studio/projects/${projectId}/vision/reading`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ dismiss: gapId }) }).catch(() => {})
  }, [projectId])

  const keptAction = useCallback(async (action: KeptAction): Promise<boolean> => {
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/vision/kept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(action) })
      if (!res.ok) return false
      update((await res.json()) as VisionUpdate)
      return true
    } catch {
      return false
    }
  }, [projectId, update])

  const conceptAction = useCallback(async (action: ConceptAction): Promise<boolean> => {
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/concept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ ...action, from: 'room' }) })
      if (!res.ok) return false
      update((await res.json()) as VisionUpdate)
      onConceptChanged()
      return true
    } catch {
      return false
    }
  }, [onConceptChanged, projectId, update])

  const pieceOf = useCallback((id: string) => {
    const p = pieces.find((x) => x.id === id)
    return p ? { title: p.title || 'untitled', core_truth: p.core_truth ?? '', intent: p.intent ?? '', emotional_journey: p.emotional_journey ?? '', open_threads: (p.open_threads ?? []).filter((x) => x && x.trim()).join('\n') } : null
  }, [pieces])

  const heard = useCallback((lines: KeptLine[], offered: PendingChange[] = []) => {
    if (offered.length) setPendingChanges((prev) => [...prev.filter((c) => !offered.some((o) => o.id === c.id || (o.node_id === c.node_id && o.field === c.field))), ...offered].slice(-8))
    setKept((prev) => {
      const pending = [...prev.filter((k) => k.state === 'pending' && !lines.some((l) => l.id === k.id)), ...lines].slice(-3)
      return [...prev.filter((k) => k.state === 'kept'), ...pending]
    })
  }, [])

  const pending = kept.filter((k) => k.state === 'pending')
  const openCount = kept.filter((k) => k.state === 'kept' && k.kind === 'open').length + (reading?.gaps.length ?? 0)

  const sheet = {
    background: t.containerBg, border: `1px solid ${t.divider}`, borderRadius: radius.container,
    boxShadow: t.containerShadow, minHeight: 0, overflow: 'hidden' as const, display: 'flex', flexDirection: 'column' as const,
  }
  const showPage = wide || tab === 'page'
  const showTalk = wide || tab === 'talk'

  return (
    <Portal>
      <style>{`
        @keyframes visionIris { from { clip-path: circle(26px at var(--vx) var(--vy)); } to { clip-path: circle(var(--vr) at var(--vx) var(--vy)); } }
        @keyframes visionIrisOut { from { clip-path: circle(var(--vr) at var(--vx) var(--vy)); } to { clip-path: circle(26px at var(--vx) var(--vy)); } }
        @keyframes visionWash { 0% { opacity: 1; } 45% { opacity: 0.9; } 100% { opacity: 0; } }
        @keyframes visionWashBack { 0% { opacity: 0; } 55% { opacity: 0.9; } 100% { opacity: 1; } }
        @keyframes visionRise { from { opacity: 0; transform: translateY(34px) scale(0.975); } to { opacity: 1; transform: none; } }
        @keyframes visionSink { from { opacity: 1; transform: none; } to { opacity: 0; transform: translateY(34px) scale(0.975); } }
        @keyframes visionFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes visionFadeOut { from { opacity: 1; } to { opacity: 0; } }
        .vision-room { animation: visionIris ${IN_MS}ms cubic-bezier(0.5, 0, 0.15, 1) both; }
        .vision-room[data-settled] { animation: none; }
        .vision-room[data-leaving] { animation: visionIrisOut ${OUT_MS}ms cubic-bezier(0.85, 0, 0.5, 1) both; }
        .vision-wash { animation: visionWash ${IN_MS + 320}ms ease-in-out both; }
        .vision-room[data-leaving] .vision-wash { animation: visionWashBack ${OUT_MS}ms ease-in-out both; }
        .vision-rise { animation: visionRise 620ms ${motion.enter} both; }
        .vision-room[data-leaving] .vision-rise { animation: visionSink ${Math.round(OUT_MS * 0.5)}ms cubic-bezier(0.7, 0, 0.84, 0) both; animation-delay: 0ms !important; }
        @media (prefers-reduced-motion: reduce) {
          .vision-room { animation: visionFade 160ms ease both; }
          .vision-room[data-leaving] { animation: visionFadeOut 140ms ease both; }
          .vision-wash, .vision-room[data-leaving] .vision-wash { display: none; }
          .vision-rise, .vision-room[data-leaving] .vision-rise { animation: none; }
        }
        .vision-scroll { scrollbar-width: thin; scrollbar-color: ${alpha(t.textPrimary, 0.18)} transparent; }
        .vision-body { padding: 0 16px max(16px, env(safe-area-inset-bottom)); }
        @media (min-width: ${SIDE_BY_SIDE_MIN}px) { .vision-body { padding: 0 28px 28px; } }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`The vision of ${project.title || 'this project'}`}
        className="vision-room"
        data-settled={(settled && !leaving) || undefined}
        data-leaving={leaving || undefined}
        style={{
          position: 'fixed', inset: 0, zIndex: 65, background: shell.ink, overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          ['--vx' as string]: `${at.x}px`, ['--vy' as string]: `${at.y}px`, ['--vr' as string]: `${reach}px`,
        }}
      >
        <Atmosphere mood="violet" intensity={0.75} cycle={false} />
        {/* The button's own colour, flooding out of it and clearing. */}
        <div
          aria-hidden
          className="vision-wash"
          style={{
            position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none',
            background: `radial-gradient(circle at ${at.x}px ${at.y}px, ${t.violet} 0%, ${alpha(t.violet, 0.85)} 28%, ${alpha(t.violet, 0.35)} 60%, ${alpha(t.violet, 0)} 85%)`,
          }}
        />

        <header
          className="vision-rise"
          style={{ position: 'relative', zIndex: 2, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: 'max(14px, env(safe-area-inset-top)) 16px 14px', animationDelay: '380ms' }}
        >
          <button
            type="button"
            onClick={leave}
            aria-label="Back to the canvas"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px 9px 10px', borderRadius: 999, cursor: 'pointer',
              background: 'rgba(13,12,11,0.6)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
              border: `1px solid ${shell.line}`, color: shell.text, ...canvasType.small,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
            Canvas
          </button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: t.violet, minWidth: 0 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden style={{ flexShrink: 0 }}><path d="M12 2L14.6 9.4 22 12 14.6 14.6 12 22 9.4 14.6 2 12 9.4 9.4Z" /></svg>
            <span style={{ ...canvasType.small, color: shell.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Talking about the vision
            </span>
          </span>

          {!wide && (
            <div role="tablist" aria-label="The two halves of this room" style={{ marginLeft: 'auto', display: 'inline-flex', padding: 3, borderRadius: 999, background: 'rgba(13,12,11,0.6)', border: `1px solid ${shell.line}` }}>
              {([['talk', 'Talk'], ['page', 'The vision']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => setTab(key)}
                  style={{
                    ...canvasType.small, fontSize: 12, padding: '7px 13px', borderRadius: 999, border: 'none', cursor: 'pointer',
                    background: tab === key ? shell.text : 'transparent', color: tab === key ? shell.ink : shell.muted,
                  }}
                >
                  {label}{key === 'page' && openCount > 0 ? ` · ${openCount}` : ''}
                </button>
              ))}
            </div>
          )}
        </header>

        <div
          className="vision-body"
          style={{
            position: 'relative', zIndex: 2, flex: 1, minHeight: 0, width: '100%', maxWidth: 1440, margin: '0 auto',
            display: 'grid', gap: 20, gridTemplateColumns: wide ? 'minmax(0, 1.15fr) minmax(380px, 0.85fr)' : 'minmax(0, 1fr)',
          }}
        >
          {/* Both halves stay mounted, so a reply in flight survives a look at the page. */}
          <div className="vision-rise" data-tour="vision-page" style={{ ...sheet, display: showPage ? 'flex' : 'none', animationDelay: '440ms' }}>
            <div className="vision-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: wide ? '40px 44px 44px' : '26px 20px 30px' }}>
              <VisionPage
                project={project}
                pieces={pieces}
                threads={threads}
                appearancesFor={appearancesFor}
                kept={kept}
                reading={reading}
                stale={stale}
                unread={unread}
                loaded={loaded}
                readingBusy={readingBusy}
                readingFailed={readingFailed}
                onRead={() => void read()}
                onDismissGap={dismissGap}
                onKept={keptAction}
                changes={changes}
                onConcept={conceptAction}
                onOpenPiece={onOpenPiece}
                disabled={disabled}
              />
            </div>
          </div>
          <div className="vision-rise" data-tour="vision-talk" style={{ ...sheet, display: showTalk ? 'flex' : 'none', animationDelay: '520ms' }}>
            <div style={{ flex: 1, minHeight: 0, padding: wide ? '26px 26px 22px' : '20px 18px 16px', display: 'flex', flexDirection: 'column' }}>
              {canList && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${alpha(t.textPrimary, 0.08)}`, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={pastOpen ? () => setPastOpen(false) : showPast}
                    aria-expanded={pastOpen}
                    style={{
                      ...canvasType.small, fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
                      background: pastOpen ? alpha(t.violet, 0.14) : 'transparent', border: `1px solid ${alpha(pastOpen ? t.violet : t.textPrimary, pastOpen ? 0.4 : 0.18)}`, color: t.textPrimary,
                    }}
                  >
                    {pastOpen ? (
                      <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>Back to the conversation</>
                    ) : (
                      <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>Past conversations</>
                    )}
                  </button>
                  <span style={{ ...canvasType.label, color: t.textMuted, flex: 1, minWidth: 0, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {pastOpen ? 'Pick one up where it stopped' : conversationId ? (messages.length ? 'Picked up again' : 'This conversation') : 'A new conversation'}
                  </span>
                  {conversationId && !pastOpen && (
                    <button type="button" onClick={() => { void open('new') }} style={talkLink(t.textSecondary)}>
                      Start a new one
                    </button>
                  )}
                </div>
              )}
              {pastOpen && (
                <div className="vision-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {past === null && <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}><WorkingDots color={t.violet} /></p>}
                  {past?.length === 0 && (
                    <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>Nothing said here yet. Each conversation you start is kept, named once it gets going, and can be picked up again from here.</p>
                  )}
                  {past?.map((c) => {
                    const here = c.id === conversationId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setPastOpen(false); if (!here) void open(c.id) }}
                        className="vision-piece"
                        style={{
                          display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left', padding: '12px', margin: 0,
                          borderRadius: radius.field, border: 'none', cursor: 'pointer',
                          background: here ? alpha(t.violet, 0.1) : 'transparent',
                        }}
                      >
                        <span style={{ ...canvasType.words, fontSize: 15, color: t.textPrimary }}>{c.title || 'A conversation not yet named'}</span>
                        {c.summary && <span style={{ ...canvasType.small, color: t.textSecondary }}>{c.summary}</span>}
                        <span style={{ ...canvasType.meta, color: t.textMuted }}>
                          {when(c.updated_at)} · {c.messages} {c.messages === 1 ? 'message' : 'messages'}{here ? ' · open now' : ''}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0, display: pastOpen ? 'none' : 'flex', flexDirection: 'column' }}>
                <VisionTalk
                  key={talkKey}
                  projectId={projectId}
                  loaded={loaded}
                  messages={messages}
                  conversationId={conversationId}
                  onConversation={setConversationId}
                  pending={pending}
                  pendingChanges={pendingChanges}
                  pieceOf={pieceOf}
                  onHeard={heard}
                  onUpdate={update}
                  onRulesChanged={onRulesChanged}
                  disabled={disabled}
                  autoFocus={wide}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
