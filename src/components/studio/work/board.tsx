'use client'

// studio/src/components/work/board.tsx — level 2, the board.
//
// Everything on it can be picked up and put down: the pieces themselves, the
// threads' hubs, and the images, recordings and task lists a piece's "+"
// makes. Anything never moved by hand is placed near the piece it belongs to
// (see `arrange`), and once it has been moved it stays where it was put.
//
// There is no "tidy everything" here on purpose. A board gets busy slowly, a
// piece at a time, and the person is the one who knows what belongs beside
// what; a button that rearranged the lot would undo that judgement in one
// press and be hard to get back.
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

import { TASK_ROWS } from '@/lib/studio/board-items'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { Portal } from '@/components/ui/portal'
import { DOCK_DESKTOP_MIN } from '@/components/shell/dock'
import { useNoHover, usePhone } from '@/lib/use-phone'
import { PillButton, Surface, ZoomPill, useCanvas, useElementFrame, useFrame } from '@/components/studio/surface/surface'
import { PieceCard } from '@/components/studio/work/piece-card'
import { ThreadCard } from '@/components/studio/work/thread-card'
import { CheckCard } from '@/components/studio/work/rules'
import { VisionBlock, VISION_COLLAPSED_H, VISION_EXPANDED_H, visionWidth } from '@/components/studio/work/vision-block'
import { hueOf } from '@/components/studio/work/bits'
import {
  ImageBlock, ItemShell, ITEM_LABEL, NewPieceMenu, NoteBlock, PaletteBlock, PlusMenu, RecorderDialog, RecordingBlock, TaskListBlock, type PlusChoice,
} from '@/components/studio/work/board-items'
import { AddFlow, type AddResult } from '@/components/studio/work/add-flow'
import { LinkBlock } from '@/components/studio/work/link-block'
import { AddFan } from '@/components/studio/work/add-fan'
import {
  laneLayout, lanePlaceAt, LEGACY_THREAD_LANE_Y, threadLaneDecode, threadLaneEncode, type LanePlace,
  addSpotX, arrange, asksBeforeRemoving, contentBack, FALLBACK_H, imageHeight, itemWidth, keepBelow, RECORDING_H,
  type BoardItem, type Box, type PatchItemRequest, type ProjectTask,
} from '@/lib/studio/board-items'
import { opensOn } from '@/lib/studio/opening-view'
import { openedIn } from '@/lib/studio/opened'
import { useDeferred } from '@/lib/studio/use-deferred'
import { useLit } from '@/lib/studio/use-lit'
import { isLit, lineKey, litBy, type WebFocus, type WebKind } from '@/lib/studio/web-focus'
import { useUndo } from '@/lib/studio/use-undo'
import type { AssetView } from '@/lib/studio/types'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'
import type { Appearance, CheckOutcome, Rule, RuleCheck, Thread, ThreadHue, ThreadTag, TreeNode } from '@/lib/studio/node-types'
import {
  MARGIN, ZOOM, growWorld, laneCardWidth, laneSlot, smoothPath, toWorld, type Point,
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
// A board of more than this many pieces opens zoomed out to WIDE_OPEN_ZOOM,
// centred on its first two, rather than at 100% on the last one worked on.
const WIDE_OPEN_AFTER = 3
const WIDE_OPEN_ZOOM = 0.69
/**
 * The size every board is laid out at, whatever the screen. Cards used to be
 * as wide as the window allowed, but anything put down by hand keeps its own
 * place, so a board arranged on a computer came apart on a phone: the pieces
 * still in their lane closed up around their narrower cards while a piece
 * placed by hand stayed where it was, far off to the side. One size
 * everywhere, and a screen only changes how far in it looks (the examples
 * have always worked this way).
 */
const BOARD_FRAME = { w: 1440, h: 900 } as const
/** The furthest out a board opens to show the whole project; any further and it opens on its first pieces instead. */
const FIT_FLOOR = 0.2
/** How a phone opens: the zoom, and where the first card's top-left corner stands (pixels in from the left, share of the height down). */
const PHONE_ZOOM = 1
const SMALL_CARDS_KEY = 'companheiro.small-cards'
const PHONE_CARD_AT = { x: 40, y: 0.31 } as const
// From this many pieces the cards come down in size, so more of the lane is
// in view at once. Width does most of the work — it is what the lane is
// measured in, and what made a project of six pieces a long way to walk —
// and height gives up less, because a card too short stops showing any of its
// words. Floors keep either from going below what a card can still be read at.
const CROWDED_AT = 4
const CROWDED_W_SCALE = 0.56
const CROWDED_H_SCALE = 0.8
const CROWDED_MIN_W = 300
const CROWDED_MIN_H = 290
/** At or under this a card drops to its compact face (see `PieceCard`). */
export const COMPACT_CARD_W = 440
const HUB_W = 236
const HUB_H = 104
const HUB_GAP = 30
/** How long a block is held still before it lifts and can be moved. */
const LIFT_MS = 150
/** How far a press travels before it is a look around rather than a click. A little room, so a hand that wobbles while holding still does not turn the hold into a pan. */
const PAN_SLOP = 8
const LIFT_HINT = 'companheiro.lift-hint.seen'
/** How far back a block falls while something else is being followed. */
const DIMMED = 0.22
/** Long enough to read as the board answering, short enough not to wait. */
const LIT_MS = 160
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
  /** Which project this is, for the browser's note of where it was left. */
  id: string
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
  /** The companion answers at all. Without it there is nothing to work a
   *  piece out with, so "add a piece" just makes one. */
  companion: boolean
}

/** What the example tour asks of the board. */
export interface BoardTourHandle {
  /**
   * Brings these into view (piece, thread or item ids, or the whole board),
   * as large as fits and never past `maxZoom`, centred in what the tour's
   * caption leaves of the window (`inset`, in window pixels).
   */
  frame: (ids: string[] | 'all', opts?: { inset?: { top?: number; right?: number; bottom?: number; left?: number }; maxZoom?: number; ms?: number; below?: number }) => void
  /** Lights one thing's web, as resting on it would, or nothing. */
  light: (focus: WebFocus | null) => void
  /** Opens the corner's "+" menu as it is in a project of one's own (not greyed), or closes it. */
  plus: (open: boolean) => void
}

export interface BoardActions {
  openPiece: (id: string, from: HTMLElement | null) => void
  /** `x` is where the new piece stands when the usual end of the lane is taken up by something else. */
  addPiece: (x: number | null) => void
  /** Works the piece out in conversation first, and makes it at the end of
   *  that. Leaves this page. */
  conceptualisePiece: (x: number | null) => void
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
  // ── what else a piece's "+" makes ─────────────────────────────────────────
  addTaskList: (pieceId: string) => Promise<BoardItem>
  addPalette: (pieceId: string) => Promise<BoardItem>
  addLink: (pieceId: string) => Promise<BoardItem>
  /** These two reject with a sentence fit to show when the file cannot be added. */
  addImage: (pieceId: string, file: Blob) => Promise<BoardItem>
  addRecording: (pieceId: string, file: Blob, opts: { ownVoice: boolean; seconds?: number }) => Promise<BoardItem>
  patchItem: (id: string, patch: PatchItemRequest) => void
  removeItem: (item: BoardItem) => void
  toggleTask: (task: ProjectTask) => void
  addTask: (nodeId: string, title: string, category: string) => Promise<void>
  removeTask: (task: ProjectTask) => void
  renameTask: (task: ProjectTask, title: string) => void
  reorderTasks: (ids: string[]) => void
  /** A picture or sound stopped loading: its address has run out. */
  refreshAsset: (assetId: string) => void
  /** Something the plan does not carry was asked for. */
  onLocked: (choice: PlusChoice) => void
}

type Drag = { kind: 'piece' | 'hub' | 'item'; id: string; at: Point }

// One identity for "none", so a board given no items does not see a new
// empty list on every render (the world's size is worked out from them).
const NO_ITEMS: BoardItem[] = []
const NO_ASSETS: Record<string, AssetView> = {}
const NO_TASKS: ProjectTask[] = []
const THREADS_ONLY: BoardTools = { threads: true, media: true, items: false, companion: true }

