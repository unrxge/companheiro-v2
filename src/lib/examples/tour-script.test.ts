import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EXAMPLE_PRACTICES, tourLength, tourSteps, voiceFor, VOICES, ANY_VOICE } from './tour-script'
import { EXAMPLES } from './index'
import { buildExample } from './build'

const fromExample = (key: string, practices: string[], phone = false) => {
  const src = EXAMPLES.find((e) => e.key === key)!
  const b = buildExample(src)
  const roots = b.tree.nodes.filter((n) => !n.parent_id)
  // A tag can sit on a part; the board counts it for the piece the part is in.
  const rootOf = (id: string): string => {
    const n = b.tree.nodes.find((x) => x.id === id)
    return n?.parent_id ? rootOf(n.parent_id) : id
  }
  return tourSteps({
    pieces: roots.map((n) => ({ id: n.id })),
    threads: b.tree.threads.map((t) => ({ id: t.id, name: t.name, on: [...new Set(b.tree.tags.filter((g) => g.thread_id === t.id).map((g) => rootOf(g.node_id)))] })),
    items: b.items.map((i) => ({ id: i.id, kind: i.kind, on: i.node_ids })),
    practices,
    exampleFor: src.practices,
    phone,
  })
}

test('it speaks to the practice the person named, preferring one this example is for', () => {
  assert.equal(voiceFor(['songwriter'], ['director']), VOICES.songwriter)
  assert.equal(voiceFor(['writer', 'director'], ['director']), VOICES.director)
  assert.equal(voiceFor([], ['director']), ANY_VOICE)
  assert.equal(voiceFor(['not-a-practice'], ['writer']), ANY_VOICE)
})

test('a songwriter opening the campaign hears about songs and albums', () => {
  const steps = fromExample('director', ['songwriter'])
  const said = steps.flatMap((s) => [s.headline, ...s.lines]).join(' ')
  assert.match(said, /a song/)
  assert.match(said, /an album/)
  assert.doesNotMatch(said, /campaign/)
})

test('every example gets the same short walk, ending where it began', () => {
  for (const src of EXAMPLES) {
    const steps = fromExample(src.key, ['writer'])
    // "keep" only where something other than a task list hangs on the canvas
    const keeps = src.items.some((i) => i.kind !== 'tasks')
    assert.deepEqual(
      steps.map((s) => s.key),
      ['arrive', 'piece', 'thread', ...(keeps ? ['keep'] : []), 'room-door', 'room-page', 'room-talk', 'end'],
      src.key,
    )
    // reading time, before about a second of travel between steps: under 45s in all
    assert.ok(tourLength(steps) < 37_000, `${src.key} reads in under 37s (${tourLength(steps)})`)
    // short sentences
    for (const s of steps) for (const line of [s.headline, ...s.lines]) {
      assert.ok(line.split(/\s+/).length <= 12, `"${line}" is short`)
    }
  }
})

test('the thread it shows runs through some pieces and not all, and its web is lit', () => {
  for (const src of EXAMPLES) {
    const steps = fromExample(src.key, [])
    const t = steps.find((s) => s.key === 'thread')!
    const ids = 'ids' in t.show && Array.isArray(t.show.ids) ? t.show.ids : []
    const pieces = ids.length - 1
    assert.ok(pieces >= 2 && pieces < src.pieces.length, `${src.key}: ${pieces} of ${src.pieces.length}`)
    assert.equal(t.light?.kind, 'hub')
  }
})

test('a phone is told to hold, a computer to rest', () => {
  const phone = fromExample('series', [], true).find((s) => s.key === 'thread')!
  const desk = fromExample('series', [], false).find((s) => s.key === 'thread')!
  assert.equal(phone.gesture, 'hold')
  assert.match(phone.lines.join(' '), /Hold/)
  assert.equal(desk.gesture, 'rest')
  assert.match(desk.lines.join(' '), /Rest/)
})

test('the browser\'s note of what each example is for matches the examples themselves', () => {
  for (const src of EXAMPLES) assert.deepEqual([...(EXAMPLE_PRACTICES[src.key] ?? [])], [...src.practices], src.key)
  assert.equal(Object.keys(EXAMPLE_PRACTICES).length, EXAMPLES.length)
})
