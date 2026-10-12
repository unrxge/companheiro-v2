import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COLUMNS, projectStories, summarise, writingByDay, planLabel } from './people'
import { analyticsChoiceOf, sharesAnalytics, ANALYTICS_POLICY_VERSION } from '../usage-analytics'

const NOW = Date.parse('2026-10-12T12:00:00Z')

test('nothing a person wrote is ever read', () => {
  const words = /\b(title|intent|body|text|note|name|beat|statement|sentence|content|transcript|rules|category|thread|what_it_opened|unresolved|parts|email)\b/
  for (const [table, columns] of Object.entries(COLUMNS)) {
    for (const column of columns.split(',').map((c) => c.trim())) {
      assert.ok(!words.test(column), `${table}.${column} holds what someone wrote`)
    }
  }
})

test('only the project side of the app is read', () => {
  for (const table of Object.keys(COLUMNS)) {
    assert.ok(table.startsWith('studio_') || table === 'writing_activity', `${table} is outside it`)
  }
})

test('who is shown: on unless switched off, and only once told', () => {
  // An older account that has heard nothing yet.
  assert.equal(sharesAnalytics({ consent: { privacy: '2026-10-02' } }), false)
  assert.deepEqual(analyticsChoiceOf({}), { on: true, told: false })
  // Signed up under a policy that describes it: told by that, on by default.
  assert.equal(sharesAnalytics({ consent: { privacy: ANALYTICS_POLICY_VERSION } }), true)
  // Shown the notice and left it on.
  assert.equal(sharesAnalytics({ usage_analytics: { on: true, told_at: '2026-10-12T10:00:00Z' } }), true)
  // Switched off, however they came to know.
  assert.equal(sharesAnalytics({ consent: { privacy: ANALYTICS_POLICY_VERSION }, usage_analytics: { on: false, told_at: '2026-10-12T10:00:00Z' } }), false)
  assert.equal(sharesAnalytics(null), false)
})

