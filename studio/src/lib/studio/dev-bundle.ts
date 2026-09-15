// studio/src/lib/studio/dev-bundle.ts — a synthetic project for the dev harness
// at /dev/canvas. Development only: it lets the canvas engine be driven without
// a session or a database, so drag, snap, zoom, undo and autosave can be
// exercised in a browser. Nothing imports this from the real app.

import { registry } from '@/lib/studio/registry'
import type { AnyBlock, Block, BlockContentMap, BlockType, ProjectBundle } from '@/lib/studio/types'

const USER = '00000000-0000-4000-8000-000000000001'
const PROJECT = '00000000-0000-4000-8000-000000000002'
const T0 = '2026-09-01T09:00:00.000Z'

const content: { [K in BlockType]: BlockContentMap[K] } = {
  concept: {},
  since: {},
  update: { text: 'the second section is lying, it is too neat', said_at: T0, entry_id: null, origin: 'talk' },
  timeline: { title: null },
  draft: { draft_id: 'draft-1' },
  anchor: { text: 'the room is the argument', source_block_id: null },
  note: { text: 'his hands never still, even at the table' },
  reference: { url: 'https://example.org/kitchens', title: 'a piece about kitchens', note: 'the way it refuses to be warm' },
  commitment: { entry_id: 'entry-1' },
  compass: {},
  frame: { expanded_h: 384, tint: 'none' },
  heading: { text: 'part one', size: 'lg' },
  divider: {},
  image: { asset_id: 'asset-1', caption: '', fit: 'cover', aspect: 4 / 3 },
  gallery: { items: [], columns: 3 },
  recording: { asset_id: 'asset-2', title: 'take one', note: '' },
  palette: { swatches: [{ hex: '#c86a3a', name: 'ember' }] },
}

let n = 0
function block<T extends BlockType>(type: T, o: Partial<Block<T>> = {}): Block<T> {
  n += 1
  const spec = registry[type]
  return {
    id: `${type}-${n}`,
    user_id: USER,
    project_id: PROJECT,
    type,
    x: 0, y: 0, w: spec.defaultW, h: spec.defaultH, z: n,
    parent_id: null, stacked_in: null, name: null,
    locked: false, hidden: false, collapsed: false,
    placed_by: 'auto', arrival_state: 'placed', arrived_from: null,
    struck_at: null, struck_by: null,
    content: content[type],
    created_at: T0, updated_at: T0, deleted_at: null,
    ...o,
  } as Block<T>
}

export function devBundle(): ProjectBundle {
  n = 0
  const concept = block('concept', { x: 80, y: 80, w: 1008, h: 160 })
  const since = block('since', { x: 80, y: 248, w: 1008, h: 40 })
  const compass = block('compass', { x: 80, y: 320, w: 320, h: 200 })
  const anchor = block('anchor', { x: 440, y: 320, w: 664, h: 88 })
  const note = block('note', { x: 440, y: 440, w: 320, h: 96 })
  const note2 = block('note', { x: 784, y: 440, w: 320, h: 96, content: { text: 'the ending is fake' } })
  const reference = block('reference', { x: 440, y: 568, w: 320, h: 112 })
  const heading = block('heading', { x: 80, y: 568, w: 384, h: 48 })
  const arrival = block('update', {
    x: 1200, y: 320, w: 320, h: 96,
    placed_by: 'auto', arrival_state: 'unplaced', arrived_from: 'entry-9',
  })

  const blocks: AnyBlock[] = [concept, since, compass, anchor, note, note2, reference, heading, arrival]

  return {
    project: {
      id: PROJECT, user_id: USER, title: "my father's kitchen", status: 'active',
      intent: '', rules: [],
      resting_until: null, completed_at: null, completion_note: null,
      viewport: { tx: 80, ty: 80, k: 1 },
      settings: { snap: true, grid: true, sizes: false },
      auto_layout: false, composed_at: T0, canvas_version: 1,
      last_opened_at: new Date().toISOString(), opened_before_at: T0,
      created_at: T0, updated_at: T0,
    },
    concept: {
      id: 'rev-1', project_id: PROJECT,
      body: 'an essay about my father’s kitchen. it is allowed to stay unresolved.',
      constraints: ['no nostalgia', 'the ending does not resolve'],
      origin: 'creation', created_at: T0,
    },
    blocks,
    links: [],
    compass: [],
    catches: [],
    drafts: [{
      id: 'draft-1', title: 'the kitchen', kind: 'essay', posture: 'ask',
      sections: [
        { id: 's-1', label: 'the table', is_locked: true, has_text: true },
        { id: 's-2', label: 'the eulogy', is_locked: false, has_text: true },
        { id: 's-3', label: null, is_locked: false, has_text: false },
      ],
      updated_at: T0,
    }],
    assets: [],
    since: {
      cutoff: T0, last_opened_at: T0, canvas_version: 1,
      last_said: { text: 'the second section is lying', at: T0, kind: 'talk' },
      arrived_since: 1, waiting: 1, compass_pending: 0, catches_unmarked: 0, commitments_open: 0,
    },
  }
}
