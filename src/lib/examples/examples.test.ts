import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EXAMPLES, exampleCard, exampleOfId, examplesFor, examplesShown, EXAMPLES_FROM } from './index'
import { buildExample, isExampleId, toHtml } from './build'
import { ARRANGED } from './arrangement'
import { answerExample, EXAMPLE_REFUSAL } from './serve'
import { buildTree, appearancesOf } from '../studio/tree'
import { PRACTICE_KEYS } from '../tour'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const NOW = Date.parse('2026-10-17T15:00:00.000Z')
const q = (s = '') => new URLSearchParams(s)

test('every example builds, and every id it hands out says it is an example', () => {
  for (const src of EXAMPLES) {
    const b = buildExample(src, NOW)
    const ids = [
      b.project.id, ...b.tree.nodes.map((n) => n.id), ...b.tree.threads.map((t) => t.id), ...b.items.map((i) => i.id),
      ...b.tasks.map((t) => t.id), ...b.lines.map((l) => l.id), b.conversation.id,
    ]
    for (const id of ids) {
      assert.ok(isExampleId(id), `${id} should start with example-`)
      assert.ok(id.startsWith(`example-${src.key}`), `${id} belongs to ${src.key}`)
      assert.match(id, /^example-[a-z0-9-]+$/, `${id} must match the rewrite in next.config.ts`)
      assert.equal(exampleOfId(id)?.key, src.key)
    }
    assert.equal(new Set(ids).size, ids.length, `${src.key}: ids are unique`)
  }
})

test('every practice from sign-up has an example, and each example is for at least one', () => {
  for (const p of PRACTICE_KEYS) assert.ok(EXAMPLES.some((e) => e.practices.includes(p)), `nothing for ${p}`)
  for (const e of EXAMPLES) assert.ok(e.practices.length > 0)
})

test('a thread runs through some pieces, never all of them (that would be a rule)', () => {
  for (const src of EXAMPLES) {
    const b = buildExample(src, NOW)
    const roots = buildTree(b.tree.nodes, b.tree.tags, b.tree.threads.map((t) => t.id))
    for (const th of b.tree.threads) {
      const pieces = new Set(appearancesOf(roots, th.id).map((a) => a.rootId))
      assert.ok(pieces.size >= 2, `${src.key}: "${th.name}" should touch at least two pieces`)
      assert.ok(pieces.size < roots.length, `${src.key}: "${th.name}" touches every piece`)
    }
  }
})