export function Board({
  project,
  pieces: allPieces,
  threads: allThreads,
  items: allItems = NO_ITEMS,
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
  disabled: lockedForPlan = false,
  arrangeable = false,
  cardFrame,
  tourHandle,
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
  /** With `disabled`: things can still be moved around, and nothing else
   *  changed. The example projects (lib/examples) are read this way. */
  arrangeable?: boolean
  /** Size the cards for this window rather than the real one. An example's
   *  arrangement was made at one card size, and only holds at that size. */
  cardFrame?: { w: number; h: number }
  /** Filled in for the example tour: how it moves the view and lights a web. */
  tourHandle?: React.MutableRefObject<BoardTourHandle | null>
}) {
  const { t } = useTheme()
  // A phone looks at the board and opens pieces from it; arranging it (moving,
  // adding, connecting, removing) is for a tablet or a computer. Everything
  // the board already switches off for a project the plan is not carrying is
  // switched off here too, and the ground can be moved from anywhere.
  const phone = usePhone()
  const disabled = lockedForPlan || phone
  // Moving things about: everywhere it is not disabled, and on an example.
  const canMove = !phone && (!lockedForPlan || arrangeable)
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
  // The project's purpose and rules no longer fold open on the canvas: they are read
  // and changed in the vision room and on the writing page's core concept.
  const visionOpen = false
  /** The corner's "+" menu, open ('corner') or not. */
  const [menuFor, setMenuFor] = useState<string | null>(null)
  /** Opened by the example tour: shown as it is in a project of one's own, not greyed. */
  const [menuLive, setMenuLive] = useState(false)
  /** An example: looked at, moved about, never added to. */
  const example = lockedForPlan && arrangeable
  /** The "add a piece" box is asking which way. */
  const [askingNewPiece, setAskingNewPiece] = useState(false)
  /** A word at the foot of the board while a file goes up, or when one could not. */
  const [word, setWord] = useState<{ text: string; busy: boolean } | null>(null)
  const [resizing, setResizing] = useState<{ id: string; w: number; rows?: number } | null>(null)
  /** Each item's own measured height (a task list is as tall as its tasks). */
  const [heights, setHeights] = useState<Record<string, number>>({})
  /**
   * Removals waiting to be sent. What is removed goes off the board at once
   * and the request waits a few seconds, which is the whole of the undo for
   * deleting: taking it back in that time sends nothing at all.
   */
  const binned = useDeferred()
  /** The removal being offered back, named, while its few seconds last. */
  const [taking, setTaking] = useState<{ id: string; label: string; back: () => void } | null>(null)
  /** A photo or recording whose removal would take the file with it. */
  const [asked, setAsked] = useState<BoardItem | null>(null)

  const pieces = useMemo(() => allPieces.filter((p) => !binned.hidden.has(p.id)), [allPieces, binned.hidden])
  const threads = useMemo(() => allThreads.filter((th) => !binned.hidden.has(th.id)), [allThreads, binned.hidden])
  const items = useMemo(() => allItems.filter((it) => !binned.hidden.has(it.id)), [allItems, binned.hidden])

  // Four pieces or more and the cards come down a size, so more of the lane
  // is in view at once (the person's decision, 2026-10-17).
  // On a phone every card is the narrowed size, however few pieces there are (the
  // person's decision, 2026-10-25): one size to learn, and a card that fits the screen.
  // Small piece cards by choice (the button beside the zoom): the size a phone always has.
  const [smallCards, setSmallCards] = useState(false)
  useEffect(() => {
    try { if (window.localStorage.getItem(SMALL_CARDS_KEY) === '1') setSmallCards(true) } catch { /* big, as it opens */ }
  }, [])
  const chooseCardSize = useCallback((small: boolean) => {
    setSmallCards(small)
    try { window.localStorage.setItem(SMALL_CARDS_KEY, small ? '1' : '0') } catch { /* kept for this visit */ }
  }, [])
  const crowded = pieces.length >= CROWDED_AT || phone || smallCards
  const sizing = cardFrame ?? BOARD_FRAME
  const fullW = sizing.w ? laneCardWidth(sizing.w, GAP) : 520
  const fullH = sizing.h ? Math.min(560, Math.max(340, sizing.h * 0.5)) : 420
  // Wide enough to take the whole project in one frame when it can, and no
  // wider than the scale cap: a window that could hold four pieces at 600 each
  // does not need them that big. Never below the floor, past which the words
  // stop being readable and the board is simply walked instead.
  // The board opens zoomed out from this many pieces (WIDE_OPEN_ZOOM), so the
  // room a project has to fit in is the frame as seen at that zoom, not at 100%.
  const fitFrame = sizing.w ? sizing.w / WIDE_OPEN_ZOOM : 0
  const fitW = fitFrame ? Math.floor((fitFrame - MARGIN * 2 + GAP) / pieces.length - GAP) : Infinity
  const cardW = crowded
    ? (phone || smallCards ? CROWDED_MIN_W : Math.round(Math.max(CROWDED_MIN_W, Math.min(fullW * CROWDED_W_SCALE, fitW))))
    : fullW
  const cardH = crowded ? Math.round(Math.max(CROWDED_MIN_H, Math.min(fullH, fullH * CROWDED_H_SCALE))) : fullH
  // Kept in proportion with the piece cards, not a width of its own — a
  // fixed one dwarfed a lane of narrower cards on anything but a wide window.
  // On a phone the top of the board is as wide as the card under it, so the
  // title and the notes above the cards fit the screen the board opens to.
  const visionW = phone ? cardW : visionWidth(cardW)

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
  const noticesRowMaxW = phone ? cardW : Math.round(Math.max(NOTICE_MIN_W, (frame.w || 1200) - MARGIN * 2))
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

  /** A hand placement as it is kept, to where it shows now, and back. */
  // Anywhere on the board is a place to put things, the top included (the
  // title no longer folds open over it); only the board's own edge stops them.
  const shown = useCallback((y: number) => Math.max(0, y + shift), [shift])
  const kept = useCallback((at: Point): Point => ({ x: Math.round(at.x), y: Math.max(-shift, Math.round(at.y - shift)) }), [shift])

  /**
   * Where a piece is kept, whatever a hand is doing with it this moment.
   * The layout below reads this rather than `pieceAt`, so nothing shifts
   * around under the hand while a card is being dragged.
   */
  const laneLocked = !cardFrame
  const itemW = useCallback(
    (item: BoardItem) => (resizing?.id === item.id ? resizing.w : itemWidth(item.kind, item.w)),
    [resizing],
  )

  /**
   * The row of piece cards, with the elements standing in it between them
   * (the person's decision, 2026-10-27): each element sits after the piece it
   * was put beside, and everything to its right slides along. One being carried
   * is out of the row, so the others close up around where it will go.
   */
  const pieceIdList = useMemo(() => pieces.map((p) => p.id), [pieces])
  const hubLane = useCallback(
    (th: Thread) => (laneLocked ? threadLaneDecode(th.board_x, pieceIdList, th.board_y) : null),
    [laneLocked, pieceIdList],
  )
  const laneThings = useMemo(() => (laneLocked
    ? [
        ...items.flatMap((it) => (it.content.lane ? [{ id: it.id, w: itemW(it), lane: it.content.lane }] : [])),
        ...threads.flatMap((th) => {
          const lane = hubLane(th)
          return lane ? [{ id: th.id, w: HUB_W, lane }] : []
        }),
      ]
    : []), [laneLocked, items, threads, hubLane, itemW])
  /** The row with whatever is being carried taken out of it: where the carried thing is measured against. */
  const laneBase = useMemo(() => laneLayout(
    pieceIdList,
    laneThings.filter((t) => !(drag && (drag.kind === 'item' || drag.kind === 'hub') && drag.id === t.id)),
    cardW, GAP, LEFT_ROOM + MARGIN,
  ), [pieceIdList, laneThings, drag, cardW])
  /** Where a carried element, at `at`, would stand in the row — if it is carried over the cards. */
  const slotAt = useCallback((id: string, at: Point) => {
    const it = items.find((x) => x.id === id)
    const hub = it ? null : threads.find((x) => x.id === id)
    if (!it && !hub) return null
    const w = it ? itemW(it) : HUB_W
    const h = it ? heights[it.id] ?? FALLBACK_H[it.kind] : HUB_H
    const cy = at.y + h / 2
    if (cy < cardTop - 60 || cy > cardTop + cardH + 60) return null
    const hit = lanePlaceAt(laneBase, at.x, w)
    return hit ? { place: hit.place, w } : null
  }, [items, threads, itemW, heights, cardTop, cardH, laneBase])
  /**
   * The row as it is shown: while something is carried over it, the carried
   * element already holds its place, so the cards to its right have slid along
   * to make room (and slide further for each one added beside it). There is
   * no marker: the room opening is the answer.
   */
  const carriedSlot = laneLocked && drag && (drag.kind === 'item' || drag.kind === 'hub') ? slotAt(drag.id, drag.at) : null
  const laneOrder = useMemo(() => (carriedSlot && drag
    ? laneLayout(pieceIdList, [...laneThings.filter((t) => t.id !== drag.id), { id: drag.id, w: carriedSlot.w, lane: carriedSlot.place }], cardW, GAP, LEFT_ROOM + MARGIN)
    : laneBase),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [laneBase, laneThings, pieceIdList, cardW, carriedSlot?.place.after, carriedSlot?.place.n, carriedSlot?.w, drag?.id])
  const laneX = useMemo(() => new Map(laneOrder.order.map((e) => [e.id, e.x])), [laneOrder])
  /** Is this element standing in the row of cards? */
  const inLane = useCallback((it: BoardItem) => laneLocked && !!it.content.lane, [laneLocked])
  const pieceSpot = useCallback((piece: TreeNode, i: number): Point => ({
    // Piece cards are not moved by hand (the person's decision, 2026-10-27): they stand
    // in the lane in their order, whatever screen this is, and the lane closes up
    // around the cards' width. (An example keeps the owner's arrangement.)
    x: laneLocked ? laneX.get(piece.id) ?? cardX(i) : piece.board_x ?? cardX(i),
    y: laneLocked || piece.board_y === null || piece.board_y === undefined ? cardTop : shown(piece.board_y),
  }), [cardX, cardTop, shown, laneLocked, laneX])

  /** Where a piece sits: in its reading-order lane, until a hand moves it. */
  const pieceAt = useCallback((piece: TreeNode, i: number): Point => {
    if (drag?.kind === 'piece' && drag.id === piece.id) return drag.at
    return pieceSpot(piece, i)
  }, [drag, pieceSpot])

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

  /** Every thread has a hub, including one that runs through nothing.
   *  Hiding those took a thread off the board the moment its last piece was
   *  unticked — it still existed, but there was no way to see it or run it
   *  anywhere again. One with no piece simply stands on its own. */
  const hubs = threads

  const pieceIds = useMemo(() => new Set(pieces.map((p) => p.id)), [pieces])
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

  /**
   * The line anything auto-placed hangs below: under the row of cards as the
   * board rests. Each card's own things hang below that card (see `columns`
   * further down); this is the floor for the lot, and where things belonging
   * to no piece at all start.
   */
  const webTop = useMemo(() => cardTop + cardH + WEB_GAP, [cardTop, cardH])

  /** Has this never been put anywhere by hand? */
  const isFree = (thing: { board_x: number | null; board_y: number | null }) =>
    thing.board_x === null && thing.board_y === null

  /** Where something placed by hand is kept, as a box. Ignores a drag in flight. */
  const fixedBox = useCallback(
    (thing: { board_x: number | null; board_y: number | null }, w: number, h: number): Box => ({
      x: thing.board_x ?? LEFT_ROOM + MARGIN,
      y: thing.board_y === null ? webTop : shown(thing.board_y),
      w,
      h,
    }),
    [webTop, shown],
  )

  /**
   * Space that is already taken, which nothing placed below may land on: the
   * cards themselves, and everything a hand has put somewhere. Without this
   * the packing would be blind to them — it would reserve room for things
   * drawn elsewhere and drop new things straight on top of moved ones.
   */
  const obstacles = useMemo<Box[]>(() => {
    const taken: Box[] = pieces.map((p, i) => ({ ...pieceSpot(p, i), w: cardW, h: cardH }))
    for (const th of hubs) {
      if (hubLane(th)) taken.push({ x: laneX.get(th.id) ?? LEFT_ROOM + MARGIN, y: th.board_y === null || th.board_y === LEGACY_THREAD_LANE_Y ? cardTop : shown(th.board_y), w: HUB_W, h: HUB_H })
      else if (!isFree(th)) taken.push(fixedBox(th, HUB_W, HUB_H))
    }
    for (const it of items) {
      if (inLane(it)) taken.push({ x: laneX.get(it.id) ?? LEFT_ROOM + MARGIN, y: it.board_y === null ? cardTop : shown(it.board_y), w: itemW(it), h: itemH(it) })
      else if (!isFree(it)) taken.push(fixedBox(it, itemW(it), itemH(it)))
    }
    return taken
  }, [pieces, pieceSpot, cardW, cardH, hubs, items, fixedBox, itemW, itemH, inLane, hubLane, laneX, shown])

  /**
   * Everything under the pieces with no hand placement of its own, gathered
   * around the piece it belongs to: in the nearest empty space below its own
   * card, out to the side once the room directly under it is used, and below
   * the lot when it belongs to no piece at all. Only things that have never
   * been moved are in here — the rest is `obstacles`, which this has to clear.
   * The arithmetic is in `arrange` (board-items.ts) and tested there; this
   * only hands it what has been measured.
   */
  const autoAt = useMemo(() => arrange({
    things: [
      // Threads go in first (priority 0), so they take the space nearest the
      // card they run through: what a piece is about reads before what has
      // been hung under it. Oldest first within a kind (`seq`), so adding
      // something leaves everything already down where it is.
      ...hubs.filter(isFree).map((th) => ({
        id: th.id,
        w: HUB_W,
        h: HUB_H,
        on: [...(presence.get(th.id)?.roots ?? new Set<string>())],
        priority: 0,
        seq: Date.parse(th.created_at) || 0,
      })),
      ...items.filter((it) => isFree(it) && !inLane(it)).map((it) => ({
        id: it.id,
        w: itemW(it),
        h: itemH(it),
        on: it.node_ids.filter((id) => pieceIds.has(id)),
        priority: 1,
        seq: Date.parse(it.created_at) || 0,
      })),
    ],
    // Each card says where its own things hang from, so a card dragged down
    // the board takes its web with it instead of leaving it up by the others.
    columns: pieces.map((p, i) => {
      const spot = pieceSpot(p, i)
      return { id: p.id, x: spot.x, w: cardW, top: spot.y + cardH + WEB_GAP }
    }),
    top: webTop,
    gap: HUB_GAP,
    minX: MARGIN,
    obstacles,
  }), [hubs, items, presence, pieces, pieceSpot, pieceIds, cardW, cardH, itemW, itemH, webTop, obstacles, inLane])

  /** Where a thread's hub actually is right now. */
  const hubAt = useCallback((th: Thread): Point => {
    if (drag?.kind === 'hub' && drag.id === th.id) return drag.at
    if (hubLane(th)) return { x: laneX.get(th.id) ?? LEFT_ROOM + MARGIN, y: th.board_y === null || th.board_y === LEGACY_THREAD_LANE_Y ? cardTop : shown(th.board_y) }
    const auto = autoAt.get(th.id)
    if (th.board_x === null && th.board_y === null && auto) return auto
    return { x: th.board_x ?? auto?.x ?? LEFT_ROOM + MARGIN, y: th.board_y === null ? auto?.y ?? webTop : shown(th.board_y) }
  }, [drag, autoAt, webTop, shown, hubLane, laneX, cardTop])

  const itemAt = useCallback((it: BoardItem): Point => {
    if (drag?.kind === 'item' && drag.id === it.id) return drag.at
    if (inLane(it)) return { x: laneX.get(it.id) ?? LEFT_ROOM + MARGIN, y: it.board_y === null ? cardTop : shown(it.board_y) }
    const auto = autoAt.get(it.id)
    if (it.board_x === null && it.board_y === null && auto) return auto
    return { x: it.board_x ?? auto?.x ?? LEFT_ROOM + MARGIN, y: it.board_y === null ? auto?.y ?? webTop : shown(it.board_y) }
  }, [drag, autoAt, webTop, shown, inLane, laneX, cardTop])

  const visionAt: Point = useMemo(() => ({ x: LEFT_ROOM + MARGIN, y: MARGIN }), [])

  // ── following one thing through the web ───────────────────────────────────

  /**
   * Resting on a card, a thread or anything hanging under one lights what it
   * is connected to and drops everything else back. On a canvas with a dozen
   * threads this is the only way to read a single one of them; the arithmetic
   * is in `web-focus.ts`, and `use-lit.ts` holds the gesture (resting with a
   * mouse, holding with a finger).
   */
  // Not while a connection is being made: those modes dim and light the cards
  // for their own reasons, and two answers at once is no answer.
  const lighting = useLit(!arming && !armingItem)
  const web = useMemo(() => ({
    threads: hubs.map((th) => ({ id: th.id, on: [...(presence.get(th.id)?.roots ?? [])] })),
    items: items.map((it) => ({ id: it.id, on: it.node_ids.filter((id) => pieceIds.has(id)) })),
  }), [hubs, items, presence, pieceIds])
  const lit = useMemo(() => litBy(lighting.focus, web), [lighting.focus, web])
  /** How much of itself a block shows: all of it, or enough to keep its place. */
  const litOpacity = useCallback(
    (kind: WebKind, id: string) => (isLit(lit, kind, id) ? 1 : DIMMED),
    [lit],
  )
  /** Everything that can be put down, as boxes: what the end of the lane has to step around. */
  const boxes = useMemo<Box[]>(() => [
    ...hubs.map((th) => ({ ...hubAt(th), w: HUB_W, h: HUB_H })),
    ...items.map((it) => ({ ...itemAt(it), w: itemW(it), h: itemH(it) })),
  ], [hubs, hubAt, items, itemAt, itemW, itemH])

  // ── one step back ─────────────────────────────────────────────────────────

  const history = useUndo()
  const { forgetAbout, remember } = history

  /**
   * Taking something off the board. It goes at once and the request waits a
   * few seconds, so taking it back in that time sends nothing — there is
   * nothing to put back, because nothing happened. Those same seconds sit on
   * top of the undo stack, so ⌘Z catches it too; once the request has gone the
   * step is dropped, because from then on it is true that this cannot be
   * undone.
   */
  const bin = useCallback((id: string, label: string, send: () => void) => {
    let forget = () => {}
    const clear = () => setTaking((cur) => (cur?.id === id ? null : cur))
    binned.defer(id, () => {
      forget()
      // Once it has actually gone, every earlier step about it would do
      // nothing: moving it, renaming it, the "+" that made it. Those go too.
      forgetAbout(id)
      clear()
      send()
    })
    forget = remember(`removing ${label}`, () => { binned.cancel(id); clear() }, id)
    // The notice and ⌘Z take the same one back, however many other things have
    // happened in between.
    setTaking({ id, label, back: () => { forget(); binned.cancel(id); clear() } })
  }, [binned, forgetAbout, remember])

  /**
   * The same actions, each one keeping the way back from itself first.
   *
   * It wraps rather than reaches inside, so every call below is unchanged and
   * nothing can be moved, joined or let go of on this canvas without the way
   * back being kept. What is here is what can be put back exactly: moves,
   * sizes, connections, names, order, and the things the "+" makes. Deleting
   * is not — a deleted row cannot be made again as itself, and an undo that
   * quietly puts a near-enough copy in its place is worse than none.
   */
  const act = useMemo<BoardActions>(() => {
    const pieceOf = (id: string) => pieces.find((p) => p.id === id)
    const itemOf = (id: string) => items.find((it) => it.id === id)
    /** Where something is kept by hand, or null when it has never been moved. */
    const spotOf = (thing: { board_x?: number | null; board_y?: number | null }): Point | null =>
      thing.board_x === null || thing.board_x === undefined
        || thing.board_y === null || thing.board_y === undefined
        ? null
        : { x: thing.board_x, y: thing.board_y }

    /**
     * A thread or an item that loses its last piece belongs to no card any
     * more, so it would be placed below the whole board — it would seem to
     * leap away from under the hand that just unticked it. Letting go of the
     * last connection pins it where it already is instead, and the undo takes
     * the pin off again with the connection it puts back.
     */
    const pinThread = (th: Thread): boolean => {
      if (spotOf(th)) return false
      actions.moveThread(th.id, kept(hubAt(th)))
      return true
    }

    return {
      ...actions,

      removeThread: (id) => {
        const th = threads.find((t) => t.id === id)
        bin(id, th?.name ? `“${th.name}”` : 'the thread', () => actions.removeThread(id))
      },
      removeItem: (item) => {
        // What cannot be written again is asked about first; the rest simply
        // goes, and the few seconds afterwards are the way back.
        if (asksBeforeRemoving(item)) { setAsked(item); return }
        bin(item.id, ITEM_LABEL[item.kind], () => actions.removeItem(item))
      },

      movePiece: (id, at) => {
        const was = pieceOf(id)
        if (was) remember('the move', () => actions.movePiece(id, spotOf(was)), id)
        actions.movePiece(id, at)
      },

      moveThread: (id, at) => {
        const was = threads.find((th) => th.id === id)
        if (was) remember('the move', () => actions.moveThread(id, spotOf(was)), id)
        actions.moveThread(id, at)
      },

      renamePiece: (id, title) => {
        const was = pieceOf(id)
        if (was && was.title !== title) remember('the rename', () => actions.renamePiece(id, was.title), id)
        actions.renamePiece(id, title)
      },

      reorder: (ids) => {
        const was = pieces.map((p) => p.id)
        remember('the reordering', () => actions.reorder(was))
        actions.reorder(ids)
      },

      editThread: (id, patch) => {
        const was = threads.find((th) => th.id === id)
        if (was) {
          const back = Object.fromEntries(
            Object.keys(patch).map((key) => [key, was[key as keyof Thread]]),
          ) as Partial<Thread>
          remember('the change', () => actions.editThread(id, back), id)
        }
        actions.editThread(id, patch)
      },

      tag: (nodeId, threadId, note) => {
        const had = tagFor(nodeId, threadId)
        remember(
          had ? 'the note' : 'the connection',
          () => (had ? actions.tag(nodeId, threadId, had.note) : actions.untag(nodeId, threadId)),
          threadId,
        )
        actions.tag(nodeId, threadId, note)
      },

      untag: (nodeId, threadId) => {
        const had = tagFor(nodeId, threadId)
        const th = threads.find((t) => t.id === threadId)
        const roots = presence.get(threadId)?.roots ?? new Set<string>()
        const pinned = th && roots.size <= 1 && roots.has(nodeId) ? pinThread(th) : false
        remember('the disconnection', () => {
          actions.tag(nodeId, threadId, had?.note)
          if (pinned) actions.moveThread(threadId, null)
        }, threadId)
        actions.untag(nodeId, threadId)
      },

      patchItem: (id, patch) => {
        const was = itemOf(id)
        if (was) {
          const back: PatchItemRequest = {}
          let label = 'the change'
          if ('board_x' in patch || 'board_y' in patch) {
            back.board_x = was.board_x
            back.board_y = was.board_y
            label = 'the move'
          }
          if ('w' in patch) { back.w = was.w; label = 'the resize' }
          if (patch.node_ids) {
            back.node_ids = was.node_ids
            label = patch.node_ids.length < was.node_ids.length ? 'the disconnection' : 'the connection'
            // Same as a thread's last piece: pin it where it stands rather
            // than letting it drop below the board.
            if (patch.node_ids.length === 0 && !spotOf(was)) {
              const at = kept(itemAt(was))
              patch = { ...patch, board_x: at.x, board_y: at.y }
            }
          }
          if (patch.content) back.content = contentBack(was.content, patch.content)
          remember(label, () => actions.patchItem(id, back), id)
        }
        actions.patchItem(id, patch)
      },

      toggleTask: (task) => {
        // Toggling reads the status of the task it is handed, so the way back
        // is the same task carrying the status it is about to be given.
        const after = { ...task, status: (task.status === 'complete' ? 'pending' : 'complete') as ProjectTask['status'] }
        remember(task.status === 'complete' ? 'the untick' : 'the tick', () => actions.toggleTask(after), task.id)
        actions.toggleTask(task)
      },

      renameTask: (task, title) => {
        remember('the rewording', () => actions.renameTask({ ...task, title }, task.title), task.id)
        actions.renameTask(task, title)
      },

      reorderTasks: (ids) => {
        const was = tasks.map((t) => t.id)
        remember('the reordering', () => actions.reorderTasks(was))
        actions.reorderTasks(ids)
      },

      addTaskList: async (pieceId) => {
        const made = await actions.addTaskList(pieceId)
        remember('adding the task list', () => actions.removeItem(made), made.id)
        return made
      },
      addPalette: async (pieceId) => {
        const made = await actions.addPalette(pieceId)
        remember('adding the palette', () => actions.removeItem(made), made.id)
        return made
      },
      addLink: async (pieceId) => {
        const made = await actions.addLink(pieceId)
        remember('adding the link', () => actions.removeItem(made), made.id)
        return made
      },
      addImage: async (pieceId, file) => {
        const made = await actions.addImage(pieceId, file)
        remember('adding the image', () => actions.removeItem(made), made.id)
        return made
      },
      addRecording: async (pieceId, file, opts) => {
        const made = await actions.addRecording(pieceId, file, opts)
        remember('adding the recording', () => actions.removeItem(made), made.id)
        return made
      },
    }
  }, [actions, bin, hubAt, itemAt, items, kept, pieces, presence, remember, tagFor, tasks, threads])

  // ⌘Z, the way everyone already asks for this. Held off anything being typed
  // in, where the browser's own undo is the one that is wanted.
  useEffect(() => {
    if (!canMove) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      const on = e.target as HTMLElement | null
      if (on && (on.isContentEditable || /^(input|textarea|select)$/i.test(on.tagName))) return
      e.preventDefault()
      history.undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canMove, history])

  const slotFor = useRef<(id: string, at: Point) => { place: LanePlace } | null>(() => null)
  slotFor.current = slotAt

  const laneEnd = laneLocked
    ? laneOrder.end
    : pieces.length
      ? Math.max(...pieces.map((p, i) => pieceAt(p, i).x + cardW)) + GAP
      : LEFT_ROOM + MARGIN
  // Put something down where the next piece would go and the spot makes
  // room: it steps to the right of it, and the next piece is made there.
  const addX = addSpotX(laneEnd, addColW, GAP, { top: cardTop, bottom: cardTop + cardH }, boxes)
  // null while the end of the lane is free: the new piece takes its lane slot
  // like every other. A number means something stands there and it goes past.
  const newPieceX = addX === (laneLocked ? laneOrder.end : cardX(pieces.length)) ? null : addX

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

  /**
   * The card the board opens on, dead centre. A project with several pieces
   * has no obvious front, and opening at the left edge means scrolling back
   * to what you were doing before you can do anything — so it opens on the
   * piece last engaged with, worked out in `opening-view.ts` from the marks
   * the rows already carry. More than three pieces open zoomed out instead
   * (WIDE_OPEN_ZOOM), with the first two at the centre of the window, so the
   * shape of the whole thing and what hangs under it is in view on arrival
   * (the person's decision, 2026-10-17).
   *
   * Worked out once, on the way in. It deliberately does not follow
   * engagement afterwards: the view is the person's own from the moment they
   * arrive, and a board that slid about as they worked would be unusable.
   */
  const openOn = useRef<string | null>(null)
  if (openOn.current === null && pieces.length > 0) {
    openOn.current = opensOn({
      pieces: allPieces,
      things: [
        ...items.map((it) => ({ updated_at: it.updated_at, on: it.node_ids })),
        ...threads.map((th) => ({ updated_at: th.updated_at, on: [...(presence.get(th.id)?.roots ?? [])] })),
      ],
      opened: openedIn(project.id),
    })
  }
  const opensWide = pieces.length > WIDE_OPEN_AFTER
  // A phone opens on one card, as wide as the screen allows, with the title of
  // the project above it in view: opened zoomed out on two cards, a phone
  // showed the middle of both and the start of neither.
  // (2026-10-22, the person's own framing: the first card at about half size, its
  // left edge a little in from the screen's, running off the right so it reads as
  // a lane, the title above it, the whole sitting a third of the way down.)
  const phoneZoom = phone && frame.w ? Math.min(PHONE_ZOOM, (frame.w - PHONE_CARD_AT.x - 20) / cardW) : null
  /**
   * The whole project in one look: the title, every piece and everything
   * hanging off them, fitted to the window as the board opens (the person's
   * decision, 2026-10-20). Past a point (a long project at a size too small
   * to read) it stops trying, and the board opens the way it did before.
   */
  const whole = useMemo(() => {
    if (!frame.w || pieces.length === 0) return null
    const rects: Box[] = [
      { x: visionAt.x, y: visionAt.y, w: visionW, h: visionH },
      ...pieces.map((p, i) => ({ ...pieceSpot(p, i), w: cardW, h: cardH })),
      ...boxes,
    ]
    const x0 = Math.min(...rects.map((r) => r.x))
    const y0 = Math.min(...rects.map((r) => r.y))
    const x1 = Math.max(...rects.map((r) => r.x + r.w))
    const y1 = Math.max(...rects.map((r) => r.y + r.h))
    // Room left by the page's header above and the controls along the bottom.
    const top = 76
    const bottom = phone ? 150 : 96
    const side = phone ? 14 : 48
    const k = Math.min(1, (frame.w - side * 2) / (x1 - x0), (frame.h - top - bottom) / (y1 - y0))
    if (k < FIT_FLOOR) return null
    return { k, centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + (bottom - top) / 2 / k } }
    // Worked out for the way in only; `boxes` settles as heights are measured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.w, frame.h, pieces.length > 0])

  const initialCentre = useMemo<Point | null>(() => {
    if (!frame.w) return null
    if (whole && !phone) return whole.centre
    if (phoneZoom) {
      const spot = pieces[0] ? pieceSpot(pieces[0], 0) : { x: visionAt.x, y: cardTop }
      // The point of the board under the middle of the screen, so that the
      // first card's top-left corner lands at PHONE_CARD_AT.
      return {
        x: spot.x + (frame.w / 2 - PHONE_CARD_AT.x) / phoneZoom,
        y: spot.y + (frame.h / 2 - frame.h * PHONE_CARD_AT.y) / phoneZoom,
      }
    }
    if (opensWide) {
      const a = pieceSpot(pieces[0], 0)
      const b = pieceSpot(pieces[1], 1)
      return { x: (a.x + b.x + cardW) / 2, y: (a.y + b.y + cardH) / 2 }
    }
    const id = openOn.current
    if (!id) return null
    const i = pieces.findIndex((p) => p.id === id)
    if (i === -1) return null
    const spot = pieceSpot(pieces[i], i)
    return { x: spot.x + cardW / 2, y: spot.y + cardH / 2 }
  }, [pieces, pieceSpot, cardW, cardH, frame.w, frame.h, opensWide, phoneZoom, visionAt, whole])

  // A window narrower than the board's own size sees it a little further out,
  // exactly as it would have looked in a window that size.
  const fit = frame.w ? Math.min(1, frame.w / (cardFrame ?? BOARD_FRAME).w) : 1
  const canvas = useCanvas(ref, frame, world, {
    home, initialCentre, lookOnly: phone,
    initialZoom: phoneZoom ?? whole?.k ?? (opensWide ? WIDE_OPEN_ZOOM * fit : fit < 1 ? fit : undefined),
  })

  // ── what the example tour can ask of the board ────────────────────────────
  useEffect(() => {
    if (!tourHandle) return
    const rectOf = (id: string): Box | null => {
      const i = pieces.findIndex((p) => p.id === id)
      if (i >= 0) { const a = pieceAt(pieces[i], i); return { x: a.x, y: a.y, w: cardW, h: cardH } }
      const th = hubs.find((h) => h.id === id)
      if (th) { const a = hubAt(th); return { x: a.x, y: a.y, w: HUB_W, h: HUB_H } }
      const it = items.find((x) => x.id === id)
      if (it) { const a = itemAt(it); return { x: a.x, y: a.y, w: itemW(it), h: itemH(it) } }
      return null
    }
    tourHandle.current = {
      frame: (ids, opts = {}) => {
        const list = ids === 'all'
          ? [...pieces.map((p) => p.id), ...hubs.map((h) => h.id), ...items.map((x) => x.id)]
          : ids
        const rects = list.map(rectOf).filter((r): r is Box => !!r)
        if (!rects.length || !frame.w) return
        const x0 = Math.min(...rects.map((r) => r.x))
        const y0 = Math.min(...rects.map((r) => r.y))
        const x1 = Math.max(...rects.map((r) => r.x + r.w))
        const y1 = Math.max(...rects.map((r) => r.y + r.h)) + (opts.below ?? 0)
        const inset = { top: 0, right: 0, bottom: 0, left: 0, ...opts.inset }
        const room = { w: Math.max(120, frame.w - inset.left - inset.right), h: Math.max(120, frame.h - inset.top - inset.bottom) }
        const breathe = 36
        const k = Math.max(ZOOM.min, Math.min(opts.maxZoom ?? 1, (room.w - breathe * 2) / (x1 - x0), (room.h - breathe * 2) / (y1 - y0)))
        // The middle of what is being shown lands in the middle of the room
        // the caption leaves, not the middle of the whole window.
        const roomMid = { x: inset.left + room.w / 2, y: inset.top + room.h / 2 }
        const mid = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }
        canvas.glideTo({ x: mid.x + (frame.w / 2 - roomMid.x) / k, y: mid.y + (frame.h / 2 - roomMid.y) / k }, k, opts.ms ?? 900)
      },
      light: (focus) => lighting.show(focus),
      plus: (open) => { setMenuLive(open); setMenuFor(open ? 'corner' : null) },
    }
  })

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
    act.reorder(ids)
  }, [act, pieces])

  /** One drag gesture, for anything on the board. Persists the drop only
   *  when the pointer actually travelled — a plain click never moves
   *  anything, so every inner button keeps working exactly as it did. */
  /** The block picked up by holding it, shown lifted until it is let go. */
  const [lifted, setLifted] = useState<string | null>(null)
  /**
   * The first time a look around starts on a block, it is said once (in this
   * browser) how to move one instead, since the hold is not something anyone
   * would guess.
   */
  const hintLift = useCallback(() => {
    try {
      if (window.localStorage.getItem(LIFT_HINT)) return
      window.localStorage.setItem(LIFT_HINT, '1')
    } catch { return }
    const text = 'To move something, hold it a moment until it lifts, then drag.'
    setWord({ text, busy: false })
    window.setTimeout(() => setWord((cur) => (cur && cur.text === text ? null : cur)), 6000)
  }, [])

  /**
   * A press on a block. Moved straight away, it moves the ground, exactly as a
   * press on bare canvas does: on a crowded board there is hardly any bare
   * canvas left, and with a mouse (no two-finger scroll) every look around was
   * picking something up and dropping it somewhere else. Held still for a
   * moment, the block lifts, and then it moves where it is dragged. A plain
   * click still reaches whatever is inside the block.
   */
  const beginDrag = useCallback((
    kind: Drag['kind'], id: string, committed: Point, onDrop: (at: Point) => void,
    /** Pressed and dragged, it only ever moves the view: the first piece stays where the board begins. */
    fixed = false,
  ) => (e: React.PointerEvent) => {
    // A phone's canvas moves its own ground under a finger (lookOnly).
    if (phone) return
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
    const start = { x: e.clientX, y: e.clientY }
    const startPan = canvas.pan
    let mode: 'pressed' | 'lifted' | 'panning' = 'pressed'
    let moved = false
    let landed = committed
    const target = e.currentTarget as HTMLElement
    // Only something that can be moved lifts; a read-only canvas just pans.
    const lift = canMove && !fixed
      ? window.setTimeout(() => {
          if (mode !== 'pressed') return
          mode = 'lifted'
          setLifted(id)
        }, LIFT_MS)
      : 0
    // Capture is deferred until real movement, not set here at the down
    // event: capturing immediately redirects the click that follows a plain
    // press-and-release to this wrapper (the nearest common ancestor of
    // wherever the finger went down and up), so a rename or delete button
    // inside the card would stop receiving its own clicks entirely.
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (mode === 'pressed') {
        if (Math.abs(dx) < PAN_SLOP && Math.abs(dy) < PAN_SLOP) return
        // Moved before it lifted: this is a look around, not a move.
        mode = 'panning'
        window.clearTimeout(lift)
        target.setPointerCapture(ev.pointerId)
        if (canMove) hintLift()
      }
      if (mode === 'panning') {
        canvas.panTo({ x: startPan.x + dx, y: startPan.y + dy })
        return
      }
      const now = toWorld({ x: ev.clientX - box.left, y: ev.clientY - box.top }, canvas.pan, canvas.zoom)
      landed = keepBelow({ x: now.x - offset.x, y: now.y - offset.y }, 0)
      if (!moved && (Math.abs(landed.x - committed.x) > 3 || Math.abs(landed.y - committed.y) > 3)) {
        moved = true
        target.setPointerCapture(ev.pointerId)
      }
      if (moved) setDrag({ kind, id, at: landed })
    }
    const onUp = (ev: PointerEvent) => {
      window.clearTimeout(lift)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId)
      setLifted(null)
      setDrag(null)
      if (mode === 'lifted' && moved) onDrop(landed)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [canvas, canMove, hintLift, phone])

  /** The corner of an image or a task list, dragged to make it wider or
   *  narrower. Each kind has its own limits (lib/studio/board-items.ts). */
  const beginResize = useCallback((item: BoardItem) => (e: React.PointerEvent) => {
    if (!canMove || e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const target = e.currentTarget as HTMLElement
    const startX = e.clientX
    const startY = e.clientY
    const startW = itemWidth(item.kind, item.w)
    let w = startW
    // A task list also grows downwards: dragging the corner down shows more of its tasks.
    const startRows = item.content.rows ?? TASK_ROWS.base
    let rows = startRows
    target.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) => {
      w = itemWidth(item.kind, startW + (ev.clientX - startX) / canvas.zoom)
      if (item.kind === 'tasks') rows = Math.max(TASK_ROWS.min, Math.min(TASK_ROWS.max, startRows + Math.round((ev.clientY - startY) / canvas.zoom / TASK_ROWS.px)))
      setResizing({ id: item.id, w, rows })
    }
    const onUp = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId)
      if (w !== startW) act.patchItem(item.id, { w })
      if (rows !== startRows) act.patchItem(item.id, { content: { rows } })
      setResizing(null)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [act, canvas.zoom, canMove])

  /** Every hand placement, gone at once: hubs and items back under their pieces. */

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
    act.tag(piece.id, thread.id)
  }, [act, arming, pieces.length, presence, threads])

  /** An item joins the piece clicked, or leaves it if it was already there.
   *  With no piece left it simply stands on its own. */
  const toggleItemOn = useCallback((piece: TreeNode) => {
    const item = items.find((it) => it.id === armingItem)
    setArmingItem(null)
    if (!item) return
    const on = item.node_ids.filter((id) => pieceIds.has(id))
    act.patchItem(item.id, { node_ids: on.includes(piece.id) ? on.filter((id) => id !== piece.id) : [...on, piece.id] })
  }, [act, armingItem, items, pieceIds])

  /** A thread begins on a piece: born in that card's colour, already running
   *  through it, and opened so it can be named and carried to the others. */
  // What this canvas's "+" offers, and which of those the plan does not carry.
  const choices = useMemo<PlusChoice[]>(
    () => ['thread', ...(tools.items ? (['tasks', 'link', 'image', 'recording', 'palette'] as PlusChoice[]) : [])],
    [tools.items],
  )
  const lockedChoices = useMemo<PlusChoice[]>(
    () => [...(tools.threads ? [] : (['thread'] as PlusChoice[])), ...(tools.media ? [] : (['link', 'image', 'recording', 'palette'] as PlusChoice[]))],
    [tools.threads, tools.media],
  )

  /** Saying it at the foot of the board, then letting it go. */
  const say = useCallback((text: string) => {
    setWord({ text, busy: false })
    window.setTimeout(() => setWord((cur) => (cur && cur.text === text ? null : cur)), 6000)
  }, [])

  // ── making something new, from the corner ─────────────────────────────────
  /** The corner's "+" has been pressed and asks what to make. */
  const cornerOpen = menuFor !== null
  /** What is being made, while the dialog asks what is in it. */
  const [adding, setAdding] = useState<Exclude<PlusChoice, 'tasks'> | null>(null)
  /** A recording named and placed, waiting to be recorded. */
  const [recordFor, setRecordFor] = useState<{ on: string[]; title: string } | null>(null)

  /**
   * Makes what the dialog was told: made, then its contents and the pieces it
   * belongs to laid on in the same breath, so the undo stack holds one step,
   * "adding the …", not a step per field. No piece is an answer: it stands on
   * its own and the board places it below the pieces.
   */
  const make = useCallback(async (r: AddResult) => {
    setAdding(null)
    const first = r.on[0] ?? null
    try {
      if (r.kind === 'thread') {
        const i = first ? pieces.findIndex((p) => p.id === first) : 0
        const created = await act.addThread(pieceHue(Math.max(0, i)))
        if (!created) return
        actions.editThread(created.id, { name: r.name, intent: r.intent })
        for (const id of r.on) actions.tag(id, created.id)
        setBorn(created.id)
        return
      }
      if (r.kind === 'recording') { setRecordFor({ on: r.on, title: r.title }); return }
      let made: BoardItem
      if (r.kind === 'image') {
        setWord({ text: 'Adding the image…', busy: true })
        made = await act.addImage(first, r.file)
        setWord(null)
      } else if (r.kind === 'palette') made = await act.addPalette(first)
      else if (r.kind === 'link') made = await act.addLink(first)
      else made = await act.addTaskList(first)
      const content = r.kind === 'link'
        ? { url: r.url, ...(r.title ? { title: r.title } : {}) }
        : r.kind === 'palette'
        ? { ...(r.title ? { title: r.title } : {}), swatches: r.colours.map((hex) => ({ id: crypto.randomUUID(), hex, name: '' })) }
        : r.kind === 'tasks'
          ? { ...(r.title ? { title: r.title } : {}), tasks: r.tasks.map((title) => ({ id: crypto.randomUUID(), title, done: false })) }
          : { caption: r.caption }
      actions.patchItem(made.id, { ...(r.on.length > 1 ? { node_ids: r.on } : {}), content })
      setBorn(made.id)
    } catch (e) {
      say(e instanceof Error && e.message ? e.message : 'That did not save. Try again.')
    }
  }, [act, actions, pieces, say])

  // On a phone nothing can be moved, so the view goes to what was just made
  // rather than leave it somewhere off the screen.
  useEffect(() => {
    if (!born || !phone) return
    const id = window.setTimeout(() => {
      const it = items.find((x) => x.id === born)
      const hub = hubs.find((th) => th.id === born)
      const at = it ? { ...itemAt(it), w: itemW(it), h: itemH(it) } : hub ? { ...hubAt(hub), w: HUB_W, h: HUB_H } : null
      if (!at) return
      const k = Math.max(canvas.zoom, Math.min(1, (frame.w - 40) / at.w))
      canvas.glideTo({ x: at.x + at.w / 2, y: at.y + at.h / 2 }, k)
    }, 120)
    return () => window.clearTimeout(id)
    // Once, when it is born; its place settles in the few frames after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [born, phone])

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
        /* Held long enough to be picked up: it rises off the board, so it is
           plain that dragging now moves it rather than the view. */
        [data-lifted] {
          transform: scale(1.025); filter: drop-shadow(0 22px 34px rgba(0,0,0,0.5));
          cursor: grabbing !important; z-index: 8;
          transition: transform 150ms cubic-bezier(0.2, 0.7, 0.2, 1), filter 150ms ease !important;
        }
        .add-piece-box:hover { background: ${alpha(shell.text, 0.07)}; border-color: ${alpha(shell.text, 0.46)}; color: ${shell.text}; }
        .board-banner { bottom: calc(max(14px, env(safe-area-inset-bottom)) + 52px + 14px + 52px + 12px); }
        @media (min-width: ${DOCK_DESKTOP_MIN}px) { .board-banner { bottom: calc(22px + 52px + 12px); } }
        /* A phone only: at the top, under the page's own header, clear of the
           vision button and the Dock at the bottom. */
        .phone-banner { top: calc(max(14px, env(safe-area-inset-top)) + 62px); }
      `}</style>
      <style>{`@keyframes threadBorn {
        from { opacity: 0; transform: translateY(-10px) scaleY(0.82); }
        to   { opacity: 1; transform: none; }
      }
      @media (prefers-reduced-motion: reduce) {
        @keyframes threadBorn { from { opacity: 0 } to { opacity: 1 } }
      }`}</style>

      <Surface
        canvas={canvas}
        innerRef={ref}
        ariaLabel="The board — the pieces of this project and what hangs under them"
        chrome={
          <>
            {/* Not on a phone: two fingers are the zoom there, and the pill
               stood in the way of the vision button above the Dock. */}
            {!phone && (
              <ZoomPill
                canvas={canvas}
                onHome={canvas.resetView}
                after={
                  <>
                    <PillButton
                      label={smallCards ? 'Bigger piece cards' : 'Smaller piece cards'}
                      onClick={() => chooseCardSize(!smallCards)}
                    >
                      {smallCards ? (
                        <path d="M5 9V5h4M19 9V5h-4M5 15v4h4M19 15v4h-4" />
                      ) : (
                        <path d="M9 5v4H5M15 5v4h4M9 19v-4H5M15 19v-4h4" />
                      )}
                    </PillButton>
                    {canMove && <UndoButton next={history.next} onUndo={history.undo} />}
                  </>
                }
              />
            )}
            {phone && <PhoneBanner />}
            {/* The one way to make something new: bottom right, glowing, so
               the eye finds it. On a phone too: adding is the one thing a phone
               may change on the board (the person's exception, 2026-10-21);
               where it lands, the board decides. */}
            {(!lockedForPlan || example) && (
              <AddFan
                compact={phone}
                open={cornerOpen}
                onOpen={() => { setMenuLive(false); setMenuFor('corner') }}
                onClose={() => setMenuFor(null)}
                available={example ? (['thread', 'tasks', 'link', 'image', 'recording', 'palette'] as PlusChoice[]) : choices}
                locked={example ? [] : lockedChoices}
                inert={example && !menuLive}
                // A task list is made and opened at once: no questions first.
                onPick={(choice) => { if (choice === 'tasks') void make({ kind: 'tasks', on: [], title: '', tasks: [] }); else setAdding(choice) }}
                onLocked={(choice) => act.onLocked(choice)}
              />
            )}
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
            {taking && !arming && !armedItem && (
              <ConnectBanner colour={shell.muted} action={{ label: 'undo', onClick: taking.back }}>
                Removed {taking.label}.
              </ConnectBanner>
            )}
            {word && !arming && !armedItem && !taking && (
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
              const on = !lit || lit.lines.has(lineKey(th.id, piece.id))
              return (
                <path
                  key={`${th.id}-${piece.id}`}
                  d={smoothPath({ x: ox, y: oy }, { x: hx, y: hy })}
                  fill="none"
                  // Followed, a strand is drawn at its full colour and a
                  // little heavier; the rest of the net goes quiet rather
                  // than away, so the shape of the whole is still there.
                  stroke={alpha(colour, on ? (deep ? 0.6 : 0.95) : 0.07)}
                  strokeWidth={on && lit ? 2.4 : 1.5}
                  strokeDasharray={deep ? '1 5' : undefined}
                  strokeLinecap="round"
                  style={{ transition: `stroke ${LIT_MS}ms ease, stroke-width ${LIT_MS}ms ease` }}
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
              const on = !lit || lit.lines.has(lineKey(it.id, piece.id))
              return (
                <path
                  key={`${it.id}-${piece.id}`}
                  d={smoothPath({ x: p.x + cardW / 2, y: p.y + cardH }, top)}
                  fill="none"
                  stroke={alpha(hueOf(t, pieceHue(i)), on ? 0.85 : 0.06)}
                  strokeWidth={on && lit ? 2.4 : 1.5}
                  strokeLinecap="round"
                  style={{ transition: `stroke ${LIT_MS}ms ease, stroke-width ${LIT_MS}ms ease` }}
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
            onToggle={() => {}}
            onRename={act.renameProject}
            onEditIntent={act.editProjectIntent}
            onEditRules={act.editProjectRules}
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
          const light = lighting.bind('piece', piece.id)
          const moving = drag?.kind === 'piece' && drag.id === piece.id
          return (
            <div
              key={piece.id}
              {...light}
              data-lifted={lifted === piece.id || undefined}
              // The whole block is the block's to handle (a look around or a
              // move, see beginDrag), never the ground's as well.
              data-hold
              onPointerDown={(e) => {
                light.onPointerDown(e)
                beginDrag('piece', piece.id, at, (landed) => act.movePiece(piece.id, kept(landed)), laneLocked || i === 0)(e)
              }}
              style={{
                position: 'absolute', left: at.x, top: at.y, width: cardW, height: cardH,
                cursor: canMove ? 'grab' : 'default', touchAction: 'none',
                userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
                opacity: litOpacity('piece', piece.id),
                transition: moving
                  ? `opacity ${LIT_MS}ms ease`
                  : `left ${TIDY_MS}ms ${TIDY_EASE}, top ${TIDY_MS}ms ${TIDY_EASE}, opacity ${LIT_MS}ms ease`,
              }}
            >
              <PieceCard
                node={piece}
                width={cardW}
                height={cardH}
                compact={cardW <= COMPACT_CARD_W}
                first={i === 0}
                last={i === pieces.length - 1}
                dimmed={Boolean(armedOn && armedOn.has(piece.id))}
                targeted={targeted}
                disabled={disabled}
                showStage={pieces.length > 1}
                onOpen={(el) => act.openPiece(piece.id, el)}
                onRename={(title) => act.renamePiece(piece.id, title)}
                onRemove={() => act.removePiece(piece)}
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
            </div>
          )
        })}

        {/* the web's own blocks — one per thread, wherever it sits */}
        {hubs.map((th) => {
          const at = hubAt(th)
          const light = lighting.bind('hub', th.id)
          const moving = drag?.kind === 'hub' && drag.id === th.id
          return (
            <div
              key={th.id}
              {...light}
              data-lifted={lifted === th.id || undefined}
              // The whole block is the block's to handle (a look around or a
              // move, see beginDrag), never the ground's as well.
              data-hold
              onPointerDown={(e) => {
                light.onPointerDown(e)
                beginDrag('hub', th.id, at, (landed) => {
                  const place = laneLocked ? slotFor.current(th.id, landed)?.place ?? null : null
                  if (place) { act.moveThread(th.id, { x: threadLaneEncode(place, pieceIdList), y: kept(landed).y }); return }
                  act.moveThread(th.id, kept(landed))
                })(e)
              }}
              style={{
                position: 'absolute', left: at.x, top: at.y, cursor: canMove ? 'grab' : 'default', touchAction: 'none',
                userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
                opacity: litOpacity('hub', th.id),
                transition: moving
                  ? `opacity ${LIT_MS}ms ease`
                  : `left ${TIDY_MS}ms ${TIDY_EASE}, top ${TIDY_MS}ms ${TIDY_EASE}, opacity ${LIT_MS}ms ease`,
              }}
            >
              <Hub
                thread={th}
                born={born === th.id}
                armed={arming === th.id}
                disabled={disabled}
                onOpen={() => setOpenThread(th.id)}
                onConnect={() => arm(th)}
                onRemove={() => act.removeThread(th.id)}
              />
            </div>
          )
        })}

        {/* images, recordings and task lists: picked up and put down the same way */}
        {items.map((it) => {
          const at = itemAt(it)
          const w = itemW(it)
          const asset = it.asset_id ? assets[it.asset_id] : undefined
          const stale = () => { if (it.asset_id) act.refreshAsset(it.asset_id) }
          const light = lighting.bind('item', it.id)
          const moving = drag?.kind === 'item' && drag.id === it.id
          return (
            <div
              key={it.id}
              {...light}
              data-lifted={lifted === it.id || undefined}
              // The whole block is the block's to handle (a look around or a
              // move, see beginDrag), never the ground's as well.
              data-hold
              onPointerDown={(e) => {
                light.onPointerDown(e)
                beginDrag('item', it.id, at, (landed) => {
                  // Let go among the piece cards, it stands in the row there; anywhere
                  // else it stands where it was put, and leaves the row if it was in it.
                  const place = laneLocked ? slotFor.current(it.id, landed)?.place ?? null : null
                  if (place) { act.patchItem(it.id, { board_x: null, board_y: kept(landed).y, content: { lane: place } }); return }
                  const k = kept(landed)
                  act.patchItem(it.id, it.content.lane ? { board_x: k.x, board_y: k.y, content: { lane: null } } : { board_x: k.x, board_y: k.y })
                })(e)
              }}
              style={{
                position: 'absolute', left: at.x, top: at.y, cursor: canMove ? 'grab' : 'default', touchAction: 'none',
                // Held, an image is the system's to save unless it is told
                // otherwise, and the hold would never reach the board.
                userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
                opacity: litOpacity('item', it.id),
                transition: moving
                  ? `opacity ${LIT_MS}ms ease`
                  : `left ${TIDY_MS}ms ${TIDY_EASE}, top ${TIDY_MS}ms ${TIDY_EASE}, opacity ${LIT_MS}ms ease`,
              }}
            >
              <ItemShell
                item={it}
                width={w}
                label={ITEM_LABEL[it.kind]}
                born={born === it.id}
                armed={armingItem === it.id}
                disabled={disabled}
                resizable={canMove}
                padded={it.kind !== 'image'}
                onConnect={() => { setArming(null); setArmingItem((cur) => (cur === it.id ? null : it.id)) }}
                onRemove={() => act.removeItem(it)}
                onResizeStart={beginResize(it)}
                onHeight={(h) => setHeights((prev) => (prev[it.id] === h ? prev : { ...prev, [it.id]: h }))}
              >
                {it.kind === 'image' && (
                  <ImageBlock
                    item={it}
                    asset={asset}
                    width={w - 2}
                    disabled={disabled}
                    onCaption={(caption) => act.patchItem(it.id, { content: { caption } })}
                    onStale={stale}
                  />
                )}
                {it.kind === 'recording' && (
                  <RecordingBlock
                    item={it}
                    asset={asset}
                    disabled={disabled}
                    canRename={canMove}
                    onTitle={(title) => act.patchItem(it.id, { content: { title } })}
                    onStale={stale}
                  />
                )}
                {it.kind === 'palette' && (
                  <PaletteBlock
                    item={it}
                    disabled={disabled}
                    canRename={canMove}
                    onContent={(content) => act.patchItem(it.id, { content })}
                  />
                )}
                {it.kind === 'link' && (
                  <LinkBlock item={it} disabled={disabled} onContent={(content) => act.patchItem(it.id, { content })} />
                )}
                {it.kind === 'note' && (
                  <NoteBlock
                    item={it}
                    disabled={lockedForPlan}
                    readOnlyWords={phone}
                    onContent={(content) => act.patchItem(it.id, { content })}
                  />
                )}
                {it.kind === 'tasks' && (
                  <TaskListBlock
                    item={it}
                    pieces={piecesFor(it)}
                    allPieces={pieces.map((p) => ({ id: p.id, title: p.title }))}
                    autoOpen={born === it.id}
                    onScope={(ids) => act.patchItem(it.id, { node_ids: ids })}
                    tasks={tasks}
                    disabled={lockedForPlan}
                    rowsShown={resizing?.id === it.id ? resizing.rows : undefined}
                    onToggleTask={act.toggleTask}
                    onAddTask={act.addTask}
                    onRemoveTask={act.removeTask}
                    onRenameTask={act.renameTask}
                    onReorderTasks={act.reorderTasks}
                    onContent={(content) => act.patchItem(it.id, { content })}
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
              aria-haspopup={tools.companion ? 'menu' : undefined}
              aria-expanded={tools.companion ? askingNewPiece : undefined}
              // With the companion resting there is nothing to work a piece
              // out with, so the box does the one thing it can.
              onClick={() => (tools.companion ? setAskingNewPiece((open) => !open) : act.addPiece(newPieceX))}
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
            {pieces.length === 0 && !askingNewPiece && (
              <p style={{ ...canvasType.small, color: shell.muted, margin: '14px 0 0', textAlign: 'center', height: addHelpH - 14, boxSizing: 'border-box' }}>
                A piece is one whole thing — a film, a chapter, a song, an essay.
              </p>
            )}
            {askingNewPiece && (
              <NewPieceMenu
                onStart={() => { setAskingNewPiece(false); act.addPiece(newPieceX) }}
                onConceptualise={() => { setAskingNewPiece(false); act.conceptualisePiece(newPieceX) }}
                onClose={() => setAskingNewPiece(false)}
              />
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
          onEdit={(patch) => act.editThread(openThread, patch)}
          onTag={(nodeId) => act.tag(nodeId, openThread)}
          onNote={(nodeId, note) => act.tag(nodeId, openThread, note)}
          onUntag={(nodeId) => act.untag(nodeId, openThread)}
          onRemove={() => { setOpenThread(null); act.removeThread(openThread) }}
          onRead={() => { setOpenThread(null); act.readThread(openThread) }}
        />
      )}

      {asked && (
        <RemoveFileDialog
          item={asked}
          onCancel={() => setAsked(null)}
          onRemove={() => {
            const item = asked
            setAsked(null)
            // Past the question it goes the same way as everything else: off
            // the board now, sent in a few seconds, takeable back until then.
            bin(item.id, ITEM_LABEL[item.kind], () => actions.removeItem(item))
          }}
        />
      )}

      {asking && (
        <EverywhereDialog
          thread={asking.thread}
          onConstraint={() => { act.makeConstraint(asking.thread); setAsking(null) }}
          onAnyway={() => { act.tag(asking.toId, asking.thread.id); setAsking(null) }}
          onCancel={() => setAsking(null)}
        />
      )}

      {adding && (
        <AddFlow
          kind={adding}
          pieces={pieces.map((p, i) => ({ id: p.id, title: p.title, colour: hueOf(t, pieceHue(i)) }))}
          onCancel={() => setAdding(null)}
          onMake={(r) => void make(r)}
        />
      )}
      {recordFor && (
        <RecorderDialog
          onClose={() => setRecordFor(null)}
          onDone={async (file, opts) => {
            const it = await act.addRecording(recordFor.on[0] ?? null, file, { ...opts, ...(recordFor.title ? { title: recordFor.title } : {}) })
            if (recordFor.on.length > 1) actions.patchItem(it.id, { node_ids: recordFor.on })
            setBorn(it.id)
          }}
        />
      )}
    </>
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
  const noHover = useNoHover()
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
          <div style={{ display: 'flex', gap: 1, flexShrink: 0, opacity: hover || armed || noHover ? 1 : 0, pointerEvents: hover || armed || noHover ? 'auto' : 'none', transition: 'opacity 140ms ease' }}>
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

/** One step back, sharing the zoom pill's glass. Named as the thing it would
 *  put back, so it says what pressing it does before it is pressed. */
function UndoButton({ next, onUndo }: { next: string | null; onUndo: () => void }) {
  const label = next ? `undo ${next}` : 'nothing to undo'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!next}
      onClick={onUndo}
      style={{
        width: 30, height: 30, borderRadius: 999, padding: 0, border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent',
        color: next ? shell.muted : alpha(shell.muted, 0.35),
        cursor: next ? 'pointer' : 'default',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9h11a5 5 0 0 1 0 10h-6" />
        <path d="M8 5 4 9l4 4" />
      </svg>
    </button>
  )
}

// ── starting a thread from the piece it runs through ────────────────────────


// ── what the board says while you are connecting ────────────────────────────

/**
 * Said on a phone, where the board can be looked at and added to but not arranged: once
 * in this browser, for a few seconds, and gone at a tap. Said every time and
 * for good, it was a box sitting over the bottom of every canvas.
 */
const PHONE_NOTE = 'companheiro.phone-note.seen'
function PhoneBanner() {
  const [shown, setShown] = useState(false)
  const [going, setGoing] = useState(false)
  useEffect(() => {
    try { if (window.localStorage.getItem(PHONE_NOTE)) return; window.localStorage.setItem(PHONE_NOTE, '1') } catch { /* say it this once */ }
    setShown(true)
    const fade = window.setTimeout(() => setGoing(true), 6000)
    const gone = window.setTimeout(() => setShown(false), 6500)
    return () => { window.clearTimeout(fade); window.clearTimeout(gone) }
  }, [])
  if (!shown) return null
  return (
    <div
      data-hold
      role="status"
      className="phone-banner"
      onClick={() => { setGoing(true); window.setTimeout(() => setShown(false), 400) }}
      style={{
        position: 'absolute', left: 16, right: 16, zIndex: 41,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px', borderRadius: 14,
        background: 'rgba(13,12,11,0.84)', backdropFilter: 'blur(18px) saturate(1.1)',
        WebkitBackdropFilter: 'blur(18px) saturate(1.1)',
        border: `1px solid ${shell.line}`,
        opacity: going ? 0 : 1, transform: going ? 'translateY(-6px)' : 'none',
        transition: 'opacity 400ms ease, transform 400ms ease',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={shell.muted} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
        <rect x="7" y="2.5" width="10" height="19" rx="2.4" />
        <path d="M11 18h2" />
      </svg>
      <span style={{ ...canvasType.small, fontSize: 12.5, lineHeight: 1.4, color: shell.text }}>
        Two fingers to look around. Tap a piece to open it, or + to add something.
      </span>
    </div>
  )
}

function ConnectBanner({ colour, onCancel, action, children }: {
  colour: string
  /** Absent while something is under way that cannot be called off. */
  onCancel?: () => void
  /** Something to do about it, rather than only to stop it. */
  action?: { label: string; onClick: () => void }
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
        padding: onCancel || action ? '8px 10px 8px 14px' : '8px 14px', borderRadius: 999,
        background: 'rgba(13,12,11,0.84)', backdropFilter: 'blur(18px) saturate(1.1)',
        border: `1px solid ${alpha(colour, 0.5)}`,
      }}
    >
      <i aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: colour, flexShrink: 0 }} />
      <span style={{ ...canvasType.small, fontSize: 12.5, color: shell.text }}>{children}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          style={{
            ...canvasType.chip, color: shell.text, background: alpha(shell.text, 0.12),
            border: 'none', borderRadius: 999, cursor: 'pointer', padding: '4px 10px', flexShrink: 0,
          }}
        >
          {action.label}
        </button>
      )}
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

/** The removals that take something with them which cannot be written again. */
function RemoveFileDialog({ item, onRemove, onCancel }: {
  item: BoardItem
  onRemove: () => void
  onCancel: () => void
}) {
  const { t } = useTheme()
  const own = item.content.tasks?.length ?? 0
  const title = item.kind === 'image' ? 'Remove this picture?'
    : item.kind === 'recording' ? 'Remove this recording?'
      : 'Remove this task list?'
  const name = item.content.caption || item.content.title || ''
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
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420, padding: 24, borderRadius: radius.card,
          background: t.containerBg, boxShadow: t.containerShadow,
        }}
      >
        <h2 style={{ ...canvasType.headingMd, fontSize: 20, color: t.textPrimary, margin: 0 }}>{title}</h2>
        <p style={{ ...canvasType.small, color: t.textSecondary, margin: '10px 0 0' }}>
          {item.kind === 'tasks' ? (
            <>The {own === 1 ? 'task' : `${own} tasks`} written onto it {own === 1 ? 'goes' : 'go'} with
            it. The writing tasks stay where they are, on the pieces.</>
          ) : (
            <>
              {name && <><strong style={{ color: t.textPrimary, fontWeight: 600 }}>{name}</strong> — the </>}
              {!name && 'The '}
              {item.kind === 'image' ? 'picture' : 'recording'} itself goes too, not just the card.
            </>
          )}
        </p>
        <p style={{ ...canvasType.small, color: t.textMuted, margin: '10px 0 0' }}>
          There are a few seconds to take it back afterwards. After that it is gone for good.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <Choice onClick={onCancel} quiet>Keep it</Choice>
          <Choice onClick={onRemove}>Remove it</Choice>
        </div>
      </div>
    </div>
    </Portal>
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
