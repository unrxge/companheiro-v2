// What sits on a project's canvas besides its pieces and threads: images,
// recordings and task lists (migration 028). The shapes both sides share, and
// the arithmetic about where those things may go. No React, so it is tested
// on its own.

import type { AssetView } from '@/lib/studio/types'
import { WRITING, categoryOf } from '@/lib/studio/task-groups'

export type BoardItemKind = 'image' | 'recording' | 'tasks' | 'palette'

/** A task that belongs to the list itself: anything that is not the writing. */
export interface OwnTask { id: string; title: string; done: boolean }

/** One colour on a palette. The name is the person's own and may be blank. */
export interface Swatch { id: string; hex: string; name: string }

/** How many colours one palette holds. */
export const MAX_SWATCHES = 12
/** What a new palette starts with. */
export const PALETTE_SEED = '#C86A3A'

/** `#rgb` or `#rrggbb`, in a form the browser will take. Null when it is not a colour. */
export function cleanHex(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  const short = /^#?([0-9a-f]{3})$/.exec(v)
  if (short) return `#${short[1].split('').map((c) => c + c).join('')}`.toUpperCase()
  const long = /^#?([0-9a-f]{6})$/.exec(v)
  return long ? `#${long[1]}`.toUpperCase() : null
}

export interface BoardItemContent {
  /** A recording's name. */
  title?: string
  /** An image's caption. */
  caption?: string
  /** A task list's own tasks. */
  tasks?: OwnTask[]
  /** The writing tasks are folded away. */
  writing_closed?: boolean
  /** A palette's colours. */
  swatches?: Swatch[]
}

/** What each part of a content block is when it has never been set. */
const EMPTY_CONTENT: Required<BoardItemContent> = {
  title: '', caption: '', tasks: [], writing_closed: false, swatches: [],
}

/**
 * The content patch that puts `patch` back: the old value of each part it
 * touches, and the empty one where there was nothing there before. Content is
 * merged rather than replaced, so only the named parts have to be named back.
 */
