// Small block factories for the layout tests. Deterministic ids and timestamps.

import type { AnyBlock, Block, BlockContentMap, BlockType, Rect } from '@/lib/studio/types'
import { registry } from '@/lib/studio/registry'

export const PROJECT = 'p-1'
export const USER = 'u-1'

let seq = 0
export function resetSeq(): void { seq = 0 }

/** ISO timestamps that sort by sequence: later calls are later in time. */
export function at(n: number): string {
  return new Date(Date.UTC(2026, 8, 1, 0, 0, n)).toISOString()
}

const defaultContent: { [K in BlockType]: BlockContentMap[K] } = {
  concept: {},
  since: {},
  update: { text: 'wrote the first page this morning', said_at: at(0), entry_id: null, origin: 'posted' },
  timeline: { title: null },
  draft: { draft_id: 'd-1' },
  anchor: { text: 'the room is the argument', source_block_id: null },
  note: { text: 'a note' },
  reference: { url: 'https://example.org', title: 'a page', note: 'why it matters' },
  commitment: { entry_id: 'c-1' },
  compass: {},
  frame: { expanded_h: 384, tint: 'none' },
  heading: { text: 'part one', size: 'lg' },
  divider: {},
  image: { asset_id: 'a-1', caption: '', fit: 'cover', aspect: 4 / 3 },
  gallery: { items: [], columns: 3 },
  recording: { asset_id: 'a-2', title: 'take one', note: '' },
  palette: { swatches: [{ hex: '#ffffff', name: null }] },
}

export type Overrides<T extends BlockType> = Partial<Omit<Block<T>, 'type' | 'content'>> & { content?: Partial<BlockContentMap[T]> }

export function block<T extends BlockType>(type: T, o: Overrides<T> = {}): Block<T> {
  const n = ++seq
  const s = registry[type]
  const base: Block<T> = {
    id: `${type}-${n}`,
    user_id: USER,
    project_id: PROJECT,
    type,
    x: 0, y: 0, w: s.defaultW, h: s.defaultH, z: n,
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
    content: { ...defaultContent[type], ...(o.content ?? {}) } as BlockContentMap[T],
    created_at: at(n),
    updated_at: at(n),
    deleted_at: null,
  }
  const { content: _c, ...rest } = o
  return { ...base, ...rest }
}

export function rectOf(b: { x: number; y: number; w: number; h: number }): Rect {
  return { x: b.x, y: b.y, w: b.w, h: b.h }
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** Apply placements (or tidy moves) to copies of the blocks, returning the new array. */
export function applied(blocks: AnyBlock[], rects: Iterable<[string, Rect]>): AnyBlock[] {
  const m = new Map(rects)
  return blocks.map((b) => {
    const r = m.get(b.id)
    return r ? ({ ...b, ...r } as AnyBlock) : b
  })
}

/** A standard small project: concept, since, compass, two anchors, a reference, a note. */
export function project(): { blocks: AnyBlock[]; concept: Block<'concept'>; since: Block<'since'>; compass: Block<'compass'> } {
  const concept = block('concept')
  const since = block('since')
  const compass = block('compass')
  const blocks: AnyBlock[] = [
    concept, since, compass,
    block('anchor'), block('anchor', { content: { text: 'a second line' } }),
    block('reference'), block('note'),
  ]
  return { blocks, concept, since, compass }
}
