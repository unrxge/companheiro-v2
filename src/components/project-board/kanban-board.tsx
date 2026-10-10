'use client'

// src/components/project-board/kanban-board.tsx — the Project Board.
//
// Three columns: Queue, Active, Completed. Every card is a studio project
// (studio_projects.shelf_stage decides its column); the Queue also holds the
// Idea Lab explorations that have not been declared yet.
//
// Opening an active card always lands on the project's canvas — its pieces,
// the threads under them, room to add more — even when it holds one piece of
// writing. Home is the way straight into the words.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { SwapNote } from '@/components/billing/swap-note'
import { useTerritories } from '@/hooks/useTerritories'
import { PageShell, PageHeader, Container } from '@/components/shell/page-shell'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { IconButton } from '@/components/ui/icon-button'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { TextField } from '@/components/ui/field'
import { Level, useTravel } from '@/components/studio/surface/travel'
import { StageRibbon } from '@/components/widgets'
import { journeyStepFromStage, toneHue, type as typeRoles } from '@/lib/design-tokens'
import { api, ApiError } from '@/lib/studio/api-client'
import { lastSeenProjects } from '@/lib/studio/last-seen'
import { projectState } from '@/lib/studio/shelf-view'
import type { ShelfProject } from '@/lib/studio/types'
import { isResting, restEndsAt } from '@/lib/billing/entitlements'
import { usePlan } from '@/lib/billing/use-plan'
import { PlanNote } from '@/components/billing/plan-note'

interface ConceptualiseDraft {
  id: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  phase: number
}

const PHASE_LABELS: Record<number, string> = {
  1: 'First Contact',
  2: 'Expansion',
  3: 'The Reader',
  4: 'The Principle',
  5: 'Declaration',
}

interface Trajectory {
  statement: string
  tone: string | null
}

type Column = 'Queue' | 'Active' | 'Completed'
type Stage = 'queued' | 'active' | 'completed'

const STAGE_OF: Record<Column, Stage> = { Queue: 'queued', Active: 'active', Completed: 'completed' }
const COLUMNS: Column[] = ['Queue', 'Active', 'Completed']

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' })
const at = (iso: string | null | undefined) => {
  const n = iso ? new Date(iso).getTime() : NaN
  return Number.isNaN(n) ? 0 : n
}

/** One piece of writing with nothing running across it, rather than a project of several. */
const singlePiece = (p: ShelfProject): string | null =>
  p.root_ids?.length === 1 && !p.thread_count ? p.root_ids[0] : null


// A project in the Queue that has been worked on before (it was in Active, or
// has been opened since it was made) is one being come back to, not an idea
// waiting to be started, and the board says so.
function workedOn(p: ShelfProject): boolean {
  if (p.settings?.left_active_at || p.resting_until) return true
  const opened = new Date(p.last_opened_at).getTime()
  const made = new Date(p.created_at).getTime()
  return Number.isFinite(opened) && Number.isFinite(made) && opened - made > 60_000
}

export function ProjectBoard() {
  return (
    <Level>
      <Board />
    </Level>
  )
}