const rows = {
  studio_projects: [
    { id: 'p2', user_id: 'u', shelf_stage: 'active', status: 'active', resting_until: null, completed_at: null, last_opened_at: '2026-10-11T09:00:00Z', created_at: '2026-10-05T10:00:00Z', updated_at: '2026-10-10T10:00:00Z' },
    { id: 'p1', user_id: 'u', shelf_stage: 'completed', status: 'finished', resting_until: null, completed_at: '2026-09-20T10:00:00Z', last_opened_at: '2026-09-21T10:00:00Z', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-20T10:00:00Z' },
    { id: 'p3', user_id: 'u', shelf_stage: 'queued', status: 'resting', resting_until: '2026-10-20T00:00:00Z', completed_at: null, last_opened_at: '2026-10-06T10:00:00Z', created_at: '2026-10-06T10:00:00Z', updated_at: '2026-10-06T10:00:00Z' },
  ],
  studio_nodes: [
    { id: 'n1', project_id: 'p1', parent_id: null, status: 'done', extent: 0, created_at: '2026-09-03T10:00:00Z' },
    { id: 'n1a', project_id: 'p1', parent_id: 'n1', status: 'done', extent: 400, created_at: '2026-09-04T10:00:00Z' },
    { id: 'n1b', project_id: 'p1', parent_id: 'n1', status: 'done', extent: 350, created_at: '2026-09-04T11:00:00Z' },
    { id: 'n2', project_id: 'p2', parent_id: null, status: 'drafted', extent: 120, created_at: '2026-10-06T10:00:00Z' },
  ],
  studio_concept_revisions: [
    { project_id: 'p1', origin: 'creation', created_at: '2026-09-02T10:00:00Z' },
    { project_id: 'p1', origin: 'edit', created_at: '2026-09-05T10:00:00Z' },
  ],
  studio_piece_revisions: [
    { piece_id: 'n1', word_count: 300, created_at: '2026-09-06T10:00:00Z' },
    { piece_id: 'n1', word_count: 750, created_at: '2026-09-15T10:00:00Z' },
    { piece_id: 'n2', word_count: 0, created_at: '2026-10-06T12:00:00Z' },
    { piece_id: 'n2', word_count: 120, created_at: '2026-10-08T12:00:00Z' },
  ],
  studio_threads: [{ project_id: 'p1', created_at: '2026-09-07T10:00:00Z' }],
  studio_tasks: [
    { project_id: 'p1', status: 'complete', created_at: '2026-09-08T10:00:00Z' },
    { project_id: 'p1', status: 'pending', created_at: '2026-09-08T10:00:00Z' },
  ],
  studio_board_items: [
    { project_id: 'p1', kind: 'image', created_at: '2026-09-09T10:00:00Z' },
    { project_id: 'p1', kind: 'tasks', created_at: '2026-09-09T11:00:00Z' },
  ],
  studio_vision_messages: [
    { project_id: 'p1', node_id: null, role: 'person', created_at: '2026-09-10T10:00:00Z' },
    { project_id: 'p1', node_id: null, role: 'companion', created_at: '2026-09-10T10:00:05Z' },
    { project_id: 'p1', node_id: 'n1a', role: 'person', created_at: '2026-09-11T10:00:00Z' },
  ],
  studio_rule_checks: [{ project_id: 'p1', created_at: '2026-09-12T10:00:00Z' }],
  studio_anchor_lines: [{ project_id: 'p1', created_at: '2026-09-12T10:00:00Z' }],
  studio_post_publication_logs: [{ node_id: 'n1', created_at: '2026-09-22T10:00:00Z' }],
  writing_activity: [
    { user_id: 'u', date: '2026-10-10', seconds: 1800 },
    { user_id: 'u', date: '2026-10-08', seconds: 600 },
    { user_id: 'u', date: '2026-08-01', seconds: 9000 },
  ],
}

test('projects are numbered in the order they were started, never named', () => {
  const stories = projectStories(rows, NOW)
  assert.deepEqual(stories.map((s) => [s.n, s.id]), [[1, 'p1'], [2, 'p2'], [3, 'p3']])
  assert.ok(!JSON.stringify(stories).includes('title'))
})

test('a finished project tells how it came to be, in order, with the days between', () => {
  const [first] = projectStories(rows, NOW)
  assert.equal(first.stage, 'Finished')
  assert.deepEqual(first.steps.map((s) => s.key), ['started', 'concept', 'piece', 'parts', 'writing', 'thread', 'tasks', 'image', 'vision', 'companion', 'finished', 'reflected'])
  assert.equal(first.steps[0].daysAfter, 0)
  assert.equal(first.steps[1].daysAfter, 1) // concept the day after starting
  assert.equal(first.steps.find((s) => s.key === 'writing')!.at, '2026-09-06T10:00:00Z')
  assert.deepEqual(first.untouched, ['recordings'])
  assert.deepEqual(
    { ...first.counts },
    { pieces: 1, parts: 2, words: 750, threads: 1, tasks: 2, tasksDone: 1, images: 1, recordings: 0, taskLists: 1, anchorLines: 1, conceptEdits: 1, visionTurns: 1, partTurns: 1, ruleChecks: 1, reflections: 1 },
  )
  assert.deepEqual(first.words.map((w) => w.words), [300, 750])
})

test('stages in between, and a project that is resting', () => {
  const [, second, third] = projectStories(rows, NOW)
  assert.equal(second.stage, 'Writing')
  assert.equal(second.steps.find((s) => s.key === 'writing')!.at, '2026-10-08T12:00:00Z') // the first save with words in it
  assert.equal(third.stage, 'Shaping the concept')
  assert.equal(third.resting, true)
  assert.deepEqual(third.steps.map((s) => s.key), ['started'])
})

test('the list line: where projects sit, last at work, writing this month', () => {
  const s = summarise({ id: 'u', email: 'a@b.c', joined: '2026-09-01T00:00:00Z', name: ' Ana ', practices: ['writer'], status: 'active', tier: 'direction' }, rows, NOW)
  assert.deepEqual(s.projects, { total: 3, queued: 1, active: 1, completed: 1 })
  assert.equal(s.lastActive, '2026-10-11T09:00:00Z')
  assert.equal(s.writingDays, 2)
  assert.equal(s.writingMinutes, 40)
  assert.equal(s.name, 'Ana')
  assert.equal(s.plan, 'Direction')
  assert.equal(planLabel('trialing', null), 'Free month')
})

test('minutes written, a day at a time', () => {
  const days = writingByDay(rows, 5, NOW)
  assert.deepEqual(days.map((d) => [d.date, d.minutes]), [['2026-10-08', 10], ['2026-10-09', 0], ['2026-10-10', 30], ['2026-10-11', 0], ['2026-10-12', 0]])
})
