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
// Everything with no hand placement of its own is laid out here.
//
// It is packed, not ruled into rows. Each thing drops into the lowest place it
// will fit, so a short one tucks under a short one and a tall one keeps its
// own run of board — which is what makes the result look arranged by hand
// rather than set in a table, while still never overlapping and never
// wandering away from the piece it belongs to.
//
// Three things decide where something goes:
//
//   1. WHOSE IT IS. It sits in the band belonging to its piece — a band wider
//      than the card, reaching into the space either side of it, so a row can
//      hold two things of different widths rather than one card's worth.
//   2. WHAT IT IS. Threads are placed first, so they take the top of the band,
//      nearest the card they run through.
//   3. WHERE IT FITS. After that, the lowest free spot wins.
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
  /** Nothing is placed further left than this. */
  minX: number
  /** How far past the outermost cards the end bands may reach. */
  outerRoom?: number
}

/**
 * A run of board at a given height. Packing keeps a list of these — the
 * "skyline" — and drops each new thing into the lowest run it fits.
 */
interface Span { x: number; w: number; y: number }

class Skyline {
  private spans: Span[]
  constructor(private left: number, private width: number, top: number) {
    this.spans = [{ x: left, w: width, y: top }]
  }

  /** The highest point along [x, x + w): what a thing put there would rest on. */
  private restsAt(x: number, w: number): number {
    let y = -Infinity
    for (const s of this.spans) {
      if (s.x + s.w <= x || s.x >= x + w) continue
      if (s.y > y) y = s.y
    }
    return y === -Infinity ? this.spans[0]?.y ?? 0 : y
  }

  /**
   * Drops one thing into the lowest place it fits. `within` is the stretch it
   * is allowed to use — its own piece's reach — and `prefer` the x it would
   * rather have. Height decides first, so things tuck under each other; among
   * places of much the same height, the one nearest home wins, which is what
   * keeps a piece's things together while letting them spread sideways.
   */
  place(
    w: number, h: number, gap: number,
    within: { left: number; right: number },
    prefer: number,
  ): { x: number; y: number } {
    const left = Math.max(this.left, within.left)
    const right = Math.min(this.left + this.width, within.right)
    const width = Math.min(w, Math.max(80, right - left))
    // Every run's start is a candidate, and so is its right-hand end: a thing
    // can tuck against either side of what is already down.
    const candidates = new Set<number>([left, right - width, prefer])
    for (const s of this.spans) {
      candidates.add(s.x)
      candidates.add(s.x + s.w - width)
    }
    let best: { x: number; y: number } | null = null
    for (const raw of candidates) {
      const x = Math.max(left, Math.min(raw, right - width))
      const y = this.restsAt(x, width + gap)
      const better = !best
        || y < best.y - 0.5
        || (Math.abs(y - best.y) <= 0.5 && Math.abs(x - prefer) < Math.abs(best.x - prefer))
      if (better) best = { x, y }
    }
    const at = best ?? { x: left, y: this.spans[0]?.y ?? 0 }
    this.raise(at.x, w + gap, at.y + h + gap)
    return { x: Math.round(at.x), y: Math.round(at.y) }
  }

  /** Marks [x, x + w) as used up to `y`. */
  private raise(x: number, w: number, y: number): void {
    const next: Span[] = []
    for (const s of this.spans) {
      const overlaps = s.x < x + w && s.x + s.w > x
      if (!overlaps) { next.push(s); continue }
      if (s.x < x) next.push({ x: s.x, w: x - s.x, y: s.y })
      const tailX = Math.max(s.x, x + w)
      if (s.x + s.w > tailX) next.push({ x: tailX, w: s.x + s.w - tailX, y: s.y })
    }
    next.push({ x, w, y })
    next.sort((a, b) => a.x - b.x)
    // Runs at the same height are one run.
    const merged: Span[] = []
    for (const s of next) {
      const last = merged[merged.length - 1]
      if (last && Math.abs(last.y - s.y) < 0.5 && Math.abs(last.x + last.w - s.x) < 0.5) last.w += s.w
      else merged.push({ ...s })
    }
    this.spans = merged
  }

  /** How far down anything has reached. */
  bottom(top: number): number {
    return this.spans.reduce((low, s) => Math.max(low, s.y), top)
  }
}

export const OUTER_ROOM = 560

/**
 * Where everything with no hand placement goes. Returns one point per thing,
 * by id. Pure: the board passes in the widths and heights it has measured.
 */
export function arrange(input: ArrangeInput): Map<string, { x: number; y: number }> {
  const { things, columns, top, gap, minX, outerRoom = OUTER_ROOM } = input
  const out = new Map<string, { x: number; y: number }>()
  if (things.length === 0) return out

  const byId = new Map(columns.map((c) => [c.id, c]))
  const order = [...columns].sort((a, b) => a.x - b.x)

  /**
   * The run of board each piece's things may use: out to halfway across the
   * space between it and its neighbour, and well past the ends for the two on
   * the outside. Wider than the card on purpose — a band the exact width of
   * the card can only ever hold one column of things, which is what made the
   * old arrangement look ruled rather than arranged.
   */
  const bands = new Map<string, { left: number; right: number }>()
  order.forEach((c, i) => {
    // A card's own width plus the space either side of it. Bands do overlap
    // their neighbours' a little, which is the point: one packing covers the
    // whole board, so a thing may use the room beside the next card when it
    // is free, and still cannot land on anything.
    const left = i === 0 ? Math.max(minX, c.x - outerRoom) : c.x - gap
    const right = i === order.length - 1 ? c.x + c.w + outerRoom : c.x + c.w + gap
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

  // One packing for the whole board, not one per piece. Bands say where a
  // piece's things may reach; the packing is shared, so a thing can sit in the
  // space beside a neighbouring card when there is room there and nothing
  // ever lands on anything else.
  const far = order.length ? bands.get(order[order.length - 1].id)!.right : minX + 1200
  const near = order.length ? bands.get(order[0].id)!.left : minX
  const sky = new Skyline(near, Math.max(320, far - near), top)

  /**
   * Threads first, so they take the top line nearest their card. After that
   * the tall ones, which leaves the short ones to fill the gaps beside them
   * rather than starting a row of their own.
   */
  const queue: Array<{ thing: ArrangeThing; column: ArrangeColumn }> = []
  for (const column of order) {
    for (const thing of grouped.get(column.id) ?? []) queue.push({ thing, column })
  }
  queue.sort((a, b) =>
    (a.thing.priority ?? 1) - (b.thing.priority ?? 1)
    || a.column.x - b.column.x
    || b.thing.h - a.thing.h
    || b.thing.w - a.thing.w)

  for (const { thing, column } of queue) {
    const band = bands.get(column.id)!
    // Just inside the band's left, not the card's own edge: starting at the
    // card wastes the room to its left, and then two things that would have
    // sat side by side end up one under the other.
    const prefer = Math.max(band.left, column.x - gap)
    out.set(thing.id, sky.place(thing.w, thing.h, gap, band, prefer))
  }

  // What belongs to no piece sits below the lot, across the whole width.
  if (loose.length > 0) {
    const under = sky.bottom(top)
    const below = new Skyline(near, Math.max(320, far - near), under === top ? top : under + gap)
    for (const thing of [...loose].sort((a, b) => b.h - a.h || b.w - a.w)) {
      out.set(thing.id, below.place(thing.w, thing.h, gap, { left: near, right: far }, near))
    }
  }

  return out
}
