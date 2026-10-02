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
