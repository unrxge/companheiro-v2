// What sits on a project's canvas besides its pieces and threads: images,
// recordings and task lists (migration 028). The shapes both sides share, and
// the arithmetic about where those things may go. No React, so it is tested
// on its own.

import type { AssetView } from '@/lib/studio/types'
import { WRITING, categoryOf } from '@/lib/studio/task-groups'

export type BoardItemKind = 'image' | 'recording' | 'tasks'

/** A task that belongs to the list itself: anything that is not the writing. */
export interface OwnTask { id: string; title: string; done: boolean }

export interface BoardItemContent {
  /** A recording's name. */
  title?: string
  /** An image's caption. */
  caption?: string
  /** A task list's own tasks. */
  tasks?: OwnTask[]
  /** The writing tasks are folded away. */
  writing_closed?: boolean
}

export interface BoardItem {
  id: string
  user_id: string
  project_id: string
  kind: BoardItemKind
  asset_id: string | null
  /** The top-level pieces it is connected to. Empty: it stands on its own. */
  node_ids: string[]
  /** Where a hand put it. null: under the pieces it is connected to. */
  board_x: number | null
  board_y: number | null
  /** The width a hand gave it. null: the kind's default. */
  w: number | null
  content: BoardItemContent
  created_at: string
  updated_at: string
}

/** A piece's task, as the task list reads it (a studio_tasks row). */
export interface ProjectTask {
  id: string
  node_id: string
  title: string
  type: 'creation' | 'execution'
  status: 'pending' | 'complete'
  is_writing_related: boolean | null
  /** The group it sits under (migration 029). null: read from the older flag. */
  category?: string | null
}

export interface ItemsPayload {
  /** false until migration 028 is applied: the canvas then offers threads only. */
  ready: boolean
  items: BoardItem[]
  assets: AssetView[]
  tasks: ProjectTask[]
}

export interface CreateItemRequest {
  kind: BoardItemKind
  /** The piece whose "+" it came from. */
  node_id?: string | null
  asset_id?: string | null
  content?: BoardItemContent
}

export interface PatchItemRequest {
  board_x?: number | null
  board_y?: number | null
  w?: number | null
  node_ids?: string[]
  content?: BoardItemContent
}

/** Under Writing: the same grouping the writing page's Tasks tool applies. */
export const isWritingTask = (task: Pick<ProjectTask, 'type' | 'is_writing_related' | 'category'>) =>
  categoryOf(task) === WRITING

// ── sizes ───────────────────────────────────────────────────────────────────
// Images can be made a good deal larger or smaller. A task list only a
// little either way. Recordings, like a thread's block, are one size.

export const ITEM_WIDTH: Record<BoardItemKind, { base: number; min: number; max: number }> = {
  image: { base: 320, min: 160, max: 960 },
  tasks: { base: 300, min: 260, max: 380 },
  recording: { base: 300, min: 300, max: 300 },
}
export const RECORDING_H = 116
/** Rows a caption may wrap to before it stops growing. */
export const CAPTION_ROWS = 2
/**
 * The most a caption may hold at all. The working limit is worked out from
 * the width the box actually has (`captionLimit`), so a caption can never run
 * past the two rows it is allowed; these are the ceilings that keep a picture's
 * caption the longer of the two however wide either block is dragged.
 */
export const CAPTION_MAX: Record<'caption' | 'title', number> = { caption: 200, title: 90 }

/**
 * Roughly how wide one character is, as a share of the font size. Measured
 * against the real thing rather than assumed: at 12.5px in a 296px box this
 * app's type fits about 40 characters to the line.
 */
const CHAR_EM = 0.58

/**
 * How many characters fit the two rows a caption has, at the width it has
 * been given. Wider block, longer caption — which is why a picture's caption
 * holds more than a recording's name without either one being able to overrun.
 */
export function captionLimit(innerWidth: number, fontSize: number, hardMax: number): number {
  if (!(innerWidth > 0) || !(fontSize > 0)) return hardMax
  const perLine = innerWidth / (fontSize * CHAR_EM)
  // Comfortably under what fits, so ordinary prose never reaches a third row.
  return Math.max(24, Math.min(hardMax, Math.floor(perLine * CAPTION_ROWS * 0.9)))
}
/** Used before a task list has been measured, and for an image with no known shape. */
export const FALLBACK_H: Record<BoardItemKind, number> = { image: 240, tasks: 220, recording: RECORDING_H }
const CAPTION_H = 34

export const canResize = (kind: BoardItemKind) => ITEM_WIDTH[kind].min !== ITEM_WIDTH[kind].max

export function itemWidth(kind: BoardItemKind, w: number | null | undefined): number {
  const { base, min, max } = ITEM_WIDTH[kind]
  if (typeof w !== 'number' || !Number.isFinite(w)) return base
  return Math.round(Math.min(max, Math.max(min, w)))
}

