'use client'

// studio/src/components/work/work-page.tsx — levels 2 and 1 of one project.
//
//   level 2  the board    a canvas: the pieces across it, the threads beneath
//   level 1  the writing  a page: one piece, its parts, and nothing else
//
// They are deliberately different surfaces. Vision is spatial and wants room
// to be moved around in; writing is linear and wants to be left alone. So the
// board is a bounded canvas with everything on glass over it, and the writing
// is a quiet column with its tools on the rail, out of the way.
//
// Depth is never presented. A project opens as its pieces; parts appear inside
// a piece when the work asks for them; nothing here is hard-coded to a depth.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Container, PageHeader, PageShell } from '@/components/shell/page-shell'
import { Dock } from '@/components/shell/dock'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { CanvasStage, StageHeader } from '@/components/studio/surface/stage'
import { Level, useTravel } from '@/components/studio/surface/travel'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'
import { LEVELS } from '@/lib/studio/levels'
import type { CheckOutcome, Rule, Thread, TreeNode } from '@/lib/studio/node-types'
import { useWork } from '@/lib/studio/use-work'
import { appearancesOf, findNode, newRule, pathTo, rulesInForce, wordCount } from '@/lib/studio/tree'
import { Board, type BoardActions, type BoardTourHandle } from '@/components/studio/work/board'
import { Studio, type StudioHandle } from '@/components/studio/work/studio'
import { ThreadRead } from '@/components/studio/work/thread-read'
import { Companion, type ProposedEdit } from '@/components/studio/work/companion'
import { CompanionLauncher, Drawer, PART_TOOLS, PIECE_TOOLS, Rail, RAIL_TOOLS, type RailKey } from '@/components/studio/work/rail'
import { VisionRoom, type RoomOrigin } from '@/components/studio/work/vision-room'
import { visionOf } from '@/lib/studio/vision/state'
import { CheckCard, RuleList } from '@/components/studio/work/rules'
import { Empty, InlineField, Label, TitleField, Trail, useNarrow, useRoomBeside, useStackedLayout } from '@/components/studio/work/bits'
import { AnchorsPanel, ConceptPanel, PieceFooter, TasksPanel, isWritingTask, usePieceTools } from '@/components/studio/work/write-tools'
import { AssistantPanel, useWritingAssistant } from '@/components/studio/work/writing-assistant'
import { useWritingTimeTracker } from '@/lib/use-writing-time'
import { HistoryPanel } from '@/components/studio/work/history-panel'
import { ThreadSuggestionCard, useThreadSuggestions } from '@/components/studio/work/thread-suggestions'
import { CarriedCard } from '@/components/studio/work/carried-card'
import { PlanBanner } from '@/components/studio/work/plan-banner'
import { ExampleBanner } from '@/components/studio/work/example-banner'
import { forgetLayout } from '@/lib/examples/layout'
import { useNoHover, usePhone } from '@/lib/use-phone'
import { ExampleTour, type RoomMove } from '@/components/studio/work/example-tour'
import { EXAMPLE_PRACTICES, pieceTourSteps, tourSteps, type TourStep } from '@/lib/examples/tour-script'
import { useExampleTour } from '@/lib/examples/use-example-tour'
import { PlanNote } from '@/components/billing/plan-note'
import { loadPlan, usePlan } from '@/lib/billing/use-plan'
import { noteOpened } from '@/lib/studio/opened'
import { EXAMPLE_FRAME } from '@/lib/examples/arrangement'
import { useBoardItems } from '@/lib/studio/use-board-items'
import type { PlusChoice } from '@/components/studio/work/board-items'

export type Focus =
  | { kind: 'project' }
  | { kind: 'node'; id: string }
  | { kind: 'thread'; id: string }

type View = 'write' | 'flow'

export function WorkPage({ projectId, focus, straightToWriting = false }: {
  projectId: string
  focus: Focus
  /** Opened from outside the Project Board (Home, Idea Lab, a check-in): a
   *  single piece of writing goes straight to its words instead of the canvas. */
  straightToWriting?: boolean
}) {
  return (
    <Level>
      <Work projectId={projectId} focus={focus} straightToWriting={straightToWriting} />
    </Level>
  )
}

const PROJECT_FOCUS: Focus = { kind: 'project' }

/** A project at its own address (/p/[id]). `?write=1` is how Home and the
 *  other ways in from outside the Project Board ask for the words instead of
 *  the canvas; it is read here, in the browser, so the page itself never
 *  depends on the request and can be served from cache. */
export function ProjectWorkPage({ projectId }: { projectId: string }) {
  return (
    <Suspense fallback={null}>
      <ProjectWorkFromUrl projectId={projectId} />
    </Suspense>
  )
}

function ProjectWorkFromUrl({ projectId }: { projectId: string }) {
  const straightToWriting = useSearchParams().get('write') === '1'
  return <WorkPage projectId={projectId} focus={PROJECT_FOCUS} straightToWriting={straightToWriting} />
}

