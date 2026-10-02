'use client'

// studio/src/components/work/board.tsx — level 2, the board.
//
// What hangs under the pieces can be picked up and put down: the threads'
// hubs, and the images, recordings and task lists a piece's "+" makes. One
// with no hand placement of its own sits near the pieces it touches —
// "rearrange" (next to the zoom control) puts everything back there in one
// motion by clearing every hand placement at once.
//
// The top of the board is kept clear. The project's title and core concept,
// and whatever is waiting on an answer, live there and nowhere else; nothing
// dragged can be put down above the line the pieces start on. When that top
// part grows (the concept opened, a notice arriving), everything below moves
// down with it as one plane, hand placements included.
//
// What runs across the pieces is drawn underneath as a web: one block per
// thread, with a line running to every piece it touches — never repeated
// per card. A thread connected to every single piece is not a thread any
// more, it is a constraint on the project, and the board says so before it
// lets you finish the last connection.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { Portal } from '@/components/ui/portal'
import { DOCK_DESKTOP_MIN } from '@/components/shell/dock'
import { Surface, ZoomPill, useCanvas, useElementFrame, useFrame } from '@/components/studio/surface/surface'
import { PieceCard } from '@/components/studio/work/piece-card'
import { ThreadCard } from '@/components/studio/work/thread-card'
import { CheckCard } from '@/components/studio/work/rules'
import { VisionBlock, VISION_COLLAPSED_H, VISION_EXPANDED_H, visionWidth } from '@/components/studio/work/vision-block'
import { hueOf } from '@/components/studio/work/bits'
import {
  ImageBlock, ItemShell, ITEM_LABEL, PlusMenu, RecorderDialog, RecordingBlock, TaskListBlock, type PlusChoice,
} from '@/components/studio/work/board-items'
import { IMAGE_ACCEPT } from '@/lib/studio/image-intake'
import {
  addSpotX, arrange, FALLBACK_H, imageHeight, itemWidth, keepBelow, RECORDING_H,
  type BoardItem, type Box, type PatchItemRequest, type ProjectTask,
} from '@/lib/studio/board-items'
import type { AssetView } from '@/lib/studio/types'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'
import type { Appearance, CheckOutcome, Rule, RuleCheck, Thread, ThreadHue, ThreadTag, TreeNode } from '@/lib/studio/node-types'
import {
  MARGIN, growWorld, laneCardWidth, laneSlot, smoothPath, toWorld, type Point,
} from '@/lib/studio/surface'

const GAP = 44
/**
 * Open board kept to the LEFT of everything. The world itself starts at 0, so
 * without this the first card sits hard against the left edge and there is
 * nowhere to put anything beside it — the leftmost piece had no left. The
 * whole board is laid out this far in, and `home` pulls the view back by the
 * same amount, so it opens exactly where it always did and the room is there
 * when you go looking for it.
 */
const LEFT_ROOM = 720
// How far the board opens past its edge so the title clears the back button: beside it from the Dock breakpoint up, below it on a phone.
const HOME_GAP_X = 20
const HOME_GAP_Y = 18
const BASE_CARD_TOP = 108
// Where the pieces start while the top of the board is at rest: the title
// closed and nothing waiting. Hand placements are kept relative to this, so
// they travel with the pieces when the top grows.
const REST_TOP = Math.max(BASE_CARD_TOP, MARGIN + VISION_COLLAPSED_H + GAP)
const WEB_GAP = 46      // space between the cards and the web below them
const HUB_W = 236
const HUB_H = 104
const HUB_GAP = 30
const ADD_THREAD_D = 30    // the "+" set into each card's bottom edge
// There is no separate connection point: every thread on a piece leaves from
// the "+" itself, all of them from that one spot, so the button is visibly
// the mouth its threads come out of.
// A piece keeps one colour of its own, by its place in the order, and every
// thread started from it is born that colour — so which card a thread came
// from is readable from the line itself.
const PIECE_HUES: ThreadHue[] = ['ember', 'verdant', 'violet', 'ochre', 'tide']
const pieceHue = (i: number): ThreadHue => PIECE_HUES[i % PIECE_HUES.length]
const NOTICE_GAP = 24
// Its own scale, not the vision panel's — a collision is a nudge, not
// content, and wants the room to stay almost as short as its title, not a
// width tied to whatever the vision panel happens to be.
const NOTICE_MIN_W = 480
const NOTICE_MAX_W = 1500
const NOTICE_FALLBACK_H = 130  // only the one frame before the row measures itself
// Rearranging glides rather than snaps — fast at first, easing to a stop —
// the same curve the reveal panels already use (stage.tsx), so every motion
// on these canvases settles the same way.
const TIDY_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const TIDY_MS = 450
// A new thread grows down out of the "+" that made it rather than appearing
// beside it fully formed, so where it came from is never in question.
const BORN_MS = 320

export interface BoardProject {
  title: string
  intent: string
  rules: Rule[]
  conceptualisation_log?: Array<{ role: 'user' | 'assistant'; content: string }> | null
  /** Set when the project skipped the core concept at the start. */
  coreConceptHref?: string | null
}

/** Which of the "+"'s tools this canvas has. */
export interface BoardTools {
  /** New threads (a Direction tool). */
  threads: boolean
  /** New images and recordings (a Direction tool). */
  media: boolean
  /** Task lists, images and recordings exist at all here (migration 028 applied). */
  items: boolean
}

export interface BoardActions {
  openPiece: (id: string, from: HTMLElement | null) => void
  /** `x` is where the new piece stands when the usual end of the lane is taken up by something else. */
  addPiece: (x: number | null) => void
  removePiece: (piece: TreeNode) => void
  renamePiece: (id: string, title: string) => void
  reorder: (ids: string[]) => void
  movePiece: (id: string, at: Point | null) => void
  /** Makes a new thread in the given colour. Started from a piece's own
   *  "+" button, so it is tagged to that piece and opened straight away to
   *  be named and run on to the others. */
  addThread: (hue?: ThreadHue) => Promise<Thread | null>
  editThread: (id: string, patch: Partial<Thread>) => void
  removeThread: (id: string) => void
  moveThread: (id: string, at: Point | null) => void
  tag: (nodeId: string, threadId: string, note?: string) => void
  untag: (nodeId: string, threadId: string) => void
  /** The thread runs through everything; keep it as a rule on the project. */
  makeConstraint: (thread: Thread) => void
  /** Read every appearance of the thread in order, one level down. */
  readThread: (id: string) => void
  renameProject: (title: string) => void
  editProjectIntent: (intent: string) => void
  editProjectRules: (rules: Rule[]) => void
  /** Clears every hand placement at once: pieces, hubs and items all return
   *  to their auto positions. */
  tidyBoard: () => void
  // ── what else a piece's "+" makes ─────────────────────────────────────────
  addTaskList: (pieceId: string) => Promise<BoardItem>
  /** These two reject with a sentence fit to show when the file cannot be added. */
  addImage: (pieceId: string, file: Blob) => Promise<BoardItem>
  addRecording: (pieceId: string, file: Blob, opts: { ownVoice: boolean; seconds?: number }) => Promise<BoardItem>
  patchItem: (id: string, patch: PatchItemRequest) => void
  removeItem: (item: BoardItem) => void
  toggleTask: (task: ProjectTask) => void
  addTask: (nodeId: string, title: string, category: string) => Promise<void>
  removeTask: (task: ProjectTask) => void
  /** A picture or sound stopped loading: its address has run out. */
  refreshAsset: (assetId: string) => void
  /** Something the plan does not carry was asked for. */
  onLocked: (choice: PlusChoice) => void
}