export function contentBack(was: BoardItemContent, patch: BoardItemContent): BoardItemContent {
  const back: Record<string, unknown> = {}
  for (const key of Object.keys(patch) as (keyof BoardItemContent)[]) {
    back[key] = was[key] ?? EMPTY_CONTENT[key]
  }
  return back as BoardItemContent
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
  palette: { base: 300, min: 220, max: 560 },
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
export const FALLBACK_H: Record<BoardItemKind, number> = { image: 240, tasks: 220, recording: RECORDING_H, palette: 128 }
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
// Only things that have never been moved by hand are placed here. Everything
// else — a card, a thread or a picture someone has already put somewhere, the
// vision block — is an obstacle: space that is taken.
//
// A new thing goes in the nearest empty space to its own card that it fits in.
// Nearest means nearest: the distance from the card, not the first free row.
// So something added to a crowded piece appears beside the pile rather than
// below all of it, and nothing ever lands on anything else.
//
// Three things decide where something goes:
//
//   1. WHOSE IT IS. It hangs below its own card, in the band belonging to that
//      piece — wider than the card, reaching into the space either side, so a
//      row can hold two things rather than one card's worth.
//   2. WHAT IT IS. Threads go in first, so they take the space closest to the
//      card they run through.
//   3. WHERE IT FITS. After that, the nearest free spot that holds it.
//
// Things already down keep their place when another arrives: within a kind,
// they go in in the order they were made, so the new one is last to choose and
// takes what is left rather than pushing the others along.
//
// Things connected to nothing belong to no band, so they go below the lot.

export interface ArrangeThing {
  id: string
  w: number
  h: number
  /** The top-level pieces it is connected to; empty means it stands alone. */
  on: string[]
  /** Lower goes in first, so it ends up nearer the card. Threads are 0. */
  priority?: number
  /** Order made. Earlier keeps its spot when something new arrives. */
  seq?: number
}

export interface ArrangeColumn {
  id: string
  /** The card's own left edge and width. */
  x: number
  w: number
  /** The line this card's own things hang below; the board's `top` otherwise. */
  top?: number
}

/** Space that is already taken: a card, or anything put down by hand. */
export interface ArrangeBox { x: number; y: number; w: number; h: number }

export interface ArrangeInput {
  things: ArrangeThing[]
  /** The pieces, left to right as they actually sit. */
  columns: ArrangeColumn[]
  /** The line everything hangs below. */
  top: number
  gap: number
  /** Nothing is placed further left than this. */
  minX: number
  /** How far past the outermost cards the end bands may reach. */
  outerRoom?: number
  /** Everything already placed, which nothing here may land on. */
  obstacles?: ArrangeBox[]
}

/**
 * The board as a set of taken rectangles, which answers one question: where is
 * the nearest empty space of this size.
 *
 * Candidate corners come off what is already down — flush under a box, flush
 * beside it, and the edges of the band — so a thing tucks against its
 * neighbours instead of landing on a grid. Each candidate is tested against
 * everything on the board, and the one closest to the card wins.
 */
class Field {
  private boxes: ArrangeBox[]
  constructor(taken: ArrangeBox[]) {
    this.boxes = taken.map((b) => ({ ...b }))
  }

  /** Would a thing of this size, here, clear everything already down by `gap`? */
  private free(x: number, y: number, w: number, h: number, gap: number): boolean {
    for (const b of this.boxes) {
      if (x + w + gap <= b.x || b.x + b.w + gap <= x) continue
      if (y + h + gap <= b.y || b.y + b.h + gap <= y) continue
      return false
    }
    return true
  }

  /**
   * Puts one thing in the nearest empty space it fits in. `within` is the
   * stretch of board it may use — its own piece's reach — and `card` the
   * rectangle it wants to be near: its own card's edges and its bottom.
   *
   * Nearness is measured from the card itself, not from a point on it: how far
   * below it the thing sits, and how far it sticks out past either side. So
   * anywhere directly under the card is equally near, and those places fill up
   * — left to right, then down a row — before anything reaches out beside it.
   */
  put(
    w: number, h: number, gap: number,
    within: { left: number; right: number },
    card: { left: number; right: number; y: number },
  ): ArrangeBox {
    const floor = card.y
    const left = within.left
    const right = within.right
    const width = Math.min(w, Math.max(80, right - left))
    const xs = new Set<number>([left, right - width, card.left, card.right - width])
    const ys = new Set<number>([floor])
    for (const b of this.boxes) {
      xs.add(b.x)
      xs.add(b.x + b.w + gap)
      xs.add(b.x - width - gap)
      ys.add(b.y)
      ys.add(b.y + b.h + gap)
    }
    const rows = [...ys].filter((y) => y >= floor - 0.5).sort((a, b) => a - b)
    let best: { x: number; y: number; cost: number } | null = null
    for (const raw of rows) {
      const y = Math.max(floor, raw)
      // Rows are tried from the top down. Once something has been found, a row
      // far enough below it cannot beat it however well it lines up sideways,
      // so the search stops rather than walking the whole board.
      if (best && y - floor > best.cost) break
      for (const rx of xs) {
        const x = Math.max(left, Math.min(rx, right - width))
        if (!this.free(x, y, width, h, gap)) continue
        // How far it hangs past the card on either side, and how far below it.
        const dx = Math.max(0, card.left - x, x + width - card.right)
        const dy = y - floor
        const cost = Math.hypot(dx, dy)
        if (!best || cost < best.cost - 0.5
          || (Math.abs(cost - best.cost) <= 0.5 && (y < best.y - 0.5 || (Math.abs(y - best.y) <= 0.5 && x < best.x)))) {
          best = { x, y, cost }
        }
      }
    }
    const at = best ?? { x: left, y: this.bottom(floor) }
    const box = { x: Math.round(at.x), y: Math.round(at.y), w: width, h }
    this.boxes.push(box)
    return box
  }

  /** How far down anything has reached. */
  bottom(floor: number): number {
    return this.boxes.reduce((low, b) => Math.max(low, b.y + b.h), floor)
  }
}

export const OUTER_ROOM = 560

/**
 * Where everything with no hand placement goes. Returns one point per thing,
 * by id. Pure: the board passes in the widths and heights it has measured,
 * and the boxes of everything already down.
 */
export function arrange(input: ArrangeInput): Map<string, { x: number; y: number }> {
  const { things, columns, top, gap, minX, outerRoom = OUTER_ROOM, obstacles = [] } = input
  const out = new Map<string, { x: number; y: number }>()
  if (things.length === 0) return out

  const byId = new Map(columns.map((c) => [c.id, c]))
  const order = [...columns].sort((a, b) => a.x - b.x)

  /**
   * The run of board each piece's things may use: out into the space either
   * side of the card, as far as the neighbouring card but never back over it,
   * and well past the ends for the two on the outside. Wider than the card on
   * purpose — a band the exact width of the card can only ever hold one column
   * of things, which is what made the old arrangement look ruled rather than
   * arranged. Bands do meet their neighbours', which is safe: one packing
   * covers the whole board, so a thing may use the room beside the next card
   * when it is free and still cannot land on anything.
   */
  const bands = new Map<string, { left: number; right: number }>()
  order.forEach((c, i) => {
    const slack = Math.max(gap, c.w)
    const prev = order[i - 1]
    const next = order[i + 1]
    const left = prev
      ? Math.max(minX, c.x - slack, prev.x + prev.w)
      : Math.max(minX, c.x - outerRoom)
    const right = next
      ? Math.min(c.x + c.w + slack, next.x + gap)
      : c.x + c.w + outerRoom
    bands.set(c.id, { left, right })
  })

  /** The band a thing hangs in: the piece nearest the middle of its own. */
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

  const near = order.length ? bands.get(order[0].id)!.left : minX
  const far = order.length ? bands.get(order[order.length - 1].id)!.right : minX + 1200
  // One field for the whole board, seeded with everything already down, so a
  // thing placed here avoids the cards and anything anyone has moved by hand.
  const field = new Field(obstacles)

  /**
   * Threads first, so they take the space nearest their card: what a piece is
   * about reads before what has been hung under it. Within a kind, oldest
   * first, so the one just made is the one that has to take what is left.
   */
  const queue: Array<{ thing: ArrangeThing; column: ArrangeColumn }> = []
  for (const column of order) {
    for (const thing of grouped.get(column.id) ?? []) queue.push({ thing, column })
  }
  queue.sort((a, b) =>
    (a.thing.priority ?? 1) - (b.thing.priority ?? 1)
    || a.column.x - b.column.x
    || (a.thing.seq ?? 0) - (b.thing.seq ?? 0))

  for (const { thing, column } of queue) {
    const band = bands.get(column.id)!
    const card = { left: column.x, right: column.x + column.w, y: Math.max(top, column.top ?? top) }
    out.set(thing.id, field.put(thing.w, thing.h, gap, band, card))
  }

  // What belongs to no piece sits below the lot, across the whole width.
  if (loose.length > 0) {
    const under = field.bottom(top)
    const floor = under === top ? top : under + gap
    const below = new Field([])
    for (const thing of [...loose].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))) {
      out.set(thing.id, below.put(thing.w, thing.h, gap, { left: near, right: far }, { left: near, right: far, y: floor }))
    }
  }

  return out
}