function Board() {
  const router = useRouter()
  const go = useTravel()
  const { t: c } = useTheme()
  const confirm = useConfirm()
  const territories = useTerritories()

  // Coming back to the board in the same tab starts from the list it last
  // showed (lib/studio/last-seen.ts) while the fresh one loads.
  const [projects, setProjects] = useState<ShelfProject[]>(() => lastSeenProjects.get() ?? [])
  const [drafts, setDrafts] = useState<ConceptualiseDraft[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() => (lastSeenProjects.get() ? 'ready' : 'loading'))
  const [errorCode, setErrorCode] = useState(0)
  const [trajectory, setTrajectory] = useState<Trajectory | null>(null)
  const [activeTab, setActiveTab] = useState<Column>('Active')
  const [dragged, setDragged] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<Column | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [peek, setPeek] = useState<ShelfProject | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null)
  const [showNewIdea, setShowNewIdea] = useState(false)
  const [bannerExpanded, setBannerExpanded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  // On a plan that carries a set number of projects, moving another into a
  // full Active is a swap (one there rests), and a resting one cannot come
  // back yet.
  const { plan } = usePlan()
  const limit = plan?.maxActiveProjects ?? null
  const [swap, setSwap] = useState<{ project: ShelfProject; holders: ShelfProject[]; after?: () => void } | null>(null)
  const [swapping, setSwapping] = useState(false)
  const [restingNote, setRestingNote] = useState<ShelfProject | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await api.projects.list()
      setProjects(res.projects)
      setStatus('ready')
    } catch (e) {
      setErrorCode(e instanceof ApiError ? e.status : 0)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void load()
    // Neither of these is worth failing the board over.
    fetch('/api/idea-lab/conceptualise/draft')
      .then((r) => (r.ok ? r.json() : { drafts: [] }))
      .then((d) => setDrafts(d.drafts || []))
      .catch(() => {})
    fetch('/api/trajectory/current')
      .then((r) => (r.ok ? r.json() : { trajectory: null }))
      .then((d) => setTrajectory(d.trajectory || null))
      .catch(() => {})
  }, [load])

  // Moves and deletions are applied here before the server answers, so the
  // remembered list follows the board rather than the last response.
  useEffect(() => {
    if (status === 'ready') lastSeenProjects.set(projects)
  }, [projects, status])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const columns = useMemo(() => {
    const recent = (a: ShelfProject, b: ShelfProject) =>
      at(b.last_opened_at) - at(a.last_opened_at) || at(b.created_at) - at(a.created_at) || a.id.localeCompare(b.id)
    const of = (stage: Stage) => projects.filter((p) => projectState(p) === stage)
    return {
      Queue: of('queued').sort(recent),
      Active: of('active').sort(recent),
      Completed: of('completed').sort((a, b) => at(b.completed_at) - at(a.completed_at) || recent(a, b)),
    }
  }, [projects])

  const counts: Record<Column, number> = {
    Queue: columns.Queue.length + drafts.length,
    Active: columns.Active.length,
    Completed: columns.Completed.length,
  }
  const columnColor: Record<Column, string> = { Queue: c.ochre, Active: c.verdant, Completed: c.violet }

  /** Optimistic: the card is already in its new column, so it must not jump back.
   *  With `resting`, the project that held the place goes to the Queue to rest. */
  const moveTo = useCallback((id: string, stage: Stage, resting?: string) => {
    setMenuFor(null)
    setProjects((prev) => prev.map((p) => {
      if (p.id === resting) return { ...p, shelf_stage: 'queued' as const, completed_at: null, resting_until: restEndsAt() }
      return p.id === id && projectState(p) !== stage
        ? { ...p, shelf_stage: stage, completed_at: stage === 'completed' ? new Date().toISOString() : null, ...(stage === 'active' ? { resting_until: null } : {}) }
        : p
    }))
    return api.projects.patch(id, { shelf_stage: stage, ...(resting ? { swap: true, rest_id: resting } : {}) }).catch(() => { void load() })
  }, [load])

  /** Into Active. Where the plan has a limit and Active is full, this asks which project rests. */
  const start = useCallback((p: ShelfProject, after?: () => void) => {
    setMenuFor(null)
    if (limit !== null) {
      if (isResting(p.resting_until)) { setRestingNote(p); return }
      const holders = columns.Active.filter((x) => x.id !== p.id)
      if (holders.length >= limit) { setSwap({ project: p, holders, after }); return }
    }
    void moveTo(p.id, 'active').then(after)
  }, [columns.Active, limit, moveTo])

  const move = useCallback((p: ShelfProject, stage: Stage) => {
    if (stage === 'active') start(p)
    else void moveTo(p.id, stage)
  }, [moveTo, start])

  const openCanvas = useCallback((id: string, from?: HTMLElement | null) => go(`/p/${id}`, 'in', from), [go])

  const open = useCallback((p: ShelfProject, from: HTMLElement) => {
    const stage = projectState(p)
    if (stage === 'queued') { setPeek(p); return }
    // A finished single piece goes to the reading room; a finished project of
    // several has no one text to read, so it opens on its canvas.
    const only = singlePiece(p)
    if (stage === 'completed' && only) { router.push(`/read?node_id=${only}`); return }
    openCanvas(p.id, from)
  }, [openCanvas, router])

  /** Optimistic, like a move: the card already shows its new name. */
  const rename = useCallback(() => {
    if (!renaming) return
    const title = renaming.title.trim().slice(0, 120)
    const { id } = renaming
    setRenaming(null)
    if (!title || projects.find((p) => p.id === id)?.title === title) return
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)))
    api.projects.patch(id, { title }).catch(() => { void load() })
  }, [load, projects, renaming])

  /** Deleting is for good, so it always asks first. */
  const remove = useCallback(async (p: ShelfProject) => {
    setMenuFor(null)
    const ok = await confirm({
      title: `Delete “${p.title.trim() || 'Untitled'}”?`,
      body: 'Everything written in it, its threads and its reflections go with it. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setProjects((prev) => prev.filter((x) => x.id !== p.id))
    api.projects.delete(p.id).catch(() => { void load() })
  }, [confirm, load])

  const discardDraft = useCallback(async (id: string) => {
    if (!(await confirm({ title: 'Discard this exploration?', body: 'The unfinished conversation is deleted.', confirmLabel: 'Discard', danger: true }))) return
    setDrafts((prev) => prev.filter((d) => d.id !== id))
    fetch(`/api/idea-lab/conceptualise/draft?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {})
  }, [confirm])

  const newIdea = () => {
    if (drafts.length > 0) setShowNewIdea(true)
    else router.push('/idea-lab')
  }

  const drop = (column: Column) => {
    const p = dragged ? projects.find((x) => x.id === dragged) : null
    if (p && projectState(p) !== STAGE_OF[column]) move(p, STAGE_OF[column])
    setDragged(null)
    setDragOver(null)
  }

  const columnEyebrow: React.CSSProperties = {
    color: c.textSecondary,
    fontSize: '11px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-geist-sans)',
    fontWeight: 600,
    margin: 0,
  }

  const header = (
    <PageHeader
      title="Project Board"
      actions={
        <IconButton onClick={newIdea} ariaLabel="New idea">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </IconButton>
      }
    />
  )

  if (status === 'loading') {
    return (
      <PageShell mood="verdant" fill>
        {header}
        <Container fill padding={0}>
          <div className="min-[1080px]:hidden flex" style={{ borderBottom: `1px solid ${c.divider}` }}>
            {COLUMNS.map((name) => (
              <div key={name} className="flex-1 py-3 flex items-center justify-center">
                <div className="h-3 w-14 rounded animate-pulse" style={{ backgroundColor: c.divider }} />
              </div>
            ))}
          </div>
          <div className="hidden min-[1080px]:flex flex-1" style={{ minHeight: 0 }}>
            {[{ width: '260px', border: true }, { width: undefined, border: true }, { width: '260px', border: false }].map((col, i) => (
              <div key={i} className="flex flex-col px-4 py-3 space-y-3" style={{ width: col.width, flex: col.width ? '0 0 auto' : '1 1 0%', borderRight: col.border ? `1px solid ${c.divider}` : 'none' }}>
                <div className="h-3 w-16 rounded animate-pulse mb-2" style={{ backgroundColor: c.divider }} />
                {[...Array(3)].map((_, j) => (
                  <div key={j} className="h-20 rounded-lg animate-pulse" style={{ backgroundColor: c.cardBg }} />
                ))}
              </div>
            ))}
          </div>
          <div className="min-[1080px]:hidden flex-1 px-4 py-3 space-y-3">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="h-20 rounded-lg animate-pulse" style={{ backgroundColor: c.cardBg }} />
            ))}
          </div>
        </Container>
      </PageShell>
    )
  }

  if (status === 'error') {
    return (
      <PageShell mood="verdant" fill>
        {header}
        <Container fill padding={32}>
          <p style={{ ...typeRoles.ui, fontSize: 14, color: c.textSecondary, margin: '0 0 16px' }}>
            {errorCode === 401 ? 'Sign in again to see your projects.' : 'The project board did not open.'}
          </p>
          <div>
            {errorCode === 401
              ? <GhostButton onClick={() => router.push('/login')}>Sign in</GhostButton>
              : <GhostButton onClick={() => { setStatus('loading'); void load() }}>Try again</GhostButton>}
          </div>
        </Container>
      </PageShell>
    )
  }

  const renderCard = (p: ShelfProject, column: Column, draggable: boolean) => {
    const color = columnColor[column]
    const large = column === 'Active' && draggable
    const title = p.title.trim() || 'Untitled'
    const pieces = p.root_ids?.length ?? 0
    const meta = [
      large && p.created_at ? dateFmt.format(new Date(p.created_at)) : null,
      p.arc || null,
      p.thematic_territory ? territories.label(p.thematic_territory) : null,
      pieces > 1 ? `${pieces} pieces` : null,
      limit !== null && column !== 'Active' && isResting(p.resting_until) ? `Resting until ${dayFmt.format(new Date(p.resting_until as string))}` : null,
    ].filter(Boolean)
    const menuOpen = menuFor === p.id
    return (
      <div
        key={p.id}
        className="group"
        draggable={draggable}
        onDragStart={draggable ? () => setDragged(p.id) : undefined}
        onDragEnd={draggable ? () => { setDragged(null); setDragOver(null) } : undefined}
        style={{
          position: 'relative',
          backgroundColor: c.cardBg,
          boxShadow: c.shadow,
          border: '1px solid transparent',
          borderRadius: '12px',
          transition: 'border-color 0.2s, opacity 0.2s',
          opacity: dragged === p.id ? 0.4 : 1,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = color }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'transparent' }}
      >
        <button
          onClick={(e) => open(p, e.currentTarget)}
          style={{
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            borderRadius: '12px',
            padding: large ? '16px 40px 16px 16px' : '12px 36px 12px 12px',
            cursor: draggable ? 'grab' : 'pointer',
            minHeight: large ? '108px' : '80px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <div
              style={{
                width: large ? '10px' : '8px',
                height: large ? '10px' : '8px',
                borderRadius: '50%',
                backgroundColor: color,
                flexShrink: 0,
                marginTop: '2px',
              }}
            />
            <p
              style={{
                color: c.textPrimary,
                fontWeight: 500,
                fontSize: large ? '15px' : '13px',
                margin: 0,
                whiteSpace: 'normal',
                wordWrap: 'break-word',
                lineHeight: '1.4',
              }}
            >
              {title}
            </p>
          </div>
          {meta.length > 0 && (
            <p style={{ color: c.textMuted, fontSize: large ? '12px' : '11px', margin: '8px 0 0 0' }}>
              {meta.join(' • ')}
            </p>
          )}
          {column === 'Active' && p.stage && (
            <div style={{ marginTop: 10 }}>
              <StageRibbon step={journeyStepFromStage(p.stage)} compact />
            </div>
          )}
        </button>

        {/* Renaming, moving and deleting live here so they work without a mouse to hover or drag with. */}
        <button
          onClick={() => setMenuFor(menuOpen ? null : p.id)}
          aria-label={`Rename, move or delete ${title}`}
          aria-expanded={menuOpen}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 28,
            height: 28,
            borderRadius: '50%',
            border: 'none',
            background: menuOpen ? c.cardBgInner : 'none',
            color: c.textMuted,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />
          </svg>
        </button>
        {menuOpen && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 12px 12px' }}>
            {COLUMNS.filter((name) => name !== column).map((name) => (
              <button
                key={name}
                onClick={() => move(p, STAGE_OF[name])}
                style={{
                  fontSize: 11, fontWeight: 500, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${c.divider}`, backgroundColor: c.cardBgInner, color: c.textSecondary,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: columnColor[name] }} />
                Move to {name}
              </button>
            ))}
            <button
              onClick={() => { setMenuFor(null); setRenaming({ id: p.id, title: p.title.trim() }) }}
              style={{
                fontSize: 11, fontWeight: 500, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${c.divider}`, backgroundColor: c.cardBgInner, color: c.textSecondary,
              }}
            >
              Rename
            </button>
            <button
              onClick={() => void remove(p)}
              style={{
                fontSize: 11, fontWeight: 500, padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${c.divider}`, backgroundColor: 'transparent', color: c.danger,
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    )
  }

  const renderDrafts = () => drafts.map((draft) => {
    const lastMsg = draft.messages[draft.messages.length - 1]
    const phaseLabel = PHASE_LABELS[draft.phase] ?? `Phase ${draft.phase}`
    return (
      <div key={draft.id} className="group" style={{ position: 'relative' }}>
        <button
          onClick={() => router.push(`/idea-lab/conceptualise?resume=${draft.id}`)}
          style={{
            width: '100%',
            textAlign: 'left',
            backgroundColor: c.cardBg,
            boxShadow: c.shadow,
            border: '1px solid rgba(165,63,43,0.28)',
            borderRadius: '12px',
            padding: '12px',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(165,63,43,0.55)' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(165,63,43,0.28)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'rgba(165,63,43,0.8)', flexShrink: 0 }} />
            <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(165,63,43,0.7)' }}>
              Unfinished · {phaseLabel}
            </span>
          </div>
          {lastMsg && (
            <p style={{ fontSize: '13px', color: c.textSecondary, margin: 0, lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {lastMsg.content}
            </p>
          )}
          <span style={{ fontSize: 11, color: 'rgba(165,63,43,0.7)', fontWeight: 500 }}>Resume exploration →</span>
        </button>
        <button
          onClick={() => void discardDraft(draft.id)}
          aria-label="Discard draft"
          className="opacity-100 min-[1080px]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
          style={{
            position: 'absolute',
            top: '-7px',
            right: '-7px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            border: `1px solid ${c.divider}`,
            backgroundColor: c.cardBg,
            boxShadow: c.shadow,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: c.textMuted,
            cursor: 'pointer',
            padding: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = c.danger }}
          onMouseLeave={(e) => { e.currentTarget.style.color = c.textMuted }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  })

  const emptyLine = (column: Column) => (
    <p style={{ fontSize: 12, color: c.textMuted, margin: '4px 2px' }}>
      {column === 'Queue' ? 'Nothing waiting.' : column === 'Active' ? 'Nothing in motion yet.' : 'Nothing finished yet.'}
    </p>
  )

  const desktopColumn = (column: Column) => {
    const side = column !== 'Active'
    return (
      <div
        key={column}
        className="flex flex-col transition-colors"
        style={{
          ...(side ? { width: '260px', flex: '0 0 auto' } : { flex: '1 1 0%', minWidth: 0 }),
          backgroundColor: dragOver === column ? c.cardBgInner : 'transparent',
          borderRight: column !== 'Completed' ? `1px solid ${c.divider}` : 'none',
        }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(column) }}
        onDragLeave={() => setDragOver((col) => (col === column ? null : col))}
        onDrop={(e) => { e.preventDefault(); drop(column) }}
      >
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.divider}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: columnColor[column] }} />
          <h2 style={columnEyebrow}>{column}</h2>
          <span style={{ color: c.textMuted, fontSize: '11px' }}>({counts[column]})</span>
        </div>
        <div className="board-scroll flex-1 overflow-y-auto px-4 py-3 pb-3 space-y-3">
          {column === 'Queue' && renderDrafts()}
          {columns[column].map((p) => renderCard(p, column, true))}
          {counts[column] === 0 && emptyLine(column)}
        </div>
      </div>
    )
  }

  const toneDot = trajectory?.tone ? c[toneHue[trajectory.tone]] ?? c.textPrimary : null

  return (
    <PageShell mood="verdant" fill>
      <style>{`
        .board-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .board-scroll::-webkit-scrollbar-track { background: transparent; }
        .board-scroll::-webkit-scrollbar-thumb { background-color: ${c.divider}; border-radius: 999px; }
        .board-scroll { scrollbar-width: thin; scrollbar-color: ${c.divider} transparent; }
      `}</style>

      {header}

      <Container fill padding={0}>
        {/* Tabs until there is room for three columns (1080px+). Deliberately wider
            than Tailwind's md: a portrait iPad (744-1024px) cannot fit two fixed
            260px columns plus a readable Active column. */}
        <div className="min-[1080px]:hidden flex" style={{ borderBottom: `1px solid ${c.divider}` }}>
          {COLUMNS.map((name) => (
            <button
              key={name}
              onClick={() => setActiveTab(name)}
              aria-pressed={activeTab === name}
              style={{
                flex: 1,
                padding: '12px',
                border: 'none',
                backgroundColor: activeTab === name ? c.cardBg : 'transparent',
                borderBottom: activeTab === name ? `2px solid ${columnColor[name]}` : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: columnColor[name] }} />
              <span style={{ color: c.textPrimary, fontSize: '12px', fontWeight: 500 }}>{name}</span>
              <span style={{ color: c.textMuted, fontSize: '11px' }}>({counts[name]})</span>
            </button>
          ))}
        </div>

        <div className="hidden min-[1080px]:flex flex-1" style={{ minHeight: 0 }}>
          {COLUMNS.map(desktopColumn)}
        </div>

        <div className="board-scroll min-[1080px]:hidden flex-1 overflow-y-auto px-4 py-3 pb-3">
          <div className="space-y-3">
            {activeTab === 'Queue' && renderDrafts()}
            {columns[activeTab].map((p) => renderCard(p, activeTab, false))}
            {counts[activeTab] === 0 && emptyLine(activeTab)}
          </div>
        </div>

        {/* Trajectory: its own floating card, divided from the board above */}
        <div style={{ borderTop: `1px solid ${c.divider}`, padding: '16px', flexShrink: 0 }}>
          <div
            className="flex items-center justify-between gap-4"
            style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '16px', padding: '14px 20px' }}
          >
            <div className="min-w-0 flex-1" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              {toneDot && (
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: toneDot, flexShrink: 0, marginTop: '5px' }} />
              )}
              {trajectory ? (
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ position: 'relative' }}>
                    <p style={{
                      fontSize: '14px',
                      lineHeight: 1.5,
                      color: c.textPrimary,
                      margin: 0,
                      ...(isMobile && !bannerExpanded ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}),
                    }}>
                      {trajectory.statement}
                    </p>
                    {isMobile && !bannerExpanded && (
                      <div aria-hidden style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '28px', background: `linear-gradient(to bottom, transparent, ${c.cardBg})`, pointerEvents: 'none' }} />
                    )}
                  </div>
                  {isMobile && !bannerExpanded && (
                    <button
                      onClick={() => setBannerExpanded(true)}
                      style={{ marginTop: '4px', fontSize: '11px', letterSpacing: '0.04em', color: c.textMuted, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      See more ↓
                    </button>
                  )}
                </div>
              ) : (
                <p style={{ fontSize: '13px', color: c.textMuted, margin: 0 }}>No trajectory set yet</p>
              )}
            </div>
            <button
              onClick={() => router.push('/zoom-out')}
              className="rounded-lg transition-opacity whitespace-nowrap flex-shrink-0 hover:opacity-85"
              style={{ fontFamily: 'var(--font-geist-sans)', fontWeight: 600, fontSize: '13px', padding: '8px 16px', backgroundColor: c.ember, color: '#ffffff', border: 'none', cursor: 'pointer' }}
            >
              {trajectory ? 'Zoom out' : 'Find your direction'}
            </button>
          </div>
        </div>
      </Container>

      {peek && (
        <ModalDialog
          onClose={() => setPeek(null)}
          title={peek.title.trim() || 'Untitled'}
          subtitle={[peek.arc, peek.thematic_territory ? territories.label(peek.thematic_territory) : null].filter(Boolean).map((v, i) => <span key={i}>{v}</span>)}
          footer={
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
              <GhostButton onClick={() => { const id = peek.id; setPeek(null); openCanvas(id) }}>{limit !== null ? 'Just read it' : 'Open without starting'}</GhostButton>
              <PrimaryButton onClick={() => { const p = peek; setPeek(null); start(p, () => openCanvas(p.id)) }}>
                {workedOn(peek) ? 'Carry on with it' : 'Start working on it'}
              </PrimaryButton>
            </div>
          }
        >
          <p style={{ ...typeRoles.ui, fontSize: 15, lineHeight: 1.6, color: (peek.concept_body || peek.intent) ? c.textPrimary : c.textMuted, margin: 0, whiteSpace: 'pre-wrap' }}>
            {peek.concept_body || peek.intent || (workedOn(peek) ? 'No core concept written for this one.' : 'Nothing written about this one yet.')}
          </p>
          {workedOn(peek) && (
            <p style={{ ...typeRoles.small, fontSize: 13, lineHeight: 1.55, color: c.textMuted, margin: '14px 0 0' }}>
              {(peek.root_ids?.length ?? 0) > 1 ? `Its ${peek.root_ids.length} pieces are` : 'Everything in it is'} as you left {(peek.root_ids?.length ?? 0) > 1 ? 'them' : 'it'}.
              {limit !== null && isResting(peek.resting_until) ? ` It is resting until ${dayFmt.format(new Date(peek.resting_until as string))}; until then you can read and export it.` : ''}
            </p>
          )}
        </ModalDialog>
      )}

      {swap && (
        <SwapNote
          plan={plan?.plan ?? 'practice'}
          title={swap.project.title}
          holders={swap.holders}
          busy={swapping}
          onClose={() => setSwap(null)}
          onConfirm={(restId) => {
            const { project, after } = swap
            setSwapping(true)
            void moveTo(project.id, 'active', restId).then(() => { setSwapping(false); setSwap(null); after?.() })
          }}
        />
      )}

      {restingNote && (
        <PlanNote title={`“${restingNote.title.trim() || 'Untitled'}” is resting`} onClose={() => setRestingNote(null)}>
          <p style={{ margin: 0 }}>
            It gave up its place to another project, so it rests until {dayFmt.format(new Date(restingNote.resting_until as string))}.
            Until then you can read and export it. On Direction, every project stays open at once.
          </p>
        </PlanNote>
      )}

      {renaming && (
        <ModalDialog
          onClose={() => setRenaming(null)}
          title="Rename"
          maxWidth="440px"
          footer={
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
              <GhostButton onClick={() => setRenaming(null)}>Cancel</GhostButton>
              <PrimaryButton onClick={rename} disabled={!renaming.title.trim()}>Save</PrimaryButton>
            </div>
          }
        >
          <TextField
            value={renaming.title}
            onChange={(title) => setRenaming((r) => (r ? { ...r, title: title.slice(0, 120) } : r))}
            ariaLabel="Name"
            placeholder="Untitled"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') rename() }}
          />
        </ModalDialog>
      )}

      {showNewIdea && (
        <ModalDialog
          onClose={() => setShowNewIdea(false)}
          title="Start something new?"
          footer={
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
              <GhostButton onClick={() => { setShowNewIdea(false); setActiveTab('Queue') }}>Go back to one of those</GhostButton>
              <PrimaryButton onClick={() => router.push('/idea-lab')}>New idea</PrimaryButton>
            </div>
          }
        >
          <p style={{ ...typeRoles.ui, fontSize: 15, lineHeight: 1.6, color: c.textPrimary, margin: 0 }}>
            You have {drafts.length === 1 ? 'an unfinished exploration' : `${drafts.length} unfinished explorations`} waiting in the Queue.
          </p>
        </ModalDialog>
      )}
    </PageShell>
  )
}