/** An image keeps its own proportions at whatever width it is given. */
export function imageHeight(width: number, asset: Pick<AssetView, 'width' | 'height'> | null | undefined, caption: boolean): number {
  const ratio = asset?.width && asset?.height ? asset.height / asset.width : 0.75
  return Math.round(width * Math.min(2.5, Math.max(0.25, ratio))) + (caption ? CAPTION_H : 0)
}

// ── where things may go ─────────────────────────────────────────────────────

export interface Box { x: number; y: number; w: number; h: number }

/**
 * The top of the canvas belongs to the title, whatever is waiting on an
 * answer, and the core concept. Nothing dragged may rest above `top`, the
 * line the pieces start on, or off the left edge.
 */
export function keepBelow(at: { x: number; y: number }, top: number): { x: number; y: number } {
  return { x: Math.round(Math.max(0, at.x)), y: Math.round(Math.max(top, at.y)) }
}

/**
 * Where the "add a piece" spot stands. Normally straight after the last piece
 * (`laneEnd`); when something has been put down in that space, it steps to
 * the right of it, so the thing keeps its room and the spot is never covered.
 * `band` is the strip the pieces occupy, top to bottom.
 */
export function addSpotX(laneEnd: number, spotW: number, gap: number, band: { top: number; bottom: number }, things: Box[]): number {
  let x = laneEnd
  // Each step right can bring another thing into the way, so sweep left to right.
  for (const b of [...things].sort((a, c) => a.x - c.x)) {
    const inBand = b.y < band.bottom && b.y + b.h > band.top
    const inTheWay = b.x < x + spotW + gap / 2 && b.x + b.w > x - gap / 2
    if (inBand && inTheWay) x = Math.round(b.x + b.w + gap)
  }
  return x
}

/**
 * Lays blocks of different widths along one row at the centres they would
 * like, in that order, never closer than `gap`. The same idea as packRow in
 * surface.ts, for a row that now holds things of several sizes.
 */
export function packSpans(wanted: Array<{ centre: number; w: number }>, gap: number, minLeft = 0): number[] {
  const order = wanted.map((_, i) => i).sort((a, b) => wanted[a].centre - wanted[b].centre)
  const left = new Array<number>(wanted.length)
  let edge = -Infinity
  for (const i of order) {
    const x = Math.max(minLeft, wanted[i].centre - wanted[i].w / 2, edge + gap)
    left[i] = Math.round(x)
    edge = x + wanted[i].w
  }
  return left
}

// ── arranging what hangs under the pieces ───────────────────────────────────
//
// Everything with no hand placement is laid out here. The old arrangement put
// them all in one long row, which falls apart as soon as a project has a few
// pieces and several things hanging off them: the row runs off to the right,
// and the line from a thing to its piece crosses half the board.
//
// So things gather around the piece they belong to instead, in this order:
//
//   1. under their own piece, in the card's own width, small things side by
//      side — the space directly below a card is used up first;
//   2. when that column has grown past `sideAfter`, out to the side — but
//      only where there is open board: the leftmost piece puts them on its
//      left, the rightmost on its right. A piece with neighbours on both
//      sides has no side to spill into, so it keeps going down rather than
//      wander into the space belonging to another card;
//   3. things connected to nothing belong to no column, so they go below
//      everything in a row of their own, wrapping across the width the
//      pieces already occupy.
//
// A thing connected to several pieces hangs under the one nearest the middle
// of them all, which keeps its lines short without putting it between cards.

export interface ArrangeThing {
  id: string
  w: number
  h: number
  /** The top-level pieces it is connected to; empty means it stands alone. */
  on: string[]
}

export interface ArrangeColumn {
  id: string
  /** The card's own left edge and width. */
  x: number
  w: number
}

export interface ArrangeInput {
  things: ArrangeThing[]
  /** The pieces, left to right as they actually sit. */
  columns: ArrangeColumn[]
  /** The line everything hangs below. */
  top: number
  gap: number
  /** How tall one piece's column may grow before it spills to the side. */
  sideAfter: number
  /** Nothing is placed further left than this. */
  minX: number
}

/** A band that fills and wraps inside a fixed width, left to right or right
 *  to left — a band to the left of a card is filled from the card outwards,
 *  so a narrow thing still sits beside it rather than off on its own. */
interface Shelf {
  x: number
  w: number
  rtl: boolean
  rowY: number
  /** The edge the next thing goes against: the row's left, or its right. */
  rowEdge: number
  rowH: number
  started: boolean
}

const newShelf = (x: number, w: number, top: number, rtl = false): Shelf =>
  ({ x, w, rtl, rowY: top, rowEdge: rtl ? x + w : x, rowH: 0, started: false })

/** The least room worth calling a band of its own. */
const MIN_SIDE_W = 160