test('each concept is whole: a journey of short labelled beats wherever there is a core truth', () => {
  for (const src of EXAMPLES) {
    assert.ok(src.intent.length > 120, `${src.key}: the purpose says enough`)
    assert.ok(src.rules.length >= 3)
    assert.ok(src.log.length >= 8, `${src.key}: the Idea Lab conversation is kept`)
    assert.ok(src.pieces.length >= 3, `${src.key}: enough pieces to show a board`)
    for (const piece of src.pieces) {
      assert.ok(piece.conviction.trim(), `${piece.key}: conviction`)
      if (!piece.truth) continue
      assert.ok((piece.journey ?? []).length >= 3, `${piece.key}: journey`)
      for (const line of piece.journey ?? []) {
        const m = /^(.{1,80}?)\s+—\s+(.+)$/.exec(line)
        assert.ok(m, `${piece.key}: "${line}" is "Label — what it holds"`)
        assert.ok(m![1].split(/\s+/).length <= 6, `${piece.key}: "${m![1]}" is a short label`)
      }
    }
    const text = JSON.stringify(src)
    assert.doesNotMatch(text, /TODO|lorem|\{\{/i)
  }
})

test('the reading only points at things that are on the canvas', () => {
  for (const src of EXAMPLES) {
    const names = new Set([
      ...src.pieces.map((p) => p.title), ...src.threads.map((t) => t.name), ...src.rules,
    ])
    for (const gap of src.reading.gaps) for (const where of gap.where) assert.ok(names.has(where), `${src.key}: "${where}" is not on the canvas`)
    assert.ok(src.reading.statement.length > 80)
  }
})

test('the vision room keeps decisions and open questions, and the conversation alternates', () => {
  for (const src of EXAMPLES) {
    assert.ok(src.kept.some((k) => k.kind === 'decision'))
    assert.ok(src.kept.some((k) => k.kind === 'open'))
    const roles = src.conversation.messages.map((m) => m.role)
    assert.equal(roles[0], 'person')
    roles.forEach((r, i) => { if (i) assert.notEqual(r, roles[i - 1], `${src.key}: message ${i + 1} repeats a speaker`) })
  }
})

test('which examples a person sees follows what they said at sign-up', () => {
  const keys = (p: string[]) => examplesFor(p).filter((x) => x.matched).map((x) => x.example.key)
  assert.deepEqual(keys(['writer']), ['writer'])
  assert.deepEqual(keys(['songwriter', 'client']), ['songwriter', 'studio'])
  assert.deepEqual(keys(['director', 'client']), ['director', 'studio'])
  assert.deepEqual(keys(['creator', 'cinematographer']), ['series'], 'one card for two practices it covers')
  assert.deepEqual(keys(['cinematographer', 'creator']), ['series'])
  assert.deepEqual(keys([]), ['writer', 'songwriter', 'series', 'studio', 'director'], 'nothing chosen: all of them')
  assert.deepEqual(keys(['something-else']), ['writer', 'songwriter', 'series', 'studio', 'director'])
  // The rest are still there, unmatched, for "Show the others".
  assert.equal(examplesFor(['writer']).length, EXAMPLES.length)
})

test('shown to new accounts until put away; never to accounts from before, unless asked for', () => {
  assert.equal(examplesShown({}, `${EXAMPLES_FROM}T09:00:00Z`), true)
  assert.equal(examplesShown({}, '2026-09-01T09:00:00Z'), false)
  assert.equal(examplesShown({ examples: { on: false } }, `${EXAMPLES_FROM}T09:00:00Z`), false)
  assert.equal(examplesShown({ examples: { on: true } }, '2026-09-01T09:00:00Z'), true)
  assert.equal(examplesShown(null, null), false)
})

test('the card is the shape the board draws, marked as an example', () => {
  const card = exampleCard(EXAMPLES[1], true, NOW)
  assert.equal(card.id, 'example-songwriter')
  assert.equal(card.shelf_stage, 'active')
  assert.equal(card.root_ids.length, EXAMPLES[1].pieces.length)
  assert.equal(card.example.matched, true)
  assert.ok(card.example.teaser)
})

test('the example route reads like the real routes and refuses every change', () => {
  const tree = answerExample('GET', ['projects', 'example-writer', 'tree'], q(), NOW)
  assert.equal(tree.status, 200)
  const body = tree.body as { project: { id: string; settings: { example: { key: string } } }; access: { workable: boolean; reason: string } }
  assert.equal(body.project.id, 'example-writer')
  assert.equal(body.project.settings.example.key, 'writer')
  assert.equal(body.access.workable, false)
  assert.equal(body.access.reason, 'example')

  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    const res = answerExample(method, ['projects', 'example-writer', 'vision'], q(), NOW)
    assert.equal(res.status, 403)
    assert.deepEqual(res.body, { error: EXAMPLE_REFUSAL, code: 'example' })
  }
  assert.equal(answerExample('PATCH', ['nodes', 'example-writer--the-drawer'], q(), NOW).status, 403)
  assert.equal(answerExample('POST', ['projects', 'example-writer', 'open'], q(), NOW).status, 200, 'opening is not a change')

  assert.equal(answerExample('GET', ['projects', 'example-nobody', 'tree'], q(), NOW).status, 404)
  assert.equal(answerExample('GET', ['projects', 'example-writer', 'compass'], q(), NOW).status, 404)
})

test('a piece’s tools see only that piece', () => {
  const piece = 'example-writer--the-drawer'
  const tasks = answerExample('GET', ['nodes', piece, 'tasks'], q(), NOW).body as { tasks: Array<{ node_id: string }> }
  assert.ok(tasks.tasks.length > 0)
  assert.ok(tasks.tasks.every((t) => t.node_id === piece))

  const inside = new Set(buildExample(EXAMPLES[0], NOW).tree.nodes.filter((n) => n.id === piece || n.parent_id === piece).map((n) => n.id))
  const lines = answerExample('GET', ['write', 'anchor-lines'], q(`node_id=${piece}`), NOW).body as { anchorLines: Array<{ section_id: string }> }
  assert.ok(lines.anchorLines.length > 0)
  assert.ok(lines.anchorLines.every((l) => inside.has(l.section_id)), 'only the drawer and its parts')
})

test('the vision room opens on the kept conversation, with its page', () => {
  const res = answerExample('GET', ['projects', 'example-series', 'vision'], q('conversation=new'), NOW)
  const v = res.body as { messages: unknown[]; conversation_id: string; kept: unknown[]; reading: { gaps: unknown[] } }
  assert.ok(v.messages.length >= 6)
  assert.equal(v.conversation_id, 'example-series--conversation')
  assert.ok(v.kept.length > 0)
  assert.ok(v.reading.gaps.length > 0)
  const list = answerExample('GET', ['projects', 'example-series', 'vision', 'conversations'], q(), NOW).body as { conversations: Array<{ title: string; messages: number }> }
  assert.equal(list.conversations.length, 1)
  assert.ok(list.conversations[0].title)
})

test('the same day gives the same dates, so a reload never reshuffles anything', () => {
  const a = buildExample(EXAMPLES[0], NOW)
  const b = buildExample(EXAMPLES[0], NOW + 3_600_000)
  assert.equal(a.project.created_at, b.project.created_at)
  assert.ok(new Date(a.project.created_at).getTime() < NOW)
})

test('every image and recording an example shows is in public/examples', () => {
  for (const src of EXAMPLES) {
    for (const asset of buildExample(src, NOW).assets) {
      assert.ok(existsSync(join(process.cwd(), 'public', asset.url)), `${asset.url} is missing`)
      assert.ok(asset.url.startsWith('/examples/'))
    }
  }
  assert.ok(buildExample(EXAMPLES.find((e) => e.key === 'songwriter')!, NOW).assets.some((a) => a.kind === 'audio'))
  assert.ok(buildExample(EXAMPLES.find((e) => e.key === 'director')!, NOW).assets.filter((a) => a.kind === 'image').length >= 2)
})

test('words become the editor’s HTML, escaped', () => {
  assert.equal(toHtml('one\ntwo\n\nthree & <four>'), '<p>one<br>two</p><p>three &amp; &lt;four&gt;</p>')
  assert.equal(toHtml(''), '')
})

test('every example opens where its owner arranged it, and the arrangement names nothing that is gone', () => {
  for (const src of EXAMPLES) {
    const built = buildExample(src, NOW)
    const pid = `example-${src.key}`
    const own = (id: string) => id.slice(pid.length + 2)
    const things = [...built.tree.threads, ...built.items]
    const spots = ARRANGED[src.key]?.spots ?? {}
    for (const thing of things) {
      const at = spots[own(thing.id)]
      assert.ok(at, `${thing.id} has a place`)
      assert.deepEqual([thing.board_x, thing.board_y], [at[0], at[1]], `${thing.id} stands where it was left`)
    }
    const ids = new Set(things.map((t) => own(t.id)))
    for (const key of Object.keys(spots)) assert.ok(ids.has(key), `${pid}: arranged "${key}" still exists`)
    for (const key of Object.keys(ARRANGED[src.key]?.edits ?? {})) assert.ok(ids.has(key), `${pid}: edited "${key}" still exists`)
  }
  // the edits come through as well as the places
  const palette = buildExample(EXAMPLES.find((e) => e.key === 'studio')!, NOW).items.find((i) => i.id === 'example-studio--item-1')!
  assert.equal(palette.content.title, 'Brand tones')
})
