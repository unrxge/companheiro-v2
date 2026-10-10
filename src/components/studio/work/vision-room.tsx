'use client'

// The room where one project's vision is talked through. Opened from the
// canvas ("Talk about the vision"), it takes the whole window: the state of
// the vision on one side (vision-page.tsx), the conversation on the other
// (vision-talk.tsx). Part of Direction.
//
// The way in is the point of the button: the room opens out of the star that
// was pressed, as a circle of the button's own violet that clears into the
// room while the canvas behind rushes forward and blurs, so it reads as going
// into the canvas rather than a panel sliding over it. Leaving runs it
// backwards, into the same star. With reduced motion asked for, both are a
// plain fade.
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
import type { KeptLine, Reading, VisionMessage, VisionPayload } from '@/lib/studio/vision/types'

/** Where the room opens from: the centre of the button, in window pixels. */
export interface RoomOrigin { x: number; y: number }

const IN_MS = 820
const OUT_MS = 420
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
  disabled = false,
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
  disabled?: boolean
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

  const [loaded, setLoaded] = useState(false)
  const [messages, setMessages] = useState<VisionMessage[]>([])
  const [kept, setKept] = useState<KeptLine[]>([])
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
  useEffect(() => {
    let alive = true
    fetch(`/api/studio/projects/${projectId}/vision`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: VisionPayload | null) => {
        if (!alive) return
        if (d) {
          setMessages(d.messages ?? [])
          setKept(d.kept ?? [])
          setReading(d.reading ?? null)
          setStale(!!d.stale)
          setUnread(d.unread ?? { images: 0, recordings: 0 })
        }
        setLoaded(true)
      })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [projectId])

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
    window.setTimeout(onClose, reduce ? 140 : OUT_MS)
  }, [onClose, reduce])

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
      const d = (await res.json()) as { kept: KeptLine[] }
      setKept(d.kept)
      return true
    } catch {
      return false
    }
  }, [projectId])

  const heard = useCallback((lines: KeptLine[]) => {
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
        @keyframes visionIrisOut { from { clip-path: circle(var(--vr) at var(--vx) var(--vy)); } to { clip-path: circle(0px at var(--vx) var(--vy)); } }
        @keyframes visionWash { 0% { opacity: 1; } 45% { opacity: 0.9; } 100% { opacity: 0; } }
        @keyframes visionRise { from { opacity: 0; transform: translateY(34px) scale(0.975); } to { opacity: 1; transform: none; } }
        @keyframes visionFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes visionFadeOut { from { opacity: 1; } to { opacity: 0; } }
        .vision-room { animation: visionIris ${IN_MS}ms cubic-bezier(0.5, 0, 0.15, 1) both; }
        .vision-room[data-settled] { animation: none; }
        .vision-room[data-leaving] { animation: visionIrisOut ${OUT_MS}ms cubic-bezier(0.6, 0, 0.8, 0.4) both; }
        .vision-wash { animation: visionWash ${IN_MS + 320}ms ease-in-out both; }
        .vision-rise { animation: visionRise 620ms ${motion.enter} both; }
        @media (prefers-reduced-motion: reduce) {
          .vision-room { animation: visionFade 160ms ease both; }
          .vision-room[data-leaving] { animation: visionFadeOut 140ms ease both; }
          .vision-wash { display: none; }
          .vision-rise { animation: none; }
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
          <div className="vision-rise" style={{ ...sheet, display: showPage ? 'flex' : 'none', animationDelay: '440ms' }}>
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
                onOpenPiece={onOpenPiece}
                disabled={disabled}
              />
            </div>
          </div>
          <div className="vision-rise" style={{ ...sheet, display: showTalk ? 'flex' : 'none', animationDelay: '520ms' }}>
            <div style={{ flex: 1, minHeight: 0, padding: wide ? '26px 26px 22px' : '20px 18px 16px', display: 'flex', flexDirection: 'column' }}>
              <VisionTalk
                projectId={projectId}
                loaded={loaded}
                messages={messages}
                pending={pending}
                onHeard={heard}
                onKept={setKept}
                onRulesChanged={onRulesChanged}
                disabled={disabled}
                autoFocus={wide}
              />
            </div>
          </div>
        </div>
      </div>
    </Portal>
  )
}