type Drag = { kind: 'hub' | 'item'; id: string; at: Point }

// One identity for "none", so a board given no items does not see a new
// empty list on every render (the world's size is worked out from them).
const NO_ITEMS: BoardItem[] = []
const NO_ASSETS: Record<string, AssetView> = {}
const NO_TASKS: ProjectTask[] = []
const THREADS_ONLY: BoardTools = { threads: true, media: true, items: false }

export function Board({
  project,
  pieces,
  threads,
  items = NO_ITEMS,
  assets = NO_ASSETS,
  tasks = NO_TASKS,
  tools = THREADS_ONLY,
  checks,
  notices = [],
  onResolveCheck,
  onAmendCheck,
  tagFor,
  appearancesFor,
  actions,
  disabled = false,
}: {
  project: BoardProject
  pieces: TreeNode[]
  threads: Thread[]
  /** Images, recordings and task lists, each under the pieces it is connected to. */
  items?: BoardItem[]
  assets?: Record<string, AssetView>
  /** Every task of every piece; a task list shows the ones for its own pieces. */
  tasks?: ProjectTask[]
  tools?: BoardTools
  /** Sits right under the title, side by side when there's more than one —
   *  never floating in the middle of the canvas on its own. */
  checks: RuleCheck[]
  /** Other things waiting on an answer (suggested threads), shown in the
   *  same row after the checks. Each carries its own key and backing. */
  notices?: ReactElement[]
  onResolveCheck: (checkId: string, outcome: CheckOutcome, note?: string) => void
  onAmendCheck: (checkId: string, text: string) => void
  tagFor: (nodeId: string, threadId: string) => ThreadTag | undefined
  appearancesFor: (threadId: string) => Appearance[]
  actions: BoardActions
  disabled?: boolean
}) {
  const { t } = useTheme()
  const ref = useRef<HTMLDivElement | null>(null)
  const frame = useFrame(ref)
  const visionRef = useRef<HTMLDivElement | null>(null)
  const visionFrame = useFrame(visionRef)
  // Held in state, not a ref: the row mounts whenever the first notice
  // arrives (a check, a suggested thread), often after the board has.
  const [noticesEl, noticesRef] = useState<HTMLDivElement | null>(null)
  const noticesFrame = useElementFrame(noticesEl)

  const [drag, setDrag] = useState<Drag | null>(null)
  const [arming, setArming] = useState<string | null>(null)
  /** The item being connected: the next piece clicked joins or leaves it. */
  const [armingItem, setArmingItem] = useState<string | null>(null)
  const [asking, setAsking] = useState<{ thread: Thread; toId: string } | null>(null)
  const [openThread, setOpenThread] = useState<string | null>(null)
  /** The thread or item just made from a "+", so only that one grows out of it. */
  const [born, setBorn] = useState<string | null>(null)
  const [visionOpen, setVisionOpen] = useState(false)
  /** The piece whose "+" is open. */
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [recorderFor, setRecorderFor] = useState<string | null>(null)
  /** A word at the foot of the board while a file goes up, or when one could not. */
  const [word, setWord] = useState<{ text: string; busy: boolean } | null>(null)
  const [resizing, setResizing] = useState<{ id: string; w: number } | null>(null)
  /** Each item's own measured height (a task list is as tall as its tasks). */
  const [heights, setHeights] = useState<Record<string, number>>({})
  const imagePicker = useRef<HTMLInputElement | null>(null)
  const imageFor = useRef<string | null>(null)

  const cardW = frame.w ? laneCardWidth(frame.w, GAP) : 520
  const cardH = frame.h ? Math.round(Math.min(560, Math.max(340, frame.h * 0.5))) : 420
  // Kept in proportion with the piece cards, not a width of its own — a
  // fixed one dwarfed a lane of narrower cards on anything but a wide window.
  const visionW = visionWidth(cardW)

  // Measured, not assumed: a fixed height for the expanded panel either
  // clipped a long intent and its rules mid-sentence, or left a gap too big
  // for a short one. The fallback only covers the one frame before the
  // ResizeObserver's first reading lands.
  const visionH = visionFrame.h || (visionOpen ? VISION_EXPANDED_H : VISION_COLLAPSED_H)
  // Measured the same way as the vision panel above it — a guessed constant
  // either clipped a long question or left too much air under a short one.
  // However many rows that takes once notices are wrapping, not just one.
  const hasNotices = checks.length + notices.length > 0
  const noticeH = hasNotices ? (noticesFrame.h || NOTICE_FALLBACK_H) : 0
  // The room the row itself gets — every notice in it wraps onto a new line
  // rather than shrink to fit, so this is the frame's own width, not any one
  // notice's. Kept separate from noticeW below: capping this the same way
  // would stop two notices ever sitting side by side at all.
  const noticesRowMaxW = Math.round(Math.max(NOTICE_MIN_W, (frame.w || 1200) - MARGIN * 2))
  // Stretched across the frame itself, not the vision panel — a collision is
  // a nudge, and a nudge reads as one whenever it can stay short and wide
  // rather than boxed to the vision panel's own, much narrower scale. Every
  // notice gets up to this same width regardless of how many are open —
  // dividing it by count was the actual bug behind the box still wrapping
  // its own text after the width cap went up: two collisions at once were
  // quietly splitting it in half. Two that both fit at this width sit side
  // by side (flexWrap below); past that, the next one drops to its own row.
  const noticeW = hasNotices ? Math.min(NOTICE_MAX_W, noticesRowMaxW) : 0
  // Vision → notices → pieces uses NOTICE_GAP both times, the same rhythm
  // twice over. With no notices in the way, vision → pieces keeps the wider GAP.
  const gapBelowVision = hasNotices ? NOTICE_GAP + noticeH + NOTICE_GAP : GAP
  // The line the pieces start on. Everything above it is the top of the
  // board — the title, the core concept when open, the notices — and nothing
  // that can be dragged is ever allowed to rest up there.
  const cardTop = Math.max(BASE_CARD_TOP, MARGIN + visionH + gapBelowVision)
  /** How far the top has pushed the rest of the board down from its resting place. */
  const shift = cardTop - REST_TOP
  const cardX = useCallback((i: number) => LEFT_ROOM + laneSlot(i, cardW, GAP), [cardW])
  // The "add a piece" spot is the size of the piece it would make: it sits
  // at the end of the lane reading as the next card.
  const addColW = cardW
  const addPieceH = cardH
  const addHelpH = pieces.length === 0 ? 54 : 0

  /** Where a piece sits: in its reading-order lane, unless it was made
   *  further along because something else stood at the end of the lane. */
  const pieceAt = useCallback((piece: TreeNode, i: number): Point =>
    ({ x: piece.board_x ?? cardX(i), y: cardTop }),
  [cardX, cardTop])

  /** A hand placement as it is kept, to where it shows now, and back. */
  const shown = useCallback((y: number) => Math.max(cardTop, y + shift), [cardTop, shift])
  const kept = useCallback((at: Point): Point => ({ x: Math.round(at.x), y: Math.max(0, Math.round(at.y - shift)) }), [shift])

  /** Where each thread appears, by top-level piece. The board only ever asks
   *  this question of the pieces; depth below them is level 1's business. */
  const presence = useMemo(() => {
    const map = new Map<string, { roots: Set<string>; direct: Set<string> }>()
    for (const th of threads) {
      const roots = new Set<string>()
      const direct = new Set<string>()
      for (const a of appearancesFor(th.id)) {
        roots.add(a.rootId)
        if (a.node.id === a.rootId) direct.add(a.rootId)
      }
      map.set(th.id, { roots, direct })
    }
    return map
  }, [threads, appearancesFor])

  /** The threads that actually have a hub — the ones with at least one piece.
   *  A thread started from a card is tagged to it immediately, so it has a
   *  hub from birth. */
  const hubs = useMemo(
    () => threads.filter((th) => (presence.get(th.id)?.roots.size ?? 0) > 0),
    [threads, presence],
  )

  const pieceIds = useMemo(() => new Set(pieces.map((p) => p.id)), [pieces])
  const itemW = useCallback(
    (item: BoardItem) => (resizing?.id === item.id ? resizing.w : itemWidth(item.kind, item.w)),
    [resizing],
  )
  const itemH = useCallback((item: BoardItem) => {
    // What it actually measures, once it has: a caption that wrapped to a
    // second row makes the block taller than its proportions alone say, and
    // the layout has to keep room for the block that is really there. The
    // computed figures below are what it stands on until the first reading
    // lands, and while a resize is in flight (the measurement is a frame behind).
    const measured = heights[item.id]
    if (measured && !(resizing?.id === item.id)) return measured
    if (item.kind === 'recording') return RECORDING_H
    if (item.kind === 'image') {
      const asset = item.asset_id ? assets[item.asset_id] : undefined
      return imageHeight(itemW(item), asset, !!item.content.caption || !disabled)
    }
    return FALLBACK_H[item.kind]
  }, [assets, disabled, heights, itemW, resizing])

  const webTop = cardTop + cardH + WEB_GAP

  /**
   * Everything under the pieces with no hand placement of its own, gathered
   * around the piece it belongs to: under the card first, out to the side
   * when that column has grown too deep, and below the lot when it belongs to
   * no piece at all. The arithmetic is in `arrange` (board-items.ts) and
   * tested there; this only hands it what has been measured.
   */
  const autoAt = useMemo(() => arrange({
    things: [
      ...hubs.map((th) => ({
        id: th.id,
        w: HUB_W,
        h: HUB_H,
        on: [...(presence.get(th.id)?.roots ?? new Set<string>())],
      })),
      ...items.map((it) => ({
        id: it.id,
        w: itemW(it),
        h: itemH(it),
        on: it.node_ids.filter((id) => pieceIds.has(id)),
      })),
    ],
    columns: pieces.map((p, i) => ({ id: p.id, x: pieceAt(p, i).x, w: cardW })),
    top: webTop,
    gap: HUB_GAP,
    // About a card's worth of depth: past that, the column is taller than the
    // piece it hangs under and the eye has lost which card it belongs to.
    sideAfter: Math.round(cardH * 0.8),
    minX: MARGIN,
  }), [hubs, items, presence, pieces, pieceAt, pieceIds, cardW, cardH, itemW, itemH, webTop])

  /** Where a thread's hub actually is right now. */
  const hubAt = useCallback((th: Thread): Point => {
    if (drag?.kind === 'hub' && drag.id === th.id) return drag.at
    const auto = autoAt.get(th.id)
    if (th.board_x === null && th.board_y === null && auto) return auto
    return { x: th.board_x ?? auto?.x ?? LEFT_ROOM + MARGIN, y: th.board_y === null ? auto?.y ?? webTop : shown(th.board_y) }
  }, [drag, autoAt, webTop, shown])

  const itemAt = useCallback((it: BoardItem): Point => {
    if (drag?.kind === 'item' && drag.id === it.id) return drag.at
    const auto = autoAt.get(it.id)
    if (it.board_x === null && it.board_y === null && auto) return auto
    return { x: it.board_x ?? auto?.x ?? LEFT_ROOM + MARGIN, y: it.board_y === null ? auto?.y ?? webTop : shown(it.board_y) }
  }, [drag, autoAt, webTop, shown])

  const visionAt: Point = useMemo(() => ({ x: LEFT_ROOM + MARGIN, y: MARGIN }), [])

  /** Everything that can be put down, as boxes: what the end of the lane has to step around. */
  const boxes = useMemo<Box[]>(() => [
    ...hubs.map((th) => ({ ...hubAt(th), w: HUB_W, h: HUB_H })),
    ...items.map((it) => ({ ...itemAt(it), w: itemW(it), h: itemH(it) })),
  ], [hubs, hubAt, items, itemAt, itemW, itemH])

  const laneEnd = pieces.length
    ? Math.max(...pieces.map((p, i) => pieceAt(p, i).x + cardW)) + GAP
    : LEFT_ROOM + MARGIN
  // Put something down where the next piece would go and the spot makes
  // room: it steps to the right of it, and the next piece is made there.
  const addX = addSpotX(laneEnd, addColW, GAP, { top: cardTop, bottom: cardTop + cardH }, boxes)

  const world = useMemo(() => {
    let w = { w: frame.w || 0, h: frame.h || 0 }
    w = growWorld(w, addX, cardTop, addColW, addPieceH + addHelpH)
    w = growWorld(w, visionAt.x, visionAt.y, visionW, visionH)
    if (hasNotices) {
      // The row's own full width, not one notice's — however many of them
      // fit side by side, the world has to have room for the row itself.
      w = growWorld(w, visionAt.x, visionAt.y + visionH + NOTICE_GAP, noticesRowMaxW, noticeH)
    }
    for (const [i, piece] of pieces.entries()) {
      const at = pieceAt(piece, i)
      w = growWorld(w, at.x, at.y, cardW, cardH)
    }
    // A little past each one, so there is always somewhere further to drag it.
    for (const b of boxes) w = growWorld(w, b.x, b.y, b.w + GAP, b.h)
    return w
  }, [
    frame, pieces, cardW, cardH, boxes, pieceAt, visionAt, visionH, visionW, hasNotices,
    addX, cardTop, addColW, addPieceH, addHelpH, noticesRowMaxW, noticeH,
  ])

  const home = useMemo<Point>(
    () => (frame.w >= DOCK_DESKTOP_MIN
      ? { x: HOME_GAP_X - LEFT_ROOM, y: 0 }
      : { x: -LEFT_ROOM, y: HOME_GAP_Y }),
    [frame.w],
  )
  const canvas = useCanvas(ref, frame, world, { home })

  // Escape drops whatever you were in the middle of.
  useEffect(() => {
    if (!arming && !armingItem) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setArming(null); setArmingItem(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [arming, armingItem])

  const move = useCallback((id: string, delta: -1 | 1) => {
    const ids = pieces.map((p) => p.id)
    const from = ids.indexOf(id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= ids.length) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    actions.reorder(ids)
  }, [actions, pieces])

  /** One drag gesture, for anything on the board. Persists the drop only
   *  when the pointer actually travelled — a plain click never moves
   *  anything, so every inner button keeps working exactly as it did. */
  const beginDrag = useCallback((
    kind: Drag['kind'], id: string, committed: Point, onDrop: (at: Point) => void,
  ) => (e: React.PointerEvent) => {
    if (disabled) return
    const el = ref.current
    if (!el || e.button !== 0) return
    // user-select:none on the wrapper stops the drag's own text from
    // highlighting, but a press-and-drag that starts right at a text edge
    // could still hand the gesture to the browser's own selection instead of
    // ours. Preventing the default here is the actual guarantee — it heads
    // off text selection and native drag-image ghosting regardless of where
    // in the block the pointer went down, and does not stop the click that
    // follows a plain press-and-release (that is a separate event).
    e.preventDefault()
    const box = el.getBoundingClientRect()
    const grab = toWorld({ x: e.clientX - box.left, y: e.clientY - box.top }, canvas.pan, canvas.zoom)
    const offset = { x: grab.x - committed.x, y: grab.y - committed.y }
    let moved = false
    let landed = committed
    const target = e.currentTarget as HTMLElement
    // Capture is deferred until real movement, not set here at the down
    // event: capturing immediately redirects the click that follows a plain
    // press-and-release to this wrapper (the nearest common ancestor of
    // wherever the finger went down and up), so a rename or delete button
    // inside the card would stop receiving its own clicks entirely.
    const onMove = (ev: PointerEvent) => {
      const now = toWorld({ x: ev.clientX - box.left, y: ev.clientY - box.top }, canvas.pan, canvas.zoom)
      // Held below the line the pieces start on: the top of the board is not a place to put things.
      landed = keepBelow({ x: now.x - offset.x, y: now.y - offset.y }, cardTop)
      if (!moved && (Math.abs(landed.x - committed.x) > 3 || Math.abs(landed.y - committed.y) > 3)) {
        moved = true
        target.setPointerCapture(ev.pointerId)
      }
      if (moved) setDrag({ kind, id, at: landed })
    }
    const onUp = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId)
      setDrag(null)
      if (moved) onDrop(landed)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [canvas.pan, canvas.zoom, cardTop, disabled])

  /** The corner of an image or a task list, dragged to make it wider or
   *  narrower. Each kind has its own limits (lib/studio/board-items.ts). */
  const beginResize = useCallback((item: BoardItem) => (e: React.PointerEvent) => {
    if (disabled || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    const startX = e.clientX
    const startW = itemWidth(item.kind, item.w)
    let w = startW
    target.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) => {
      w = itemWidth(item.kind, startW + (ev.clientX - startX) / canvas.zoom)
      setResizing({ id: item.id, w })
    }
    const onUp = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId)
      if (w !== startW) actions.patchItem(item.id, { w })
      setResizing(null)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [actions, canvas.zoom, disabled])

  /** Every hand placement, gone at once: hubs and items back under their pieces. */
  const rearrange = useCallback(() => actions.tidyBoard(), [actions])

  /** Arming a connection carries the view toward the nearest piece that could
   *  take it — otherwise the only thing you can click is off the side of the
   *  glass. */
  const arm = useCallback((th: Thread) => {
    setArmingItem(null)
    if (arming === th.id) { setArming(null); return }
    setArming(th.id)
    const on = presence.get(th.id)?.roots ?? new Set<string>()
    const open = pieces.map((p, i) => (on.has(p.id) ? -1 : i)).filter((i) => i >= 0)
    if (open.length === 0) return
    const hubCenter = hubAt(th).x + HUB_W / 2
    const nearest = open.reduce(
      (best, i) => (Math.abs(pieceAt(pieces[i], i).x + cardW / 2 - hubCenter) < Math.abs(pieceAt(pieces[best], best).x + cardW / 2 - hubCenter) ? i : best),
      open[0],
    )
    const at = pieceAt(pieces[nearest], nearest)
    canvas.glideTo({ x: at.x + cardW / 2, y: at.y + cardH / 2 })
  }, [arming, canvas, cardW, cardH, hubAt, pieceAt, pieces, presence])

  /** Finishing a connection. Everything about the "all but one" rule is here. */
  const connectTo = useCallback((piece: TreeNode) => {
    if (!arming) return
    const thread = threads.find((th) => th.id === arming)
    setArming(null)
    if (!thread) return
    const on = presence.get(thread.id)?.roots ?? new Set<string>()
    const wouldBeEverywhere = pieces.length > 1 && !on.has(piece.id) && on.size + 1 >= pieces.length
    if (wouldBeEverywhere) { setAsking({ thread, toId: piece.id }); return }
    actions.tag(piece.id, thread.id)
  }, [actions, arming, pieces.length, presence, threads])

  /** An item joins the piece clicked, or leaves it if it was already there.
   *  With no piece left it simply stands on its own. */
  const toggleItemOn = useCallback((piece: TreeNode) => {
    const item = items.find((it) => it.id === armingItem)
    setArmingItem(null)
    if (!item) return
    const on = item.node_ids.filter((id) => pieceIds.has(id))
    actions.patchItem(item.id, { node_ids: on.includes(piece.id) ? on.filter((id) => id !== piece.id) : [...on, piece.id] })
  }, [actions, armingItem, items, pieceIds])

  /** A thread begins on a piece: born in that card's colour, already running
   *  through it, and opened so it can be named and carried to the others. */
  const addThreadFrom = useCallback(async (piece: TreeNode, i: number) => {
    const created = await actions.addThread(pieceHue(i))
    if (!created) return
    actions.tag(piece.id, created.id)
    setBorn(created.id)
    setOpenThread(created.id)
  }, [actions])

  // What this canvas's "+" offers, and which of those the plan does not carry.
  const choices = useMemo<PlusChoice[]>(
    () => ['thread', ...(tools.items ? (['tasks', 'image', 'recording'] as PlusChoice[]) : [])],
    [tools.items],
  )
  const lockedChoices = useMemo<PlusChoice[]>(
    () => [...(tools.threads ? [] : (['thread'] as PlusChoice[])), ...(tools.media ? [] : (['image', 'recording'] as PlusChoice[]))],
    [tools.threads, tools.media],
  )

  /** Saying it at the foot of the board, then letting it go. */
  const say = useCallback((text: string) => {
    setWord({ text, busy: false })
    window.setTimeout(() => setWord((cur) => (cur && cur.text === text ? null : cur)), 6000)
  }, [])

  const pick = useCallback((choice: PlusChoice, piece: TreeNode, i: number) => {
    setMenuFor(null)
    if (choice === 'thread') { void addThreadFrom(piece, i); return }
    if (choice === 'image') { imageFor.current = piece.id; imagePicker.current?.click(); return }
    if (choice === 'recording') { setRecorderFor(piece.id); return }
    actions.addTaskList(piece.id)
      .then((it) => setBorn(it.id))
      .catch((e: unknown) => say(e instanceof Error && e.message ? e.message : 'That did not save. Try again.'))
  }, [actions, addThreadFrom, say])

  const onPlus = useCallback((piece: TreeNode, i: number) => {
    // With nothing but threads to offer, the "+" is what it always was.
    if (choices.length === 1) {
      if (lockedChoices.includes('thread')) actions.onLocked('thread')
      else void addThreadFrom(piece, i)
      return
    }
    setMenuFor((cur) => (cur === piece.id ? null : piece.id))
  }, [actions, addThreadFrom, choices.length, lockedChoices])

  const onImageChosen = useCallback(async (file: File | undefined) => {
    const pieceId = imageFor.current
    imageFor.current = null
    if (!file || !pieceId) return
    setWord({ text: 'Adding the image…', busy: true })
    try {
      const it = await actions.addImage(pieceId, file)
      setBorn(it.id)
      setWord(null)
    } catch (e) {
      say(e instanceof Error && e.message ? e.message : 'The image could not be added. Try again.')
    }
  }, [actions, say])

  // the entrance plays once; after that it is just a block on the board
  useEffect(() => {
    if (!born) return
    const id = window.setTimeout(() => setBorn(null), BORN_MS)
    return () => window.clearTimeout(id)
  }, [born])

  const armedThread = arming ? threads.find((th) => th.id === arming) ?? null : null
  const armedOn = armedThread ? presence.get(armedThread.id)?.roots ?? new Set<string>() : null
  const armedItem = armingItem ? items.find((it) => it.id === armingItem) ?? null : null

  const piecesFor = (it: BoardItem) => {
    const on = pieces.filter((p) => it.node_ids.includes(p.id))
    return (on.length ? on : pieces).map((p) => ({ id: p.id, title: p.title }))
  }

  return (
    <>
      {/* The "Talk about the vision" launcher is fixed to the bottom centre of
         the window (rail.tsx, .companion-launcher) and was sitting on top of
         this. Both are bottom-centre, so this one stands above it — the same
         two bottoms the launcher uses, plus its own height and a gap. */}
      <style>{`
        .add-piece-box:hover { background: ${alpha(shell.text, 0.07)}; border-color: ${alpha(shell.text, 0.46)}; color: ${shell.text}; }
        .board-banner { bottom: calc(max(14px, env(safe-area-inset-bottom)) + 52px + 14px + 52px + 12px); }
        @media (min-width: ${DOCK_DESKTOP_MIN}px) { .board-banner { bottom: calc(22px + 52px + 12px); } }
      `}</style>
      <style>{`@keyframes threadBorn {
        from { opacity: 0; transform: translateY(-10px) scaleY(0.82); }
        to   { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        @keyframes threadBorn { from { opacity: 0 } to { opacity: 1 } }
      }`}</style>
      <input
        ref={imagePicker}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; void onImageChosen(file) }}
      />
      <Surface
        canvas={canvas}
        innerRef={ref}
        ariaLabel="The board — the pieces of this project and what hangs under them"
        chrome={
          <>
            <ZoomPill
              canvas={canvas}
              onHome={canvas.resetView}
              after={!disabled && <RearrangeButton onClick={rearrange} />}
            />
            {arming && armedThread && (
              <ConnectBanner colour={hueOf(t, armedThread.hue)} onCancel={() => setArming(null)}>
                Pick the piece <strong style={{ color: hueOf(t, armedThread.hue), fontWeight: 600 }}>{armedThread.name || 'this thread'}</strong> runs through next
              </ConnectBanner>
            )}
            {armedItem && (
              <ConnectBanner colour={t.tide} onCancel={() => setArmingItem(null)}>
                Pick a piece to connect {ITEM_LABEL[armedItem.kind]} to, or one it is on to take it off
              </ConnectBanner>
            )}
            {word && !arming && !armedItem && (
              <ConnectBanner colour={word.busy ? t.tide : t.ember} onCancel={word.busy ? undefined : () => setWord(null)}>
                {word.text}
              </ConnectBanner>
            )}
          </>
        }
      >
        {/* every line in the web, drawn once, under everything */}
        <svg
          width={world.w}
          height={world.h}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
          aria-hidden
        >
          {hubs.map((th) => {
            const hb = hubAt(th)
            const hx = hb.x + HUB_W / 2
            const hy = hb.y
            const colour = hueOf(t, th.hue)
            const here = presence.get(th.id)!
            return pieces.map((piece, i) => {
              if (!here.roots.has(piece.id)) return null
              const p = pieceAt(piece, i)
              // the one place every thread on this piece leaves from: the
              // middle of its bottom edge, where the "+" sits
              const ox = p.x + cardW / 2
              const oy = p.y + cardH
              const deep = !here.direct.has(piece.id)
              return (
                <path
                  key={`${th.id}-${piece.id}`}
                  d={smoothPath({ x: ox, y: oy }, { x: hx, y: hy })}
                  fill="none"
                  stroke={alpha(colour, deep ? 0.32 : 0.55)}
                  strokeWidth={1.5}
                  strokeDasharray={deep ? '1 5' : undefined}
                  strokeLinecap="round"
                />
              )
            })
          })}
          {/* and from the same "+", a line to each thing it made: in the piece's own colour */}
          {items.map((it) => {
            const at = itemAt(it)
            const top = { x: at.x + itemW(it) / 2, y: at.y }
            return pieces.map((piece, i) => {
              if (!it.node_ids.includes(piece.id)) return null
              const p = pieceAt(piece, i)
              return (
                <path
                  key={`${it.id}-${piece.id}`}
                  d={smoothPath({ x: p.x + cardW / 2, y: p.y + cardH }, top)}
                  fill="none"
                  stroke={alpha(hueOf(t, pieceHue(i)), 0.45)}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              )
            })
          })}
        </svg>

        {/* the project's own title, vision and rules: always here, at the top */}
        <div
          ref={visionRef}
          data-hold
          style={{ position: 'absolute', left: visionAt.x, top: visionAt.y }}
        >
          <VisionBlock
            title={project.title}
            width={visionW}
            intent={project.intent}
            rules={project.rules}
            expanded={visionOpen}
            onToggle={() => setVisionOpen((v) => !v)}
            onRename={actions.renameProject}
            onEditIntent={actions.editProjectIntent}
            onEditRules={actions.editProjectRules}
            disabled={disabled}
            conversationLog={project.conceptualisation_log}
            coreConceptHref={project.coreConceptHref}
          />
        </div>

        {/* whatever needs the person's attention, right under the title —
           never floating loose in the middle of the canvas. Side by side
           when there is room for that — the row's own width is capped to
           the frame, not divided among however many notices are in it, so
           each one wraps onto its own line rather than every one of them
           shrinking to fit. Measured for its real height, the same as the
           vision panel above it: a guessed height either clipped a long
           question or left the pieces below sitting on too much empty air. */}
        {hasNotices && (
          <div
            ref={noticesRef}
            style={{
              position: 'absolute', left: visionAt.x, top: visionAt.y + visionH + NOTICE_GAP,
              display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: NOTICE_GAP,
              maxWidth: noticesRowMaxW,
            }}
          >
            {checks.map((check) => (
              <div
                key={check.id}
                data-hold
                style={{
                  width: noticeW,
                  // CheckCard is styled for a solid backing (it's normally read
                  // on the writing page's own container) — the canvas behind it
                  // here is transparent, so it needs that backing given directly.
                  background: t.containerBg, borderRadius: radius.widget, boxShadow: t.containerShadow,
                }}
              >
                <CheckCard
                  check={check}
                  onResolve={(outcome, note) => onResolveCheck(check.id, outcome, note)}
                  onAmend={(text) => onAmendCheck(check.id, text)}
                />
              </div>
            ))}
            {notices.map((notice) => (
              <div
                key={notice.key}
                data-hold
                style={{ width: noticeW, background: t.containerBg, borderRadius: radius.widget, boxShadow: t.containerShadow }}
              >
                {notice}
              </div>
            ))}
          </div>
        )}

        {/* the pieces — laid out, not dragged: a piece's place is its order
           among the others, moved with the arrows on the card itself. */}
        {pieces.map((piece, i) => {
          const targeted = armedItem ? true : Boolean(armedOn && !armedOn.has(piece.id))
          const onItem = Boolean(armedItem?.node_ids.includes(piece.id))
          const at = pieceAt(piece, i)
          return (
            <div
              key={piece.id}
              style={{
                position: 'absolute', left: at.x, top: at.y, width: cardW, height: cardH,
                transition: `left ${TIDY_MS}ms ${TIDY_EASE}, top ${TIDY_MS}ms ${TIDY_EASE}`,
              }}
            >
              <PieceCard
                node={piece}
                width={cardW}
                height={cardH}
                first={i === 0}
                last={i === pieces.length - 1}
                dimmed={Boolean(armedOn && armedOn.has(piece.id))}
                targeted={targeted}
                disabled={disabled}
                onOpen={(el) => actions.openPiece(piece.id, el)}
                onRename={(title) => actions.renamePiece(piece.id, title)}
                onRemove={() => actions.removePiece(piece)}
                onMove={(d) => move(piece.id, d)}
              />
              {targeted && (
                <button
                  data-hold
                  type="button"
                  aria-label={armedItem
                    ? `${onItem ? 'Take' : 'Connect'} ${ITEM_LABEL[armedItem.kind]} ${onItem ? 'off' : 'to'} ${piece.title || 'this piece'}`
                    : `Run ${armedThread?.name || 'this thread'} through ${piece.title || 'this piece'}`}
                  onClick={() => (armedItem ? toggleItemOn(piece) : connectTo(piece))}
                  style={{
                    position: 'absolute', inset: 0, borderRadius: radius.card,
                    background: alpha(onItem ? t.ember : t.tide, 0.06), border: 'none', cursor: 'pointer',
                  }}
                />
              )}
              {/* everything a piece can have hanging under it starts here —
                 set into the card's own bottom edge, in this card's colour,
                 which a thread then carries */}
              {!disabled && (
                <AddThreadButton
                  hue={pieceHue(i)}
                  pieceTitle={piece.title}
                  menu={choices.length > 1}
                  open={menuFor === piece.id}
                  onClick={() => onPlus(piece, i)}
                />
              )}
              {menuFor === piece.id && (
                <PlusMenu
                  available={choices}
                  locked={lockedChoices}
                  onPick={(choice) => pick(choice, piece, i)}
                  onLocked={(choice) => { setMenuFor(null); actions.onLocked(choice) }}
                  onClose={() => setMenuFor(null)}
                />
              )}
            </div>
          )
        })}

        {/* the web's own blocks — one per thread, wherever it sits */}
        {hubs.map((th) => {
          const at = hubAt(th)
          return (
            <div
              key={th.id}
              onPointerDown={beginDrag('hub', th.id, at, (landed) => actions.moveThread(th.id, kept(landed)))}
              style={{
                position: 'absolute', left: at.x, top: at.y, cursor: disabled ? 'default' : 'grab', touchAction: 'none',
                userSelect: 'none', WebkitUserSelect: 'none',
                transition: drag?.kind === 'hub' && drag.id === th.id
                  ? 'none' : `left ${TIDY_MS}ms ${TIDY_EASE}, top ${TIDY_MS}ms ${TIDY_EASE}`,
              }}
            >
              <Hub
                thread={th}
                born={born === th.id}
                armed={arming === th.id}
                disabled={disabled}
                onOpen={() => setOpenThread(th.id)}
                onConnect={() => arm(th)}
                onRemove={() => actions.removeThread(th.id)}
              />
            </div>
          )
        })}

        {/* images, recordings and task lists: picked up and put down the same way */}
        {items.map((it) => {
          const at = itemAt(it)
          const w = itemW(it)
          const asset = it.asset_id ? assets[it.asset_id] : undefined
          const stale = () => { if (it.asset_id) actions.refreshAsset(it.asset_id) }
          return (
            <div
              key={it.id}
              onPointerDown={beginDrag('item', it.id, at, (landed) => {
                const k = kept(landed)
                actions.patchItem(it.id, { board_x: k.x, board_y: k.y })
              })}
              style={{
                position: 'absolute', left: at.x, top: at.y, cursor: disabled ? 'default' : 'grab', touchAction: 'none',
                userSelect: 'none', WebkitUserSelect: 'none',
                transition: drag?.kind === 'item' && drag.id === it.id
                  ? 'none' : `left ${TIDY_MS}ms ${TIDY_EASE}, top ${TIDY_MS}ms ${TIDY_EASE}`,
              }}
            >
              <ItemShell
                item={it}
                width={w}
                label={ITEM_LABEL[it.kind]}
                born={born === it.id}
                armed={armingItem === it.id}
                disabled={disabled}
                padded={it.kind !== 'image'}
                onConnect={() => { setArming(null); setArmingItem((cur) => (cur === it.id ? null : it.id)) }}
                onRemove={() => actions.removeItem(it)}
                onResizeStart={beginResize(it)}
                onHeight={(h) => setHeights((prev) => (prev[it.id] === h ? prev : { ...prev, [it.id]: h }))}
              >
                {it.kind === 'image' && (
                  <ImageBlock
                    item={it}
                    asset={asset}
                    width={w - 2}
                    disabled={disabled}
                    onCaption={(caption) => actions.patchItem(it.id, { content: { caption } })}
                    onStale={stale}
                  />
                )}
                {it.kind === 'recording' && (
                  <RecordingBlock
                    item={it}
                    asset={asset}
                    disabled={disabled}
                    onTitle={(title) => actions.patchItem(it.id, { content: { title } })}
                    onStale={stale}
                  />
                )}
                {it.kind === 'tasks' && (
                  <TaskListBlock
                    item={it}
                    pieces={piecesFor(it)}
                    tasks={tasks}
                    disabled={disabled}
                    onToggleTask={actions.toggleTask}
                    onAddTask={actions.addTask}
                    onRemoveTask={actions.removeTask}
                    onContent={(content) => actions.patchItem(it.id, { content })}
                  />
                )}
              </ItemShell>
            </div>
          )
        })}

        {/* one more piece, at the end of the lane and the size of a real
           card — or further along, when something has been put down where
           it would stand. */}
        {!disabled && (
          <div
            style={{
              position: 'absolute', left: addX, top: cardTop, width: addColW,
              transition: `left ${TIDY_MS}ms ${TIDY_EASE}, top ${TIDY_MS}ms ${TIDY_EASE}`,
            }}
          >
            <button
              data-hold
              type="button"
              aria-label="Add a piece to this project"
              title="Add a piece"
              onClick={() => actions.addPiece(addX === cardX(pieces.length) ? null : addX)}
              className="add-piece-box"
              style={{
                width: '100%', height: addPieceH,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', borderRadius: radius.card,
                // It was dim enough on the ink ground to read as something
                // switched off rather than the way to make the next piece.
                background: alpha(shell.text, 0.035),
                border: `1px dashed ${alpha(shell.text, 0.3)}`,
                color: alpha(shell.text, 0.62),
                transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            {pieces.length === 0 && (
              <p style={{ ...canvasType.small, color: shell.muted, margin: '14px 0 0', textAlign: 'center', height: addHelpH - 14, boxSizing: 'border-box' }}>
                A piece is one whole thing — a film, a chapter, a song, an essay.
              </p>
            )}
          </div>
        )}

      </Surface>

      {openThread && (
        <ThreadCard
          thread={threads.find((th) => th.id === openThread)!}
          pieces={pieces}
          on={presence.get(openThread)?.roots ?? new Set()}
          direct={presence.get(openThread)?.direct ?? new Set()}
          tagFor={tagFor}
          disabled={disabled}
          onClose={() => setOpenThread(null)}
          onEdit={(patch) => actions.editThread(openThread, patch)}
          onTag={(nodeId) => actions.tag(nodeId, openThread)}
          onNote={(nodeId, note) => actions.tag(nodeId, openThread, note)}
          onUntag={(nodeId) => actions.untag(nodeId, openThread)}
          onRemove={() => { setOpenThread(null); actions.removeThread(openThread) }}
          onRead={() => { setOpenThread(null); actions.readThread(openThread) }}
        />
      )}

      {asking && (
        <EverywhereDialog
          thread={asking.thread}
          onConstraint={() => { actions.makeConstraint(asking.thread); setAsking(null) }}
          onAnyway={() => { actions.tag(asking.toId, asking.thread.id); setAsking(null) }}
          onCancel={() => setAsking(null)}
        />
      )}

      {recorderFor && (
        <RecorderDialog
          onClose={() => setRecorderFor(null)}
          onDone={async (file, opts) => {
            const it = await actions.addRecording(recorderFor, file, opts)
            setBorn(it.id)
          }}
        />
      )}
    </>
  )
}

// ── the "rearrange" tool, beside the zoom control ───────────────────────────

function RearrangeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Rearrange everything neatly"
      title="Rearrange everything neatly"
      onClick={onClick}
      style={{
        width: 30, height: 30, borderRadius: 999, padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', color: shell.muted,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </svg>
    </button>
  )
}

// ── the block that stands for one thread ────────────────────────────────────

function Hub({
  thread, born, armed, disabled, onOpen, onConnect, onRemove,
}: {
  thread: Thread
  /** Just made from a piece's "+": grows out of it once. */
  born: boolean
  armed: boolean
  disabled: boolean
  onOpen: () => void
  onConnect: () => void
  onRemove: () => void
}) {
  const { t, theme } = useTheme()
  const colour = hueOf(t, thread.hue)
  const [hover, setHover] = useState(false)
  const ring = armed ? colour : alpha(t.textPrimary, hover ? 0.16 : 0.08)
  const liveRules = thread.rules.filter((r) => !r.retired_at).length
  // A low-alpha tint reads fine over an opaque card, but this block floats
  // straight on the canvas — blended at 10% it was mixing with the shell
  // behind it, not with paper, so light mode read as near-black text on a
  // near-black block. color-mix against the theme's own card tone keeps it
  // opaque and legible in both themes; dark mode is left exactly as it was.
  const background = theme === 'light' ? `color-mix(in srgb, ${colour} 16%, ${t.cardBg})` : t.cardBg

  return (
    <div
      data-hold
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: HUB_W, height: HUB_H, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
        background, borderRadius: radius.widget,
        // Separate longhands, not the `border` shorthand plus a `borderLeft`
        // override — mixing the two triggers React's "conflicting style
        // property" warning on every rerender.
        borderStyle: 'solid', borderWidth: '1px 1px 1px 3px', borderColor: `${ring} ${ring} ${ring} ${colour}`,
        boxShadow: armed ? `0 0 0 3px ${alpha(colour, 0.18)}, ${t.shadow}` : t.shadow,
        transition: 'border-color 140ms ease, box-shadow 140ms ease',
        // out of the button above it: the top edge is where the stem lands
        transformOrigin: 'top center',
        animation: born ? `threadBorn ${BORN_MS}ms ${TIDY_EASE} both` : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <button
          type="button"
          onClick={onOpen}
          title={thread.name || 'open this thread'}
          style={{
            ...canvasType.label, color: t.textPrimary, background: 'none', border: 'none',
            padding: 0, flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 600,
          }}
        >
          {thread.name || 'Name this thread'}
        </button>
        {!disabled && (
          <div style={{ display: 'flex', gap: 1, flexShrink: 0, opacity: hover || armed ? 1 : 0, transition: 'opacity 140ms ease' }}>
            <HubAct label={armed ? 'Stop connecting' : 'Connect it to another piece'} tone={armed ? colour : t.textMuted} onClick={onConnect}>
              <circle cx="6" cy="12" r="2.6" />
              <circle cx="18" cy="12" r="2.6" />
              <line x1="8.6" y1="12" x2="15.4" y2="12" />
            </HubAct>
            <HubAct label="Delete this thread" tone={t.textMuted} onClick={onRemove}>
              <path d="M6 6l12 12M18 6L6 18" />
            </HubAct>
          </div>
        )}
      </div>
      <p
        onClick={onOpen}
        style={{
          ...canvasType.small, fontSize: 12, lineHeight: 1.35, margin: 0, cursor: 'pointer',
          color: thread.intent ? t.textSecondary : t.textMuted,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {thread.intent || 'What runs through the pieces — a motif, a rule, a promise.'}
      </p>
      <span style={{ ...canvasType.chip, color: t.textMuted, marginTop: 'auto' }}>
        {liveRules || 'no'} {liveRules === 1 ? 'rule' : 'rules'}
      </span>
    </div>
  )
}

function HubAct({ label, tone, onClick, children }: { label: string; tone: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        width: 20, height: 20, borderRadius: 6, padding: 0, border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', color: tone, cursor: 'pointer',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        {children}
      </svg>
    </button>
  )
}

// ── starting a thread from the piece it runs through ────────────────────────

/** Set into the middle of a card's bottom edge, in that card's own colour.
 *  The ring is the canvas behind it, so the button reads as a break in the
 *  card's outline rather than something floating over it. */
function AddThreadButton({ hue, pieceTitle, menu, open, onClick }: {
  hue: ThreadHue
  pieceTitle: string
  /** It opens a choice (a thread, a task list, an image, a recording) rather than starting a thread outright. */
  menu: boolean
  open: boolean
  onClick: () => void
}) {
  const { t } = useTheme()
  const colour = hueOf(t, hue)
  const [hover, setHover] = useState(false)
  const label = menu ? `Add something under ${pieceTitle || 'this piece'}` : `Start a thread from ${pieceTitle || 'this piece'}`
  return (
    <button
      data-hold
      type="button"
      title={menu ? 'Add a thread, a task list, an image or a recording' : 'Start a thread here'}
      aria-label={label}
      aria-haspopup={menu ? 'menu' : undefined}
      aria-expanded={menu ? open : undefined}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute', left: '50%', bottom: -ADD_THREAD_D / 2,
        width: ADD_THREAD_D, height: ADD_THREAD_D, marginLeft: -ADD_THREAD_D / 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: colour, color: t.cardBg,
        boxShadow: `0 0 0 4px ${shell.ink}, 0 0 0 ${hover ? 8 : 4}px ${alpha(colour, hover ? 0.3 : 0)}`,
        transform: `${hover ? 'scale(1.06)' : 'scale(1)'} rotate(${open ? 45 : 0}deg)`,
        transition: 'transform 160ms ease, box-shadow 140ms ease',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  )
}

// ── what the board says while you are connecting ────────────────────────────

function ConnectBanner({ colour, onCancel, children }: {
  colour: string
  /** Absent while something is under way that cannot be called off. */
  onCancel?: () => void
  children: React.ReactNode
}) {
  return (
    <div
      data-hold
      role="status"
      className="board-banner"
      style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)', zIndex: 41,
        display: 'flex', alignItems: 'center', gap: 10, maxWidth: 'calc(100% - 32px)',
        padding: onCancel ? '8px 10px 8px 14px' : '8px 14px', borderRadius: 999,
        background: 'rgba(13,12,11,0.84)', backdropFilter: 'blur(18px) saturate(1.1)',
        border: `1px solid ${alpha(colour, 0.5)}`,
      }}
    >
      <i aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: colour, flexShrink: 0 }} />
      <span style={{ ...canvasType.small, fontSize: 12.5, color: shell.text }}>{children}</span>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          style={{ ...canvasType.chip, color: shell.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }}
        >
          esc
        </button>
      )}
    </div>
  )
}

