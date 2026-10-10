import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canvasSignature, canvasText, type CanvasSource } from './vision/canvas-text'
import { cleanSources, splitSources, withSources } from './vision/types'
import { visionOf } from './vision/store'
import { buildTree } from './tree'
import type { BoardItem } from './board-items'
import type { Thread, WorkNode } from './node-types'

const NOW = '2026-10-10T10:00:00.000Z'

function node(id: string, parent: string | null, position: number, extra: Partial<WorkNode> = {}): WorkNode {
  return {
    id, user_id: 'u', project_id: 'p', parent_id: parent, position, title: id, intent: '', beat: '', stands_whole: false,
    rules: [], body: '', extent: 0, status: 'open', board_x: null, board_y: null, writing_ethos: null, emotional_journey: null,
    core_truth: null, substack_goals: null, short_form_goals: null, open_threads: [], short_form_script: null,
    is_locked: false, created_at: NOW, updated_at: NOW, ...extra,
  } as WorkNode
}

function item(id: string, kind: BoardItem['kind'], node_ids: string[], content: BoardItem['content']): BoardItem {
  return { id, user_id: 'u', project_id: 'p', kind, asset_id: null, node_ids, board_x: null, board_y: null, w: null, content, created_at: NOW, updated_at: NOW }
}

const thread: Thread = { id: 'th', user_id: 'u', project_id: 'p', position: 0, name: 'Waiting', intent: 'Things kept for later', rules: [], hue: 'tide', board_x: null, board_y: null, created_at: NOW, updated_at: NOW }

function source(): CanvasSource {
  const nodes = [
    node('Morning', null, 0, { intent: 'Rest is not the absence of worth', core_truth: 'Being needed is not being alive', emotional_journey: 'Arrival\nThe pull', body: '<p>THE SECRET PROSE of the first piece.</p>', extent: 7, rules: [{ id: 'r2', text: 'First person only', created_at: NOW }] }),
    node('Arrival', 'Morning', 0, { beat: 'calm', body: '<p>MORE SECRET PROSE in a part.</p>', extent: 6 }),
    node('Room', null, 1, { intent: 'A song about rooms kept for later' }),
  ]
  const tags = [{ node_id: 'Morning', thread_id: 'th', note: 'the kettle' }]
  return {
    project: { title: 'Three rooms', intent: 'To stay with waiting', rules: [{ id: 'r1', text: 'No nostalgia', created_at: NOW }, { id: 'r0', text: 'Retired rule', created_at: NOW, retired_at: NOW }], arc: 'Beginning', thematic_territory: 'rest' },
    roots: buildTree(nodes, tags, ['th']),
    threads: [thread],
    tags,
    items: [
      item('i1', 'image', ['Morning'], { caption: 'The window at seven' }),
      item('i2', 'image', [], {}),
      item('i3', 'recording', [], { title: 'Hummed melody' }),
      item('i4', 'tasks', ['Room'], { tasks: [{ id: 't', title: 'Call the venue', done: false }] }),
      item('i5', 'palette', [], { swatches: [{ id: 's', hex: '#C86A3A', name: 'kettle copper' }] }),
    ],
    tasks: [{ id: 'k1', node_id: 'Arrival', title: 'Find the first line', type: 'creation', status: 'pending', is_writing_related: true, category: 'Writing' }],
    fragments: [{ node_id: 'Arrival', text: 'Usefulness only looks like being alive' }, { node_id: null, text: 'A line for the whole project' }],
  }
}

test('every word written on the canvas reaches the companion', () => {
  const { text } = canvasText(source())
  for (const said of [
    'Three rooms', 'To stay with waiting', 'No nostalgia', 'theme: rest', 'movement: Beginning',
    'Rest is not the absence of worth', 'Being needed is not being alive', 'The pull', 'First person only',
    'A song about rooms kept for later', 'Waiting: Things kept for later', 'the kettle', 'absent from: Room',
    'The window at seven', 'Hummed melody', 'Call the venue', 'kettle copper',
    'Find the first line', 'Usefulness only looks like being alive', 'A line for the whole project',
  ]) assert.ok(text.includes(said), `missing: ${said}`)
})

test('the writing inside a piece, retired rules and a hex code never do', () => {
  const { text } = canvasText(source())
  assert.ok(!text.includes('SECRET PROSE'))
  assert.ok(!text.includes('Retired rule'))
  assert.ok(!text.includes('#C86A3A'))
})

test('a fragment or task on a part is told under the piece that part sits in', () => {
  const { text } = canvasText(source())
  const morning = text.indexOf('1. Morning')
  const room = text.indexOf('2. Room')
  const fragment = text.indexOf('Usefulness only looks like being alive')
  const task = text.indexOf('Find the first line')
  assert.ok(morning < fragment && fragment < room)
  assert.ok(morning < task && task < room)
})

test('images and recordings are counted and named as unseen, with or without words on them', () => {
  const read = canvasText(source())
  assert.deepEqual(read.unread, { images: 2, recordings: 1 })
  assert.ok(read.text.includes('NOT SHOWN TO YOU: 2 images and 1 recording'))
  const bare = canvasText({ ...source(), items: [] })
  assert.ok(!bare.text.includes('NOT SHOWN TO YOU'))
})

test('the signature moves when a word on the canvas does, and only then', () => {
  const a = canvasSignature(canvasText(source()).text)
  assert.equal(a, canvasSignature(canvasText(source()).text))
  const changed = source()
  changed.project.intent = 'To stay with the waiting'
  assert.notEqual(a, canvasSignature(canvasText(changed).text))
})

test('sources ride with a stored reply and come back out of it', () => {
  const sources = [{ url: 'https://example.com/a', title: 'A\ttitle' }, { url: 'https://example.org/b', title: 'B' }]
  const stored = withSources('What I found.', sources)
  assert.deepEqual(splitSources(stored), { text: 'What I found.', sources: [{ url: 'https://example.com/a', title: 'A title' }, { url: 'https://example.org/b', title: 'B' }] })
  assert.deepEqual(splitSources('No sources here.'), { text: 'No sources here.', sources: [] })
  assert.equal(withSources('Plain.', []), 'Plain.')
})

test('only web addresses are shown as sources, each once', () => {
  assert.deepEqual(
    cleanSources([{ url: 'https://example.com/a', title: null }, { url: 'https://example.com/a', title: 'again' }, { url: 'javascript:alert(1)', title: 'no' }, { url: 'https://www.example.org/b', title: ' B ' }]),
    [{ url: 'https://example.com/a', title: 'example.com' }, { url: 'https://www.example.org/b', title: 'B' }],
  )
})

test('a project with nothing kept about its vision reads as empty, whatever is in its settings', () => {
  for (const settings of [null, {}, { vision: 'x' }, { vision: { kept: 'x', reading: 3 } }]) {
    assert.deepEqual(visionOf(settings), { kept: [], declined: [], reading: null, gaps_dismissed: [] })
  }
  const v = visionOf({ vision: { kept: [{ id: 'a', kind: 'open', text: 'Who tells it', state: 'kept' }, { id: '', text: 'dropped' }], reading: { at: NOW, statement: 'S', gaps: [{ id: 'g', text: 'G', where: ['Room', 3] }], signature: 'x' } } })
  assert.equal(v.kept.length, 1)
  assert.equal(v.kept[0].kind, 'open')
  assert.deepEqual(v.reading?.gaps, [{ id: 'g', text: 'G', where: ['Room'] }])
})