function Work({ projectId, focus, straightToWriting }: { projectId: string; focus: Focus; straightToWriting: boolean }) {
  const { t } = useTheme()
  const router = useRouter()
  const go = useTravel()
  const confirm = useConfirm()
  const { state, project, tree, roots, api, saving, tagFor, access } = useWork(projectId)
  // The images, recordings and task lists on the canvas; only the canvas asks for them.
  const board = useBoardItems(projectId, focus.kind === 'project')
  // What the plan does not carry, when it is asked for: said once, with the way to the plans.
  const [planNote, setPlanNote] = useState<'thread' | 'media' | 'talk' | null>(null)
  const [view, setView] = useState<View>('write')
  const [rail, setRail] = useState<RailKey | null>(null)
  // The room the canvas's "Talk about the vision" opens, and where on the
  // window it opens out of (the button that was pressed).
  const [visionRoom, setVisionRoom] = useState<{ origin: RoomOrigin | null } | null>(null)
  // The example tour drives the room as it walks through it: which half a
  // narrow room shows, and when it closes again.
  const [roomTour, setRoomTour] = useState<{ tab?: 'page' | 'talk'; close?: boolean } | undefined>(undefined)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkNote, setCheckNote] = useState<string | null>(null)
  const roomBeside = useRoomBeside()
  // A phone-width window: an open panel covers the page, and the rail,
  // the section marks and the storyline all share the one bottom corner.
  const narrow = useNarrow()
  const [storylineOpen, setStorylineOpen] = useState(false)

  // What's highlighted right now in the piece being written, and any change
  // to the text the writing assistant was asked for — the thread connecting
  // Studio (which owns the editors) and the assistant (which owns the request).
  const [selection, setSelection] = useState<{ nodeId: string; text: string } | null>(null)
  const [proposal, setProposal] = useState<ProposedEdit | null>(null)

  const goNode = useCallback((id: string, from?: HTMLElement | null) => {
    go(`/p/${projectId}/n/${id}`, 'in', from)
  }, [go, projectId])
  const goThread = useCallback((id: string) => router.push(`/p/${projectId}/thread/${id}`), [projectId, router])
  const goProject = useCallback((from?: HTMLElement | null) => {
    go(`/p/${projectId}`, 'out', from)
  }, [go, projectId])
  const goShelf = useCallback((from?: HTMLElement | null) => go('/project-board', 'out', from), [go])

  const node = focus.kind === 'node' ? findNode(roots, focus.id) : null
  const thread: Thread | null =
    focus.kind === 'thread' ? tree.threads.find((th) => th.id === focus.id) ?? null : null
  const trail = useMemo(() => (node ? pathTo(roots, node.id) : []), [roots, node])
  const parent = trail.length > 1 ? trail[trail.length - 2] : null

  // Going into a piece is engagement with it, and the only kind that writes
  // no row: someone can open a piece, read it and leave it exactly as it was.
  // The browser keeps that note so the canvas opens there next time (see
  // lib/studio/opened.ts). A part counts for the whole piece it belongs to.
  const openedPiece = trail[0]?.id ?? null
  useEffect(() => {
    if (openedPiece) noteOpened(projectId, openedPiece)
  }, [projectId, openedPiece])
  // Read, never changed: a project that is over, or one the plan is not
  // carrying right now (lib/studio/plan-access.ts). With no word from the
  // server about the plan, nothing is locked.
  const readOnly = project?.status !== 'active' || access?.workable === false
  const canThread = access?.threads ?? true
  const canMedia = access?.media ?? true
  const canTalkVision = access?.visionTalk ?? true
  // On a phone the board is for looking and for opening a piece (board.tsx
  // says so in a banner): nothing waiting on an answer is offered there.
  // "Talk about the vision" is, since 2026-10-18: the room is a conversation.
  const phone = usePhone()
  const hasCompanion = access?.companion ?? true

  // The plan changed while this project was open (a free month ran out, a
  // move up or down): what it allows here is read again, once per change,
  // so the tools close or open without the page being reloaded.
  const livePlan = usePlan().plan?.plan
  const reReadFor = useRef<string | null>(null)
  useEffect(() => {
    if (!livePlan || !access || livePlan === access.plan || reReadFor.current === livePlan) return
    reReadFor.current = livePlan
    void api.refresh()
  }, [access, api, livePlan])
  // And a room the plan no longer opens does not stay open over it.
  useEffect(() => {
    if (!canTalkVision) setVisionRoom(null)
  }, [canTalkVision])

  // A whole piece (not a part of one) carries the Write page's tools with it.
  const isRootPiece = focus.kind === 'node' && !!node && !node.parent_id

  // An example piece opens with its core concept out on the rail, since the
  // concept is most of what it is there to show. Not on a phone, where an
  // open panel covers the writing.
  const exampleConceptFor = useRef<string | null>(null)
  useEffect(() => {
    if (access?.reason !== 'example' || !isRootPiece || !node || narrow) return
    if (exampleConceptFor.current === node.id) return
    exampleConceptFor.current = node.id
    setRail('concept')
  }, [access?.reason, isRootPiece, node, narrow])
  const tools = usePieceTools(isRootPiece && node ? node.id : null)
  const [shaping, setShaping] = useState<'shape' | 'place' | 'divide' | null>(null)
  const [shapeNote, setShapeNote] = useState<string | null>(null)
  const studio = useRef<StudioHandle | null>(null)
  const stacked = useStackedLayout()
  const sheeted = rail === 'assistant' && stacked
  const [activePartId, setActivePartId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Record<string, string>>({})
  const chat = useWritingAssistant({
    projectId,
    nodeId: isRootPiece && node ? node.id : null,
    parts: node && isRootPiece ? (node.children.length > 0 ? node.children : [node]) : [],
    activePartId,
    selection,
    lines: tools.lines,
    onProposedEdit: setProposal,
    onClearSelection: () => setSelection(null),
  })
  // Time spent writing feeds the Inner Weather strip on days with no check-in.
  useWritingTimeTracker(focus.kind === 'node' && !!node)
  // With the assistant up as a sheet, the part being written is brought into the visible half.
  useEffect(() => { if (sheeted && activePartId) studio.current?.reveal(activePartId) }, [sheeted, activePartId])

  const focusKey = focus.kind === 'project' ? 'project' : `${focus.kind}:${focus.id}`
  useEffect(() => { setCheckNote(null); setShapeNote(null); setActivePartId(null); setSuggestions({}) }, [focusKey])

  const appearancesFor = useCallback((threadId: string) => appearancesOf(roots, threadId), [roots])

  const openChecks = useMemo(
    () => (node ? tree.open_checks.filter((c) => c.node_id === node.id) : tree.open_checks),
    [tree.open_checks, node],
  )

  const projectRules = useMemo(
    () => ((project?.rules ?? []) as Rule[]).filter((r) => r && typeof r.id === 'string'),
    [project],
  )

  const inherited = useMemo(() => {
    const live = projectRules.filter((r) => !r.retired_at).map((rule) => ({ rule, from: 'the project' }))
    if (!node) return live
    const above = rulesInForce(roots, node.id).filter((r) => r.inherited)
    return [...live, ...above.map(({ rule, source }) => ({ rule, from: source.title || 'above' }))]
  }, [node, roots, projectRules])

  const setProjectField = api.editProject

  const runCheck = useCallback(async (nodeId: string) => {
    setChecking(true)
    setCheckNote(null)
    const res = await api.runCheck(nodeId)
    setChecking(false)
    if (res.checks.length === 0) setCheckNote(res.reason ?? 'Nothing collided.')
    else setRail(null)
  }, [api])

  /** Finishing a piece or part is a boundary: it is read against the rules in
   *  force, quietly. A question only appears if something collides; the
   *  server skips the reading entirely when no rules apply. */
  const editNodeAtBoundary = useCallback(async (id: string, patch: Partial<TreeNode>) => {
    await api.editNode(id, patch)
    if (patch.status === 'done') void api.runCheck(id)
  }, [api])

  /** Amending retires the old wording wherever it lives and puts the new one in
   *  its place. This is the only way a rule changes after a collision. */
  const amendRule = useCallback(async (checkId: string, newText: string) => {
    const check = tree.open_checks.find((c) => c.id === checkId)
    if (!check) return
    const swap = (rules: Rule[]) => rules.map((r) => (r.id === check.rule_id ? { ...r, text: newText } : r))
    if (check.source_thread_id) {
      const th = tree.threads.find((x) => x.id === check.source_thread_id)
      if (th) await api.editThread(th.id, { rules: swap(th.rules) })
      return
    }
    if (check.source_node_id) {
      const owner = findNode(roots, check.source_node_id)
      if (owner) { await api.editNode(owner.id, { rules: swap(owner.rules) }); return }
    }
    await setProjectField({ rules: swap(projectRules) })
  }, [api, projectRules, roots, setProjectField, tree.open_checks, tree.threads])

  const resolve = useCallback(
    (checkId: string, outcome: CheckOutcome, note?: string) => void api.resolveCheck(checkId, outcome, note),
    [api],
  )

  /** Removing a part takes everything under it, so it always says what else goes. */
  const removeNode = useCallback(async (target: TreeNode) => {
    const inside = target.children.length
    const ok = await confirm({
      title: `Delete “${target.title || 'this part'}”?`,
      body: inside > 0
        ? `Everything inside it goes too — ${inside} ${inside === 1 ? 'part' : 'parts'}. This cannot be undone.`
        : 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    const up = pathTo(roots, target.id)
    const above = up.length > 1 ? up[up.length - 2] : null
    await api.removeNode(target.id)
    if (focus.kind === 'node' && focus.id === target.id) {
      if (above) goNode(above.id)
      else goProject()
    }
  }, [api, confirm, focus, goNode, goProject, roots])

  /** Breaking something open must never hide what is already written. */
  const breakIntoParts = useCallback(async (target: TreeNode) => {
    const hasWords = target.body.trim().length > 0
    const first = await api.addNode(target.id)
    if (!first) return
    if (hasWords) {
      await api.editNode(first.id, {
        title: target.title || '', body: target.body, beat: target.beat, status: target.status,
      })
      await api.editNode(target.id, { status: 'open' })
    }
  }, [api])

  /**
   * A thread that reaches every piece has stopped being a thread. Its words
   * become a rule on the project — where they get teeth — and the thread and
   * all its marks come off the board.
   */
  const makeConstraint = useCallback(async (th: Thread) => {
    const words = [th.intent.trim() || th.name.trim(), ...th.rules.filter((r) => !r.retired_at).map((r) => r.text)]
    const additions = words.filter(Boolean).map(newRule)
    if (additions.length) await setProjectField({ rules: [...projectRules, ...additions] })
    await api.removeThread(th.id)
  }, [api, projectRules, setProjectField])

  /** Taking an item off the canvas. The board asks about the ones worth asking
   *  about and holds the request for a few seconds afterwards, so by the time
   *  this runs the answer is already in. */
  const removeItem = useCallback(async (item: { id: string }) => {
    await board.api.remove(item.id)
  }, [board.api])

  /** Shaping, placing and dividing are routes that write the parts themselves, so the tree is read again afterwards. */
  const reshape = useCallback(async (kind: 'shape' | 'place' | 'divide', pieceId: string, alreadyParts = false) => {
    if (shaping) return
    if (kind === 'divide' && alreadyParts) {
      const ok = await confirm({
        title: 'Cut the draft along its beats?',
        body: 'The words stay exactly as they are, in order. The parts are cut again, so their names, and where fragments were placed, start over.',
        confirmLabel: 'Divide',
      })
      if (!ok) return
    }
    setShaping(kind)
    setShapeNote(null)
    try {
      await studio.current?.flush()
      const res = await fetch(`/api/write/sections/${kind === 'shape' ? 'seed' : kind === 'place' ? 'ingest' : 'divide'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ node_id: pieceId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setShapeNote(typeof data.error === 'string' ? data.error : 'That did not work. Try again in a moment.')
        return
      }
      // Loose guidance for each empty part, shown until something is written in it.
      if (kind === 'shape' && Array.isArray(data.sections) && Array.isArray(data.suggestions)) {
        setSuggestions(Object.fromEntries(
          (data.sections as Array<{ id: string }>).map((s, i) => [s.id, String(data.suggestions[i] ?? '')]).filter(([, v]) => v),
        ))
      }
      await api.refresh()
      await tools.reloadLines()
      if (kind === 'place') {
        setShapeNote(data.type === 'loose'
          ? 'Your notes are now fragments, placed in the sections that suit them.'
          : 'Your draft has been placed across the sections drawn from its emotional journey.')
      }
    } catch {
      setShapeNote('That did not work. Try again in a moment.')
    } finally {
      setShaping(null)
    }
  }, [api, confirm, shaping, tools])

  /** Everything typed is saved first, so Test reads the draft as it stands. */
  const saveBeforeLeaving = useCallback(async () => {
    await studio.current?.flush()
  }, [])

  const isExampleProject = access?.reason === 'example'
  const boardActions: BoardActions = useMemo(() => ({
    openPiece: (id, from) => goNode(id, from),
    addPiece: (x) => void api.addNode(null).then((made) => {
      // Something stands at the end of the lane: the new piece goes past it.
      if (made && x !== null) void api.editNode(made.id, { board_x: x })
    }),
    // Nothing is made here. The piece is worked out first and created at the
    // end of that, by the core concept's own save — so backing out of the
    // conversation leaves no empty piece behind on the canvas.
    conceptualisePiece: (x) => router.push(
      `/idea-lab/conceptualise?project=${projectId}${x === null ? '' : `&at=${Math.round(x)}`}`,
    ),
    removePiece: (piece) => void removeNode(piece),
    renamePiece: (id, title) => void api.editNode(id, { title }),
    reorder: (ids) => void api.reorderRoots(ids),
    movePiece: (id, at) => void api.editNode(id, { board_x: at?.x ?? null, board_y: at?.y ?? null }),
    addThread: (hue) => api.addThread(hue),
    editThread: (id, patch) => void api.editThread(id, patch),
    removeThread: (id) => void api.removeThread(id),
    moveThread: (id, at) => void api.editThread(id, { board_x: at?.x ?? null, board_y: at?.y ?? null }),
    tag: (nodeId, threadId, note) => void api.tag(nodeId, threadId, note),
    untag: (nodeId, threadId) => void api.untag(nodeId, threadId),
    makeConstraint: (th) => void makeConstraint(th),
    readThread: goThread,
    renameProject: (title) => void setProjectField({ title }),
    editProjectIntent: (intent) => void setProjectField({ intent }),
    editProjectRules: (rules) => void setProjectField({ rules }),
    addTaskList: (pieceId) => board.api.addTasks(pieceId),
    addPalette: (pieceId) => board.api.addPalette(pieceId),
    addLink: (pieceId) => board.api.addLink(pieceId),
    addImage: (pieceId, file) => board.api.addImage(pieceId, file),
    addRecording: (pieceId, file, opts) => board.api.addRecording(pieceId, file, opts),
    patchItem: (id, patch) => void board.api.patch(id, patch),
    removeItem: (item) => void removeItem(item),
    toggleTask: (task) => void board.api.toggleTask(task),
    addTask: (nodeId, title, category) => board.api.addTask(nodeId, title, category),
    removeTask: (task) => void board.api.removeTask(task),
    reorderTasks: (ids) => void board.api.reorderTasks(ids),
    refreshAsset: (assetId) => void board.api.refreshAsset(assetId),
    onLocked: (choice: PlusChoice) => setPlanNote(choice === 'thread' ? 'thread' : 'media'),
    // An example (lib/examples) can be rearranged and nothing else: a move is
    // kept in this browser instead of being sent, and any other change is never made.
    ...(isExampleProject ? {
      movePiece: (id: string, at: { x: number; y: number } | null) => api.placeLocal('node', id, at),
      moveThread: (id: string, at: { x: number; y: number } | null) => api.placeLocal('thread', id, at),
      patchItem: (id: string, patch: { board_x?: number | null; board_y?: number | null; w?: number | null; content?: { title?: string; rows?: number } }) => {
        // A size, or a palette's or recording's name: the other things an example lets you change.
        const c = patch.content
        if (typeof patch.w === 'number' || typeof c?.title === 'string' || typeof c?.rows === 'number') {
          board.api.editLocal(id, {
            ...(typeof patch.w === 'number' ? { w: patch.w } : {}),
            ...(typeof c?.title === 'string' ? { title: c.title } : {}),
            ...(typeof c?.rows === 'number' ? { rows: c.rows } : {}),
          })
        }
        if ('board_x' in patch || 'board_y' in patch) {
          board.api.placeLocal(id, patch.board_x === null || patch.board_x === undefined || patch.board_y === null || patch.board_y === undefined ? null : { x: patch.board_x, y: patch.board_y })
        }
      },
    } : {}),
  }), [isExampleProject, api, board.api, board.items, goNode, goThread, makeConstraint, projectId, removeItem, removeNode, roots, router, setProjectField, tree.threads])

  // Every project has a canvas, a single piece of writing included: threads
  // go under it and more pieces beside it. The Project Board always opens that
  // canvas. Home and the other ways in ask for the words instead when there is
  // exactly one piece and nothing running across it yet. Derived, not
  // persisted: add a second piece or a thread and it stops matching.
  const lonePiece = roots.length === 1 && roots[0].threads.length === 0 && !project?.settings?.board
    ? roots[0]
    : null
  const singlePieceNode = focus.kind === 'project' && straightToWriting ? lonePiece : null
  // Things sent here from a check-in, waiting on an answer. An answered card
  // is hidden at once and the tree re-read, since approving makes a thread.
  const [answeredCarried, setAnsweredCarried] = useState<string[]>([])
  const carried = (project?.settings?.carried ?? []).filter((c) => !answeredCarried.includes(c.id))
  const carriedCards = carried.map((thought) => (
    <CarriedCard
      key={thought.id}
      projectId={projectId}
      thought={thought}
      pieces={roots.map((r) => ({ id: r.id, title: r.title }))}
      asFragment={!canThread}
      disabled={readOnly}
      onAnswered={() => { setAnsweredCarried((prev) => [...prev, thought.id]); void api.refresh() }}
    />
  ))

  // The plan is not carrying this project right now: said where the other
  // notices sit, with the way through. An example project (lib/examples)
  // says what it is instead, in the same place.
  // The example's banner stands on its canvas only: inside a piece or the
  // vision room the page is left to speak for itself.
  const example = access?.reason === 'example' ? project?.settings?.example ?? null : null

  // ── the walk round an example, the first time one is opened ───────────────
  const tourHandle = useRef<BoardTourHandle | null>(null)
  const noHover = useNoHover()
  const tourDue = useExampleTour(!!example && focus.kind === 'project' && state.status === 'ready')
  const [touring, setTouring] = useState<TourStep[] | null>(null)
  const tourStarted = useRef(false)
  useEffect(() => {
    if (!tourDue.due || !example || tourStarted.current || !board.ready) return
    // The board has had a moment to measure and settle its opening view first.
    const id = window.setTimeout(() => {
      if (tourStarted.current) return
      tourStarted.current = true
      setTouring(tourSteps({
        pieces: roots.map((r) => ({ id: r.id })),
        threads: tree.threads.map((th) => ({ id: th.id, name: th.name, on: [...new Set(appearancesFor(th.id).map((a) => a.rootId))] })),
        items: board.items.map((it) => ({ id: it.id, kind: it.kind, on: it.node_ids })),
        practices: tourDue.due?.practices ?? [],
        exampleFor: EXAMPLE_PRACTICES[example.key] ?? [],
        phone: noHover,
      }))
      tourDue.markSeen()
    }, 1100)
    return () => window.clearTimeout(id)
  }, [appearancesFor, board.items, board.ready, example, noHover, roots, tourDue, tree.threads])
  // And the writing page's own walk, the first time an example's piece is opened.
  const pieceTourDue = useExampleTour(!!example && focus.kind === 'node' && isRootPiece && state.status === 'ready', 'piece')
  const [pieceTouring, setPieceTouring] = useState<TourStep[] | null>(null)
  const pieceTourStarted = useRef(false)
  useEffect(() => {
    if (!pieceTourDue.due || !example || pieceTourStarted.current) return
    const id = window.setTimeout(() => {
      if (pieceTourStarted.current) return
      pieceTourStarted.current = true
      setPieceTouring(pieceTourSteps({ practices: pieceTourDue.due?.practices ?? [], exampleFor: EXAMPLE_PRACTICES[example.key] ?? [] }))
      pieceTourDue.markSeen()
    }, 1000)
    return () => window.clearTimeout(id)
  }, [example, pieceTourDue])

  const onTourRoom = useCallback((move: RoomMove, from: { x: number; y: number } | null) => {
    if (move === 'open') { setRail(null); setVisionRoom({ origin: from }); setRoomTour({ tab: 'page' }); return }
    if (move === 'close') { setRoomTour((cur) => ({ ...cur, close: true })); return }
    setRoomTour((cur) => ({ ...cur, tab: move }))
  }, [])
  const planBanner = example
    ? (focus.kind === 'project' ? [<ExampleBanner key="example" who={example.who} note={example.note} onPutBack={() => { forgetLayout(projectId); void api.refresh(); void board.api.reload() }} />] : [])
    : access && !access.workable && project
    ? [
      <PlanBanner
        key="plan"
        projectId={projectId}
        title={project.title}
        access={access}
        onSwitched={() => { void loadPlan(true); void api.reload() }}
      />,
    ]
    : []

  // Only on the board itself, and only once there are enough pieces for
  // something to run across some of them without running across all.
  const onBoard = focus.kind === 'project' && state.status === 'ready' && !singlePieceNode && roots.length >= 3 && !readOnly && canThread
  const refreshTree = api.refresh
  const threadIdeas = useThreadSuggestions(projectId, onBoard, useCallback(() => void refreshTree(), [refreshTree]))

  useEffect(() => {
    if (state.status !== 'ready' || !singlePieceNode) return
    router.replace(`/p/${projectId}/n/${singlePieceNode.id}`)
  }, [state.status, singlePieceNode, projectId, router])

  // ── loading and error ─────────────────────────────────────────────────────
  if (state.status === 'loading') {
    return (
      <>
        <CanvasStage header={<StageHeader onUp={goShelf} upLabel={`Back to ${LEVELS.shelf.name}`} upText={LEVELS.shelf.name} />}>
          <span />
        </CanvasStage>
        <Dock />
      </>
    )
  }
  if (state.status === 'error' || !project) {
    return (
      <PageShell mood="neutral">
        <PageHeader eyebrow={null} title="It did not open" size="md" />
        <Container padding={32}>
          <p style={{ ...canvasType.body, color: t.textSecondary, margin: '0 0 16px' }}>
            {state.status === 'error' ? state.message : 'The project is missing.'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <QuietButton onClick={() => void api.reload()}>Try again</QuietButton>
            <GhostButton onClick={() => router.push('/project-board')}>Back to the project board</GhostButton>
          </div>
        </Container>
      </PageShell>
    )
  }

  // What the rail is standing over: a part, or the whole project.
  const scopeNode = focus.kind === 'node' ? node : null
  const scopeRules = scopeNode ? scopeNode.rules : projectRules
  const scopeIntent = scopeNode ? scopeNode.intent : (project.intent ?? '')
  const liveRuleCount = scopeRules.filter((r) => !r.retired_at).length

  const setScopeRules = (rules: Rule[]) => {
    if (scopeNode) void api.editNode(scopeNode.id, { rules })
    else void setProjectField({ rules })
  }
  const setScopeIntent = (intent: string) => {
    if (scopeNode) void api.editNode(scopeNode.id, { intent })
    else void setProjectField({ intent })
  }

  const railTitle = RAIL_TOOLS.find((x) => x.key === rail)?.label ?? ''
  const savingMark = saving ? 'Saving…' : null

  const checks = openChecks.length > 0 && (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {openChecks.map((check) => (
        <CheckCard
          key={check.id}
          check={check}
          onResolve={(outcome, note) => resolve(check.id, outcome, note)}
          onAmend={(text) => void amendRule(check.id, text)}
        />
      ))}
    </div>
  )

  const rulesBlock = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <RuleList
        rules={scopeRules}
        inherited={scopeNode ? inherited : []}
        disabled={readOnly}
        onChange={setScopeRules}
      />
      {scopeNode && !readOnly && (liveRuleCount > 0 || inherited.length > 0) && (
        <div style={{ borderTop: `1px solid ${alpha(t.textPrimary, 0.08)}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <GhostButton size="sm" onClick={() => void runCheck(scopeNode.id)} loading={checking} loadingLabel="Reading it…">
            Check it against the rules
          </GhostButton>
          {checkNote && <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>{checkNote}</p>}
        </div>
      )}
    </div>
  )

  // In the core concept tab: the piece's own rules only, not the ones it inherits from the project.
  const pieceRulesBlock = (
    <RuleList rules={scopeRules} inherited={[]} disabled={readOnly} onChange={setScopeRules} />
  )

  const companionDrawer = (
    <>
    <Drawer open={rail !== null} title={railTitle} onClose={() => setRail(null)} sheet={sheeted}>
      {rail === 'intent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <InlineField
            ariaLabel="What this is for"
            value={scopeIntent}
            placeholder={scopeNode ? 'Say what this part has to do…' : 'Say what the whole project is, and what it has to do…'}
            multiline
            disabled={readOnly}
            onCommit={setScopeIntent}
            style={{ ...canvasType.conceptBody, color: t.textPrimary }}
          />

          {scopeNode && parent && (parent.intent || parent.title) && (
            <div style={{ borderLeft: `2px solid ${alpha(t.violet, 0.5)}`, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label style={{ color: alpha(t.violet, 0.9) }}>It owes {parent.title || 'the part above'}</Label>
              {parent.intent && <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>{parent.intent}</p>}
              <InlineField
                ariaLabel="The beat this part carries"
                value={scopeNode.beat}
                placeholder="What it has to do here…"
                multiline
                disabled={readOnly}
                onCommit={(beat) => void api.editNode(scopeNode.id, { beat })}
                style={{ ...canvasType.small, color: t.textPrimary }}
              />
            </div>
          )}

          {scopeNode && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: readOnly ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                checked={scopeNode.stands_whole}
                disabled={readOnly}
                onChange={(e) => void api.editNode(scopeNode.id, { stands_whole: e.target.checked })}
              />
              <span style={{ ...canvasType.chip, color: scopeNode.stands_whole ? t.violet : t.textMuted }}>
                Stands whole on its own
              </span>
            </label>
          )}

          {scopeNode && !readOnly && (
            <div style={{ borderTop: `1px solid ${alpha(t.textPrimary, 0.08)}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <GhostButton size="sm" onClick={() => void runCheck(scopeNode.id)} loading={checking} loadingLabel="Reading it…">
                Check it against the rules
              </GhostButton>
              <button
                type="button"
                onClick={() => void removeNode(scopeNode)}
                style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                Delete this part
              </button>
            </div>
          )}
        </div>
      )}

      {rail === 'rules' && rulesBlock}

      {rail === 'concept' && scopeNode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <ConceptPanel
          node={scopeNode}
          projectId={projectId}
          conversationLog={project?.conceptualisation_log}
          vision={visionOf(project?.settings)}
          onChanged={() => void api.refresh()}
          disabled={readOnly}
        />
          {/* The rules live with the concept: what the piece is, and what it holds to (2026-10-17). */}
          <section style={{ borderTop: `1px solid ${alpha(t.textPrimary, 0.08)}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Label>The rules</Label>
            <p style={{ ...canvasType.small, fontSize: 12.5, color: t.textMuted, margin: 0 }}>
              What this piece holds to.
            </p>
            {pieceRulesBlock}
          </section>
        </div>
      )}

      {rail === 'anchors' && scopeNode && (
        <AnchorsPanel
          lines={tools.lines}
          parts={scopeNode.children.map((c, i) => ({ id: c.id, label: c.title || `Part ${i + 1}` }))}
          onAdd={(text) => tools.addLine(text)}
          onRemove={(id) => void tools.removeLine(id)}
          disabled={readOnly}
        />
      )}

      {rail === 'tasks' && (
        <TasksPanel tasks={tools.tasks} onToggle={(task) => void tools.toggleTask(task)} onAdd={tools.addTask} onRemove={(task) => void tools.removeTask(task)} disabled={readOnly} />
      )}

      {rail === 'assistant' && scopeNode && isRootPiece && (
        <AssistantPanel
          chat={chat}
          selection={selection}
          onClearSelection={() => setSelection(null)}
          onRulesChanged={() => void api.refresh()}
          disabled={readOnly}
        />
      )}

      {rail === 'companion' && (
        <Companion
          projectId={projectId}
          nodeId={scopeNode?.id ?? null}
          scope={scopeNode ? (scopeNode.title || 'this part') : 'the whole project'}
          canSuggest={!!scopeNode}
          selection={scopeNode && selection?.nodeId === scopeNode.id ? selection : null}
          onClearSelection={() => setSelection(null)}
          onRulesChanged={() => void api.refresh()}
          disabled={readOnly}
        />
      )}
    </Drawer>
    </>
  )

  // ── level 2: the board ────────────────────────────────────────────────────
  if (focus.kind === 'project' && singlePieceNode) {
    // Redirecting (see the effect above) — render nothing board-shaped in
    // the meantime so it never flashes before the writing view takes over.
    return (
      <>
        <CanvasStage header={<StageHeader onUp={goShelf} upLabel={`Back to ${LEVELS.shelf.name}`} upText={LEVELS.shelf.name} />}>
          <span />
        </CanvasStage>
        <Dock />
      </>
    )
  }
  if (focus.kind === 'project') {
    return (
      <>
        <CanvasStage
          mood="ember"
          intensity={0.6}
          header={
            <StageHeader
              onUp={(el) => goShelf(el)}
              upLabel={`Back to ${LEVELS.shelf.name}`}
              upText={LEVELS.shelf.name}
              status={savingMark}
            />
          }
        >
          <Board
            project={{
              id: projectId,
              title: project.title,
              intent: project.intent ?? '',
              rules: projectRules,
              conceptualisation_log: project.conceptualisation_log,
              // Started via "Skip straight to writing": offer the core concept
              // later, through a short brief (a few questions, not the full
              // conversation: they already know the idea).
              coreConceptHref: roots.length > 0 && !roots[0].core_truth ? `/idea-lab/conceptualise?mode=brief&project=${projectId}` : null,
            }}
            pieces={roots}
            threads={tree.threads}
            items={board.items}
            assets={board.assets}
            tasks={board.tasks}
            tools={{ threads: canThread, media: canMedia, items: board.ready, companion: hasCompanion }}
            checks={openChecks}
            notices={phone ? planBanner : [...planBanner, ...carriedCards, ...(canThread ? threadIdeas.suggestions : []).map((sg) => (
              <ThreadSuggestionCard
                key={sg.id}
                suggestion={sg}
                pieceTitle={(id) => roots.find((r) => r.id === id)?.title || 'untitled'}
                onAnswer={(action) => threadIdeas.answer(sg.id, action)}
                disabled={readOnly}
              />
            ))]}
            onResolveCheck={resolve}
            onAmendCheck={(id, text) => void amendRule(id, text)}
            tagFor={tagFor}
            appearancesFor={appearancesFor}
            actions={boardActions}
            disabled={readOnly}
            arrangeable={isExampleProject}
            cardFrame={isExampleProject ? EXAMPLE_FRAME : undefined}
            tourHandle={tourHandle}
          />
          {/* Bottom and centred, not a small icon in a corner pill — this is
             the invitation to talk the vision through, not an afterthought. */}
          {/* On a phone too: the room takes turns between its two halves there,
             and a conversation is the one thing a phone is good at (2026-10-18). */}
          {<CompanionLauncher
            active={!!visionRoom}
            locked={!canTalkVision}
            onClick={(from) => {
              if (!canTalkVision) { setPlanNote('talk'); return }
              const box = from?.getBoundingClientRect()
              setRail(null)
              setVisionRoom({ origin: box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null })
            }}
          />}
        </CanvasStage>
        <Dock />
        {companionDrawer}
        {visionRoom && (
          <VisionRoom
            projectId={projectId}
            origin={visionRoom.origin}
            project={{ title: project.title, intent: project.intent ?? '', rules: projectRules }}
            pieces={roots}
            threads={tree.threads}
            appearancesFor={appearancesFor}
            onClose={() => { setVisionRoom(null); setRoomTour(undefined) }}
            onOpenPiece={(id) => { setVisionRoom(null); goNode(id) }}
            onRulesChanged={() => void api.refresh()}
            onConceptChanged={() => void api.refresh()}
            disabled={readOnly}
            tour={roomTour}
          />
        )}
        {touring && (
          <ExampleTour
            steps={touring}
            board={tourHandle}
            phone={phone}
            onRoom={onTourRoom}
            onDone={() => setTouring(null)}
            // The preview only: ?tour=5 starts at the fifth step, to look at one.
            startAt={process.env.NODE_ENV === 'production' ? 0 : Math.max(0, Number(new URLSearchParams(window.location.search).get('tour') ?? 1) - 1)}
          />
        )}
        {planNote && (
          <PlanNote
            title={planNote === 'talk' ? 'Talking the vision through' : planNote === 'thread' ? 'Threads across your pieces' : 'Images, sound, colour and links'}
            onClose={() => setPlanNote(null)}
            plansLabel={access?.plan === 'ended' ? 'See plans' : 'See Direction'}
          >
            <p style={{ margin: 0 }}>
              {planNote === 'talk'
                ? 'A room for the whole project, opened from its canvas: its vision on one page, and a conversation about who it is for, how it reaches them and where its field is heading. It is part of Direction. The writing assistant inside each piece is yours on every plan.'
                : planNote === 'thread'
                  ? 'New threads, the things that run through some of your pieces, are part of Direction. The ones already here stay, and a task list can be added on any plan.'
                  : 'New images, recordings, palettes and links on the canvas are part of Direction: a video or a song from the web plays right on the canvas there. The ones already here stay. Threads, task lists and notes are yours on every plan.'}
            </p>
          </PlanNote>
        )}
      </>
    )
  }

  // ── level 1: the writing (and the filtered read of one thread) ────────────
  const headerTitle =
    focus.kind === 'thread' ? thread?.name || 'A thread'
    : node?.title || 'Untitled'

  const words = node ? (node.children.length > 0 ? node.children.reduce((n, c) => n + wordCount(c.body), 0) : wordCount(node.body)) : 0
  const pendingTasks = tools.tasks.filter((x) => isWritingTask(x) && x.status === 'pending').length

  return (
    <PageShell mood="tide">
      <PageHeader
        eyebrow={null}
        title={isRootPiece && node && !readOnly ? (
          <TitleField key={node.id} value={node.title} onCommit={(title) => void api.editNode(node.id, { title })} />
        ) : headerTitle}
        size="md"
        clampOnPhone
        actions={
          <span
            aria-live="polite"
            style={{ ...canvasType.chip, color: shell.muted, opacity: saving ? 1 : 0, transition: 'opacity 160ms ease' }}
          >
            Saving…
          </span>
        }
        back={() => goProject()}
      />

      <Container
        padding={26}
        style={{
          // A phone holds no margin for the tools: they are a row under the title there.
          paddingRight: rail && roomBeside ? 478 : narrow ? undefined : 70,
          // ...and the last words can be scrolled clear of the section marks and the Dock.
          paddingBottom: sheeted ? 'calc(50vh + 96px)' : narrow ? 'calc(150px + env(safe-area-inset-bottom))' : undefined,
          transition: 'padding-right 200ms ease',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Piece controls sit here, not in the header, so the title keeps its room on a phone. */}
          <style>{`
            .piece-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }
            .piece-bar-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
            /* Flex, not block: an inline-flex tray inside a block wrapper picks up a line box and ends 2px taller than its neighbour. */
            .piece-bar-switch { display: flex; align-items: center; }
            @media (max-width: 719px) {
              .piece-bar-tools { display: contents; }
              .piece-bar-switch { margin-left: auto; }
            }
          `}</style>
          <div className="piece-bar">
            <Trail
              // On a phone the last step is the title right above it; said twice, it took a line.
              steps={focus.kind === 'node' ? (narrow ? trail.slice(0, -1) : trail) : []}
              onGo={(id) => goNode(id)}
              projectTitle={project.title}
              onGoProject={() => goProject()}
            />
            {focus.kind === 'node' && node && (
              <div className="piece-bar-tools">
                {narrow && !sheeted && (
                  <Rail
                    inline
                    open={rail}
                    onOpen={setRail}
                    tools={isRootPiece ? PIECE_TOOLS : PART_TOOLS}
                    counts={{ rules: liveRuleCount, anchors: tools.lines.length, tasks: pendingTasks }}
                  />
                )}
                <div className="piece-bar-switch" data-tour="view-switch">
                  <ViewSwitch view={view} onChange={setView} />
                </div>
              </div>
            )}
          </div>

          {planBanner}
          {isRootPiece && carriedCards.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{carriedCards}</div>
          )}
          {checks}
          {checkNote && <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>{checkNote}</p>}

          {focus.kind === 'node' && node && (
            <div data-tour="writing">
            <Studio
              node={node}
              threads={tree.threads}
              flow={view === 'flow'}
              onEdit={editNodeAtBoundary}
              onAdd={(afterId) =>
                node.children.length > 0
                  ? void api.addNode(node.id, afterId)
                  : void breakIntoParts(node)
              }
              onRemove={(part) => void removeNode(part)}
              onReorder={(ids) => void api.reorder(node.id, ids)}
              onEditBeat={(id, beat) => void api.editNode(id, { beat })}
              onOpenThread={goThread}
              onFinished={() => goProject()}
              onSelectionChange={setSelection}
              proposal={proposal}
              onProposalHandled={() => setProposal(null)}
              onFocusChange={setActivePartId}
              placeholders={suggestions}
              lines={tools.lines}
              onAddLine={(text, partId) => void tools.addLine(text, partId)}
              onRemoveLine={(id) => void tools.removeLine(id)}
              handle={studio}
              // Saved first, so the history compares against what's actually on the page.
              onHistory={() => void Promise.resolve(studio.current?.flush()).then(() => setHistoryOpen(true))}
              // On a phone a panel fills the screen down to where the marks sit.
              dockHidden={sheeted || (narrow && rail !== null)}
              onStorylineOpen={setStorylineOpen}
              disabled={readOnly}
            />
            </div>
          )}
          {focus.kind === 'node' && node && isRootPiece && (
            <PieceFooter
              projectId={projectId}
              nodeId={node.id}
              words={words}
              canShape={!readOnly && node.children.length === 0 && words === 0 && !!(node.emotional_journey || node.core_truth || node.intent)}
              canPlace={!readOnly && node.children.length === 0 && words > 0 && !!node.emotional_journey?.trim()}
              canDivide={!readOnly && words > 30 && !node.children.some((c) => c.is_locked) && !(node.children.length === 0 && !!node.emotional_journey?.trim())}
              sectioned={node.children.length > 0}
              busy={shaping}
              note={shapeNote}
              onShape={() => void reshape('shape', node.id)}
              onPlace={() => void reshape('place', node.id)}
              onDivide={() => void reshape('divide', node.id, node.children.length > 0)}
              onLeave={saveBeforeLeaving}
              journey={!example}
            />
          )}
          {focus.kind === 'node' && !node && <Empty line="That part is gone." />}

          {focus.kind === 'thread' && thread && (
            <ThreadRead
              thread={thread}
              appearances={appearancesFor(thread.id)}
              tagFor={tagFor}
              onOpen={(id) => goNode(id)}
              onUntag={(nodeId) => void api.untag(nodeId, thread.id)}
              onEditThread={(patch) => void api.editThread(thread.id, patch)}
              disabled={readOnly}
            />
          )}
          {focus.kind === 'thread' && !thread && <Empty line="That thread is gone." />}
        </div>
      </Container>

      <Rail
        open={rail}
        onOpen={setRail}
        hidden={focus.kind === 'thread' || sheeted || narrow}
        tools={isRootPiece ? PIECE_TOOLS : PART_TOOLS}
        counts={{ rules: liveRuleCount, anchors: tools.lines.length, tasks: pendingTasks }}
      />
      {companionDrawer}
      {pieceTouring && (
        <ExampleTour
          steps={pieceTouring}
          phone={phone}
          onPanel={(panel) => setRail(panel)}
          onView={setView}
          onDone={() => setPieceTouring(null)}
          startAt={process.env.NODE_ENV === 'production' ? 0 : Math.max(0, Number(new URLSearchParams(window.location.search).get('piecetour') ?? 1) - 1)}
        />
      )}
      {historyOpen && node && (
        <HistoryPanel
          nodeId={node.id}
          onClose={() => setHistoryOpen(false)}
          onRestored={async () => {
            await api.refresh()
            setHistoryOpen(false)
          }}
        />
      )}
    </PageShell>
  )
}

/** write · flow, the two ways to read a piece — each its own colour when
 *  active, the same two hues the rest of the studio already uses for the
 *  same ideas: tide for the words themselves, verdant for a finished,
 *  settled read. The map used to be a third option here; it is a standing
 *  part of the writing view now (section-dock.tsx), not a place you switch
 *  away to. */
function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const { t } = useTheme()
  const options: Array<{ key: View; label: string; tone: string }> = [
    { key: 'write', label: 'Write', tone: t.tide },
    { key: 'flow', label: 'Flow', tone: t.verdant },
  ]
  return (
    <div
      role="group"
      aria-label="How to look at this"
      style={{
        display: 'inline-flex', padding: 2, gap: 2,
        background: alpha(t.textPrimary, 0.06), borderRadius: radius.field,
      }}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={view === o.key}
          onClick={() => onChange(o.key)}
          style={{
            ...canvasType.chip, padding: '4px 10px', borderRadius: radius.field - 2,
            border: 'none', cursor: 'pointer',
            background: view === o.key ? alpha(o.tone, 0.16) : 'transparent',
            color: view === o.key ? o.tone : t.textMuted,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