/** The one place the board argues with you. */
function EverywhereDialog({
  thread, onConstraint, onAnyway, onCancel,
}: {
  thread: Thread
  onConstraint: () => void
  onAnyway: () => void
  onCancel: () => void
}) {
  const { t } = useTheme()
  const name = thread.name || 'this thread'
  return (
    <Portal>
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(10,9,8,0.78)', backdropFilter: 'blur(6px)',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={`${name} would run through everything`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, padding: 24, borderRadius: radius.card,
          background: t.containerBg, boxShadow: t.containerShadow,
        }}
      >
        <h2 style={{ ...canvasType.headingMd, fontSize: 20, color: t.textPrimary, margin: 0 }}>
          That is every piece.
        </h2>
        <p style={{ ...canvasType.small, color: t.textSecondary, margin: '10px 0 0' }}>
          A thread is something that runs through <em>some</em> of the work — the gaps are what make it
          worth drawing. <strong style={{ color: t.textPrimary, fontWeight: 600 }}>{name}</strong> would now
          be on all of it, which usually means it is not a thread at all but a rule the whole project is
          working under.
        </p>
        <p style={{ ...canvasType.small, color: t.textMuted, margin: '10px 0 0' }}>
          As a constraint it is checked at every boundary, instead of being drawn under every piece.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <Choice onClick={onCancel} quiet>Leave it</Choice>
          <Choice onClick={onAnyway} quiet>Connect it anyway</Choice>
          <Choice onClick={onConstraint}>Make it a constraint</Choice>
        </div>
      </div>
    </div>
    </Portal>
  )
}

function Choice({ onClick, quiet = false, children }: { onClick: () => void; quiet?: boolean; children: React.ReactNode }) {
  const { t } = useTheme()
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...canvasType.small, fontSize: 13, padding: '9px 14px', borderRadius: radius.field, cursor: 'pointer',
        border: quiet ? `1px solid ${alpha(t.textPrimary, 0.16)}` : 'none',
        background: quiet ? 'transparent' : t.inverseBg,
        color: quiet ? t.textSecondary : t.inverseText,
      }}
    >
      {children}
    </button>
  )
}