/** Puts one thing on a band, wrapping to a new row when it will not fit. */
function placeOn(shelf: Shelf, thing: ArrangeThing, gap: number): { x: number; y: number } {
  const startsRow = shelf.rowEdge === (shelf.rtl ? shelf.x + shelf.w : shelf.x)
  const fits = startsRow || (shelf.rtl
    ? shelf.rowEdge - thing.w >= shelf.x
    : shelf.rowEdge + thing.w <= shelf.x + shelf.w)
  if (!fits) {
    shelf.rowY = shelf.rowY + shelf.rowH + gap
    shelf.rowEdge = shelf.rtl ? shelf.x + shelf.w : shelf.x
    shelf.rowH = 0
  }
  const x = shelf.rtl ? shelf.rowEdge - thing.w : shelf.rowEdge
  const at = { x: Math.round(x), y: shelf.rowY }
  shelf.rowEdge = shelf.rtl ? x - gap : x + thing.w + gap
  shelf.rowH = Math.max(shelf.rowH, thing.h)
  shelf.started = true
  return at
}

/** How far down a band currently reaches. */
const shelfBottom = (shelf: Shelf, top: number): number =>
  shelf.started ? shelf.rowY + shelf.rowH : top

/**
 * Where everything with no hand placement goes. Returns one point per thing,
 * by id. Pure: the board passes in the widths and heights it has measured.
 */
export function arrange(input: ArrangeInput): Map<string, { x: number; y: number }> {
  const { things, columns, top, gap, sideAfter, minX } = input
  const out = new Map<string, { x: number; y: number }>()
  if (things.length === 0) return out

  const byId = new Map(columns.map((c) => [c.id, c]))
  const order = [...columns].sort((a, b) => a.x - b.x)
  const leftmost = order[0]
  const rightmost = order[order.length - 1]

  /** The column a thing hangs under: the one nearest the middle of its pieces. */
  const columnFor = (thing: ArrangeThing): ArrangeColumn | null => {
    const mine = thing.on.map((id) => byId.get(id)).filter((c): c is ArrangeColumn => !!c)
    if (mine.length === 0) return null
    if (mine.length === 1) return mine[0]
    const middle = mine.reduce((sum, c) => sum + c.x + c.w / 2, 0) / mine.length
    return mine.reduce((best, c) =>
      Math.abs(c.x + c.w / 2 - middle) < Math.abs(best.x + best.w / 2 - middle) ? c : best)
  }

  const grouped = new Map<string, ArrangeThing[]>()
  const loose: ArrangeThing[] = []
  for (const thing of things) {
    const column = columnFor(thing)
    if (!column) { loose.push(thing); continue }
    const list = grouped.get(column.id) ?? []
    list.push(thing)
    grouped.set(column.id, list)
  }

  let deepest = top

  for (const column of order) {
    const mine = grouped.get(column.id)
    if (!mine || mine.length === 0) continue

    // Under the card first. Only the leftmost and rightmost pieces have open
    // board beside them; anything between two cards keeps going down.
    const side = column.id === leftmost.id && columns.length > 1
      ? 'left'
      : column.id === rightmost.id && columns.length > 1
        ? 'right'
        : null

    const under = newShelf(column.x, column.w, top)
    let beside: Shelf | null = null
    // A side is only usable if there is actually board there to use. The
    // leftmost card can sit close enough to the edge that its left is too
    // narrow for anything, and then the column keeps going down instead.
    let hasSide = side !== null
    const widest = Math.max(...mine.map((t) => t.w))

    // The tall ones first, so the small ones fill in around them rather than
    // leaving a short row with a tall thing stranded beneath it.
    for (const thing of [...mine].sort((a, b) => b.h - a.h || b.w - a.w)) {
      if (hasSide && !beside && shelfBottom(under, top) - top >= sideAfter) {
        if (side === 'left') {
          const room = column.x - gap - minX
          if (room >= Math.min(widest, MIN_SIDE_W)) {
            const w = Math.min(widest, room)
            beside = newShelf(column.x - gap - w, w, top, true)
          } else {
            hasSide = false
          }
        } else {
          beside = newShelf(column.x + column.w + gap, widest, top)
        }
      }
      out.set(thing.id, placeOn(beside ?? under, thing, gap))
    }

    deepest = Math.max(deepest, shelfBottom(under, top), beside ? shelfBottom(beside, top) : top)
  }

  // What belongs to no piece sits below the lot, across the pieces' own width.
  if (loose.length > 0) {
    const spanLeft = order.length ? order[0].x : minX
    const spanRight = order.length ? rightmost.x + rightmost.w : spanLeft + 1200
    const shelf = newShelf(spanLeft, Math.max(320, spanRight - spanLeft), deepest === top ? top : deepest + gap)
    for (const thing of loose) out.set(thing.id, placeOn(shelf, thing, gap))
  }

  return out
}
