// studio/src/lib/studio/layout/tidy.ts — tidy (7.3, D-034, D-035). Pure and
// isomorphic. The caller (B's TidyCommand) applies `moves` and the `stacked_in`
// changes in `stack` as one undoable command. Tidy never moves a person-placed
// block (unless `everything`), never enters a frame, never changes z, never
// touches struck state, never moves an unplaced arrival, never moves concept or since.

import type { AnyBlock, Block, Rect } from '@/lib/studio/types'
import { compose, regionOf, widthFor } from '@/lib/studio/layout/compose'
import { estimateH } from '@/lib/studio/layout/estimate'

export interface TidyResult {
  moves: Map<string, { from: Rect; to: Rect }>
  stack: { timeline: AnyBlock | null; newTimeline: AnyBlock | null; ids: string[] }
}

/** Singles beyond this count are stacked into a timeline (D-035). */
export const STACK_THRESHOLD = 8
/** The newest singles left on the canvas when stacking. */
export const STACK_KEEP = 3

const rectOf = (b: AnyBlock): Rect => ({ x: b.x, y: b.y, w: b.w, h: b.h })
const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

function newId(): string {
  return crypto.randomUUID()
}

function makeTimeline(
  at: Rect,
  z: number,
  projectId: string,
  userId: string,
  now: string,
  id: string
): Block<'timeline'> {
  return {
    id,
    user_id: userId,
    project_id: projectId,
    type: 'timeline',
    x: at.x, y: at.y, w: at.w, h: at.h, z,
    parent_id: null,
    stacked_in: null,
    name: null,
    locked: false,
    hidden: false,
    collapsed: false,
    placed_by: 'auto',
    arrival_state: 'placed',
    arrived_from: null,
    struck_at: null,
    struck_by: null,
    content: { title: null },
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
}

export function tidy(
  state: {
    blocks: AnyBlock[]
    heights: Map<string, number>
    projectId: string
    userId: string
    /** Optional: ids of commitment blocks whose entry is resolved (flow after open ones). */
    done?: Set<string>
  },
  opts: {
    everything: boolean
    /** ISO timestamp for a timeline tidy may create; defaults to the wall clock at the call boundary. */
    now?: string
    /** Id for that timeline; defaults to crypto.randomUUID(). */
    newTimelineId?: string
  }
): TidyResult {
  const { everything } = opts
  const live = state.blocks.filter((b) => !b.deleted_at && !b.hidden && !b.stacked_in)
  const frames = new Set(live.filter((b) => b.type === 'frame').map((b) => b.id))
  const inFrame = new Set(live.filter((b) => !!b.parent_id).map((b) => b.id))

  const isFixed = (b: AnyBlock): boolean =>
    b.type === 'concept' || b.type === 'since' || b.locked || b.arrival_state === 'unplaced' ||
    (!everything && b.placed_by === 'person') || frames.has(b.id) || inFrame.has(b.id)

  const fixed = live.filter(isFixed)
  const fixedIds = new Set(fixed.map((b) => b.id))
  let movable = live.filter((b) => !fixedIds.has(b.id) && regionOf(b.type) !== 'none')

  // ── update stacking (D-035) ──
  const singles = live
    .filter((b) => b.type === 'update' && !b.stacked_in && b.arrival_state === 'placed' && !b.parent_id && !b.locked)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
  const stack: TidyResult['stack'] = {
    timeline: live.find((b) => b.type === 'timeline') ?? null,
    newTimeline: null,
    ids: [],
  }
  const extraMovable: AnyBlock[] = []
  if (singles.length >= STACK_THRESHOLD) {
    stack.ids = singles.slice(STACK_KEEP).map((b) => b.id)
    const stackedIds = new Set(stack.ids)
    if (!stack.timeline) {
      const oldest = singles[singles.length - 1]
      const maxZ = live.reduce((m, b) => Math.max(m, b.z), 0)
      const w = widthFor('column', 'timeline')
      const seed: Rect = {
        x: oldest.x,
        y: oldest.y,
        w: oldest.w,
        h: estimateH('timeline', { title: null }, w, { rows: stack.ids.length }),
      }
      stack.newTimeline = makeTimeline(
        seed, maxZ + 1, state.projectId, state.userId,
        opts.now ?? new Date().toISOString(), opts.newTimelineId ?? newId()
      )
      extraMovable.push(stack.newTimeline)
    } else if (!fixedIds.has(stack.timeline.id) && !movable.some((b) => b.id === stack.timeline!.id)) {
      extraMovable.push(stack.timeline)
    }
    movable = movable.filter((b) => !stackedIds.has(b.id))
  }
  movable = [...movable, ...extraMovable]
  const movableIds = new Set(movable.map((b) => b.id))

  // ── compose the movable set around everything fixed; concept + since ride along as reference rects ──
  const obstacles = fixed.map(rectOf)
  const reference = live.filter((b) => (b.type === 'concept' || b.type === 'since') && !movableIds.has(b.id))
  const placements = compose({
    blocks: [...movable, ...reference],
    obstacles,
    heights: state.heights,
    done: state.done,
  })

  const byId = new Map(movable.map((b) => [b.id, b]))
  const moves: TidyResult['moves'] = new Map()
  for (const p of placements) {
    const b = byId.get(p.id)
    if (!b) continue
    const from = rectOf(b)
    const to: Rect = { x: p.x, y: p.y, w: p.w, h: p.h }
    if (!sameRect(from, to)) moves.set(p.id, { from, to })
  }
  return { moves, stack }
}
