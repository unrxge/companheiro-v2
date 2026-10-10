'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { WorkPage } from '@/components/studio/work/work-page'
import { ProjectBoard } from '@/components/project-board/kanban-board'
import { PageHeader, PageShell, Container, Card } from '@/components/shell/page-shell'
import { SettingsButton } from '@/components/settings/settings-sheet'
import { AccessGate } from '@/components/billing/access-gate'
import { activeLimitLine, entitlementsFor, isResting, restEndsAt } from '@/lib/billing/entitlements'

const NOW = '2026-09-25T10:00:00.000Z'
const IDEA = 'A morning where nothing was asked of me, and how strange it was to notice.'
const LONG = `${IDEA} The kettle took its time and I let it. There was a window, and in it a light I had stopped seeing years ago, the kind that arrives sideways and asks nothing back.\n\nI thought about how much of my life is arranged around being needed, and how quiet it gets when the needing stops for an hour. It was not peace, exactly. It was closer to standing in a room after everyone has left, listening to what the walls do without them.\n\nBy the time the tea was cool I had understood something small and difficult: that I had been mistaking usefulness for being alive, and that the two only look alike from the outside. Nobody had asked me for anything, and I was still here.`

interface MockNode {
  id: string; user_id: string; project_id: string; parent_id: string | null; position: number
  title: string; intent: string; beat: string; stands_whole: boolean; rules: unknown[]
  body: string; extent: number; status: string; board_x: number | null; board_y: number | null
  writing_ethos: string | null; emotional_journey: string | null; core_truth: string | null
  substack_goals: string | null; short_form_goals: string | null; open_threads: string[] | null
  short_form_script: string | null; is_locked: boolean; created_at: string; updated_at: string
}

const plain = (html: string) => html.replace(/<\/p>/g, '\n\n').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').trim()
const words = (html: string) => plain(html).split(/\s+/).filter(Boolean).length
const paragraphs = (text: string) => text.split(/\n{2,}/).map((p) => `<p>${p}</p>`).join('')

function project(intent: string, board: boolean, concept = false) {
  return {
    id: 'demo', user_id: 'u', title: 'Untitled', intent, rules: [], arc: null, thematic_territory: null,
    status: 'active', shelf_stage: 'active', resting_until: null, completed_at: null, completion_note: null,
    viewport: { x: 0, y: 0, zoom: 1 }, shelf_x: null, shelf_y: null, vision_x: null, vision_y: null,
    settings: { snap: true, grid: false, sizes: true, board }, auto_layout: true, composed_at: null,
    conceptualisation_log: concept ? [
      { role: 'assistant', content: 'What is the morning asking you to notice?' },
      { role: 'user', content: 'That nobody needed me, and I did not know what to do with my hands.' },
      { role: 'assistant', content: 'So the piece is about the gap between being useful and being here.<phase_complete/>' },
    ] : null, canvas_version: 1, last_opened_at: NOW, opened_before_at: NOW,
    created_at: NOW, updated_at: NOW,
  }
}

function node(id: string, parent: string | null, position: number, title: string, beat: string, body: string, extra: Partial<MockNode> = {}): MockNode {
  return {
    id, user_id: 'u', project_id: 'demo', parent_id: parent, position, title, intent: '', beat, stands_whole: true, rules: [],
    body, extent: words(body), status: 'open', board_x: null, board_y: null, writing_ethos: null, emotional_journey: null,
    core_truth: null, substack_goals: null, short_form_goals: null, open_threads: [], short_form_script: null, is_locked: false,
    created_at: NOW, updated_at: NOW, ...extra,
  }
}

type MockPlan = 'practice' | 'direction' | 'ended' | 'cancelled' | null
interface Opts { text: string; concept: boolean; board: boolean; sectioned: boolean; slow: boolean; pieces: boolean; carried: boolean; plan: MockPlan; over: boolean; reading: boolean }

const json = (data: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

// Installed at import so it is in place before any child effect fetches.
function installMock(o: Opts) {
  const w = window as unknown as { __workMock?: boolean }
  if (w.__workMock) return
  w.__workMock = true
  const real = window.fetch.bind(window)

  const concept: Partial<MockNode> = o.concept
    ? {
        intent: 'Rest is not the absence of worth.',
        core_truth: 'Being needed is not the same as being alive.',
        emotional_journey: 'Arrival: the kettle before the day\nThe pull toward usefulness\nWhat the quiet holds\nSettling into it',
        substack_goals: 'Keep it in the first person. Let the room be a character.',
        short_form_goals: 'Morning light, a kettle, an empty chair.',
        open_threads: ['Who is the “I” without the asking?'],
      }
    : { intent: o.text }
  const nodes: MockNode[] = [node('node-1', null, 0, 'Untitled', '', o.sectioned ? plain(LONG) : (o.text ? paragraphs(o.text) : ''), concept)]
  if (o.sectioned) {
    const [a, b, c] = LONG.split(/\n{2,}/)
    nodes.push(node('part-1', 'node-1', 0, 'Arrival', 'calm', paragraphs(a)), node('part-2', 'node-1', 1, 'The pull', 'restless', paragraphs(b)), node('part-3', 'node-1', 2, 'Settling', 'tender', paragraphs(c)))
  }
  const tasks: Array<{ id: string; node_id: string; title: string; type: string; status: string; is_writing_related: boolean | null; category?: string | null }> = [
    { id: 't1', node_id: 'node-1', title: 'Find the first line', type: 'creation', status: 'pending', is_writing_related: true },
    { id: 't2', node_id: 'node-1', title: 'Read it aloud once', type: 'creation', status: 'complete', is_writing_related: true },
    { id: 't3', node_id: 'node-1', title: 'Post on Sunday', type: 'execution', status: 'pending', is_writing_related: false },
  ]
  // The canvas's images, recordings and task lists (migration 028).
  const items: Array<Record<string, unknown> & { id: string; content: Record<string, unknown> }> = []

  // ?plan=practice|direction|ended|cancelled: the plan the mocked account is on
  // (default: an account from before billing, with everything). A limited plan
  // starts with Active full (two projects). ?over=1 leaves three in Active,
  // the state a downgrade leaves behind. ?reading=1
  // makes "demo" the project that is NOT being worked on.
  const subscription = o.plan === null
    ? { status: 'grandfathered', tier: null, trial_ends_at: null, current_period_end: null, cancel_at_period_end: false, repeat_trial: false }
    : o.plan === 'ended'
      ? { status: 'trialing', tier: null, trial_ends_at: '2026-09-01T00:00:00.000Z', current_period_end: null, cancel_at_period_end: false, repeat_trial: false }
      : o.plan === 'cancelled'
        ? { status: 'canceled', tier: 'practice', trial_ends_at: null, current_period_end: null, cancel_at_period_end: false, repeat_trial: false }
        : { status: 'active', tier: o.plan, trial_ends_at: null, current_period_end: '2026-11-01T00:00:00.000Z', cancel_at_period_end: false, repeat_trial: false }
  const ent = entitlementsFor(subscription as Parameters<typeof entitlementsFor>[0])
  const limited = ent.maxActiveProjects !== null
  const max = ent.maxActiveProjects ?? Infinity
  const lines = o.sectioned ? [{ id: 'l1', section_id: 'part-2', text: 'Usefulness and being alive only look alike from outside.' }] : []
  const card = (id: string, title: string, shelf_stage: string, extra: Record<string, unknown> = {}) => ({
    ...project('', false), id, title, shelf_stage, arc: 'Beginning', concept_body: 'What the quiet holds when nobody is asking.',
    root_ids: [`${id}-root`], thread_count: 0, stage: 'writing', ...extra,
  })
  const shelf: Array<Record<string, unknown> & { id: string }> = [
    card('demo', 'A morning where nothing was asked', limited && o.reading ? 'queued' : 'active', { root_ids: ['node-1'] }),
    card('p2', 'Letters to the house on the hill', 'active', { root_ids: ['a', 'b', 'c'], thread_count: 2, stage: null, arc: 'Expansion' }),
    card('p6', 'Notes from the ferry', limited && !o.over && !o.reading ? 'queued' : 'active', { stage: 'writing', arc: 'Expansion', created_at: '2026-09-01T00:00:00.000Z', concept_body: '' }),
    card('p3', 'The year of small rooms', 'queued', { stage: 'conceptualising' }),
    card('p4', 'What my father kept', 'queued', { stage: 'conceptualising', arc: 'Integration', resting_until: limited ? restEndsAt() : null }),
    card('p5', 'On leaving early', 'completed', { stage: 'posted', completed_at: NOW }),
  ]
  let seq = 100
  const threads: Array<Record<string, unknown>> = []
  const tags: Array<{ node_id: string; thread_id: string; note: string }> = []
  // ?pieces=1: a board of three pieces, for thread suggestions.
  if (o.pieces) {
    nodes.push(
      node('node-2', null, 1, 'The Room I Never Used', '', paragraphs('Every house I have lived in had a room I never used, kept for a guest who never came.'), { intent: 'A song about rooms kept for later.' }),
      node('node-3', null, 2, 'Before Opening', '', paragraphs('Empty café chairs, stacked, waiting for a day to start.'), { intent: 'Photographs of things waiting to be used.' }),
    )
  }
  // Rules and proposals, the same lifecycle as lib/studio/rule-proposals.ts.
  // ?carried=1: something sent from a check-in, waiting on the project.
  let carried = o.carried ? [{ id: 'cr-1', text: 'The chairs were stacked, waiting, and I think it’s the same thing as the plates.', at: NOW }] : []
  const projectRules: Array<{ id: string; text: string; created_at: string; retired_at: null }> = []
  const proposals: Array<{ id: string; project_id: string; node_id: string | null; kind: string; statement: string; quote: string; source: string; created_at: string }> = []
  const openChecks: unknown[] = []
  let suggestions = [{ id: 'sg-1', name: 'Kept for later', intent: 'Things saved for a day that never comes.', piece_ids: ['node-1', 'node-2'], why: 'A room “kept for a guest who never came” and a morning when nobody needed you.' }]

  const visionTalk: Array<{ id: string; role: string; text: string; sources: Array<{ url: string; title: string }>; created_at: string }> = []
  const visionKept: Array<{ id: string; kind: string; text: string; why: string; quote: string; at: string; state: string }> = o.pieces ? [
    { id: 'vk-1', kind: 'decision', text: 'It is three pieces, not one long one', why: 'each of them has to be able to stand without the others', quote: '', at: '2026-09-18T10:00:00.000Z', state: 'kept' },
    { id: 'vk-2', kind: 'open', text: 'Whether the song is sung or only printed', why: '', quote: '', at: '2026-09-21T10:00:00.000Z', state: 'kept' },
  ] : []
  let visionReading: { at: string; statement: string; gaps: Array<{ id: string; text: string; where: string[] }>; signature: string } | null = null

  const resync = (parentId: string | null) => {
    while (parentId) {
      const parent = nodes.find((n) => n.id === parentId)
      if (!parent) break
      const kids = nodes.filter((n) => n.parent_id === parentId).sort((a, b) => a.position - b.position)
      parent.body = kids.map((k) => plain(k.body)).filter(Boolean).join('\n\n')
      parentId = parent.parent_id
    }
  }
  const sectionsOf = (id: string) => nodes.filter((n) => n.parent_id === id).sort((a, b) => a.position - b.position)
    .map((n) => ({ id: n.id, position: n.position, label: n.title || null, intended_emotion: n.beat || null, content: n.body, is_locked: n.is_locked }))

  // Document history, the same rules as lib/studio/revisions.ts: a version is
  // the piece before an editing stretch (one per ten minutes), or before a
  // reshape, removal or restore.
  const revisions: Array<{ id: string; created_at: string; reason: string; word_count: number; parts: unknown[] }> = []
  const pieceParts = () => {
    const out: Array<{ id: string; parent_id: string | null; position: number; title: string; beat: string; body: string; is_leaf: boolean }> = []
    const walk = (n: MockNode) => {
      const kids = nodes.filter((k) => k.parent_id === n.id).sort((a, b) => a.position - b.position)
      out.push({ id: n.id, parent_id: n.parent_id, position: n.position, title: n.title, beat: n.beat, body: kids.length ? '' : n.body, is_leaf: !kids.length })
      kids.forEach(walk)
    }
    const root = nodes.find((n) => n.id === 'node-1')
    if (root) walk(root)
    return out
  }
  const snap = (reason: string, force = false) => {
    const last = revisions[0]
    if (!force && last && Date.now() - new Date(last.created_at).getTime() < 600_000) return
    const parts = pieceParts()
    const wc = parts.filter((p) => p.is_leaf).reduce((n, p) => n + words(p.body), 0)
    if (!wc && reason === 'edit') return
    revisions.unshift({ id: `rev-${++seq}`, created_at: new Date(Date.now() - (reason === 'edit' ? 0 : 0)).toISOString(), reason, word_count: wc, parts: JSON.parse(JSON.stringify(parts)) })
  }
  ;(window as unknown as { __snap?: typeof snap }).__snap = snap

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = new URL(url, location.origin).pathname
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    const write = async <T,>(fn: () => T): Promise<T> => {
      if (o.slow) await new Promise((r) => setTimeout(r, 20000))
      return fn()
    }

    // ?view=kanban: the Project Board. "demo" is the one card whose canvas and writing are mocked too.
    if (path === '/api/studio/projects' && method === 'GET') return json({ projects: shelf })
    if (path === '/api/idea-lab/conceptualise/draft') return json({ drafts: method === 'GET' ? [{ id: 'd1', phase: 2, messages: [{ role: 'assistant', content: 'What would it cost you to leave that sentence out?' }] }] : [] })
    if (path === '/api/idea-lab/territories') return json({})
    {
      const m = /^\/api\/studio\/projects\/([^/]+)$/.exec(path)
      const row = m && shelf.find((x) => x.id === m[1])
      // The place in Active, as lib/studio/plan-access.ts gives it out.
      if (row && method === 'PATCH' && limited && body.shelf_stage === 'active') {
        const others = shelf.filter((x) => x.shelf_stage === 'active' && x.id !== row.id)
        if (isResting(row.resting_until as string | null)) return json({ error: 'This one is resting.', code: 'plan_resting' }, 409)
        if (others.length >= max) {
          const settle = body.keep_only === true && others.length + (row.shelf_stage === 'active' ? 1 : 0) > max
          if (!settle && body.swap !== true) return json({ error: activeLimitLine(ent.plan), code: 'plan_slot_taken' }, 409)
          const keep = new Set<string>(Array.isArray(body.keep_ids) ? (body.keep_ids as string[]).slice(0, max - 1) : [])
          const leaving = settle ? others.filter((x) => !keep.has(x.id)) : others.filter((x) => x.id === body.rest_id)
          if (!settle && leaving.length !== 1) return json({ error: 'Choose which one rests.', code: 'plan_choose_rest' }, 409)
          for (const other of leaving) Object.assign(other, { shelf_stage: 'queued', resting_until: settle ? null : restEndsAt() })
        }
        return write(() => { Object.assign(row, { shelf_stage: 'active', resting_until: null }); return json({ project: row }) })
      }
      if (row && method === 'PATCH') return write(() => { const { swap: _s, keep_only: _k, rest_id: _r, keep_ids: _i, ...rest } = body; Object.assign(row, rest); return json({ project: row }) })
      if (row && method === 'DELETE') return write(() => { shelf.splice(shelf.indexOf(row), 1); return json(null, 204) })
    }
    if (path === '/api/studio/projects/demo/tree') {
      const active = shelf.filter((x) => x.shelf_stage === 'active').map((x) => ({ id: x.id, title: String(x.title) }))
      const mine = shelf.find((x) => x.id === 'demo')
      const reason = !limited ? null : mine?.shelf_stage !== 'active' ? 'not_active' : active.length > max ? 'over_limit' : null
      const access = { plan: ent.plan, limit: ent.maxActiveProjects, workable: reason === null, reason, active: limited ? active : [], resting_until: null, threads: ent.threads, media: ent.media, visionTalk: ent.visionTalk }
      return json({ project: { ...project(o.text, o.board || o.pieces, o.concept), shelf_stage: mine?.shelf_stage ?? 'active', rules: projectRules, settings: { ...project(o.text, o.board || o.pieces, o.concept).settings, carried } }, tree: { nodes, threads, tags, open_checks: openChecks }, access })
    }
    if (path === '/api/studio/projects/demo/items') {
      if (method === 'GET') return json({ ready: true, items, assets: [], tasks })
      if (method === 'POST') return write(() => {
        if (body.kind !== 'tasks') return json({ error: 'Images and recordings are not mocked here; see /dev/board.' }, 400)
        const it = { id: `it-${++seq}`, user_id: 'u', project_id: 'demo', kind: body.kind, asset_id: null, node_ids: body.node_id ? [body.node_id] : [], board_x: null, board_y: null, w: null, content: {}, created_at: NOW, updated_at: NOW }
        items.push(it)
        return json({ item: it }, 201)
      })
    }
    {
      const m = /^\/api\/studio\/items\/([^/]+)$/.exec(path)
      const it = m && items.find((x) => x.id === m[1])
      if (it && method === 'PATCH') return write(() => { Object.assign(it, { ...body, content: { ...it.content, ...(body.content ?? {}) } }); return json({ item: it }) })
      if (it && method === 'DELETE') return write(() => { items.splice(items.indexOf(it), 1); return json(null, 204) })
    }
    if (path === '/api/studio/projects/demo/tasks' && method === 'PATCH') return write(() => { const t = tasks.find((x) => x.id === body.task_id); if (t) t.status = body.status; return json({ success: true }) })
    if (path === '/api/studio/projects/demo/proposals') {
      const nodeId = new URL(url, location.origin).searchParams.get('node_id')
      return json({ proposals: proposals.filter((p) => p.node_id === nodeId) })
    }
    const decide = path.match(/^\/api\/studio\/proposals\/([^/]+)$/)
    if (decide && method === 'POST') return write(() => {
      const i = proposals.findIndex((p) => p.id === decide[1])
      if (i < 0) return json({ error: 'already answered' }, 409)
      const [p] = proposals.splice(i, 1)
      if (body.action !== 'keep') return json({ rule: null, target: null })
      const rule = { id: `r-${++seq}`, text: body.text ?? p.statement, created_at: NOW, retired_at: null }
      const target = p.node_id ? nodes.find((n) => n.id === p.node_id) : null
      if (target) target.rules = [...target.rules, rule]
      else projectRules.push(rule)
      return json({ rule, target: target ? 'node' : 'project' })
    })
    const check = path.match(/^\/api\/studio\/nodes\/([^/]+)\/check$/)
    if (check && method === 'POST') return write(() => {
      const n = nodes.find((x) => x.id === check[1])
      const rules = [...projectRules, ...((n?.rules ?? []) as typeof projectRules)]
      if (!rules.length) return json({ checks: [], reason: 'no rules in force here' })
      const c = { id: `c-${++seq}`, project_id: 'demo', node_id: check[1], source_node_id: null, source_thread_id: null, rule_id: rules[0].id, rule_text: rules[0].text, question: 'The last paragraph settles what the piece is waiting for. Does it still hold to this rule, or has the rule changed?', outcome: null, outcome_note: null, resolved_at: null, created_at: NOW }
      openChecks.unshift(c)
      return json({ checks: [c] })
    })
    if (path === '/api/studio/projects/demo/carried' && method === 'POST') return write(() => {
      const card = carried.find((c) => c.id === body.id)
      carried = carried.filter((c) => c.id !== body.id)
      if (body.action !== 'accept' || !card) return json({ thread_id: null })
      const th = { id: `th-${++seq}`, user_id: 'u', project_id: 'demo', position: threads.length, name: body.name ?? '', intent: card.text, rules: [], hue: 'violet', board_x: null, board_y: null, created_at: NOW, updated_at: NOW }
      threads.push(th)
      const top = nodes.filter((n) => !n.parent_id)
      for (const id of (top.length === 1 ? [top[0].id] : (body.piece_ids as string[] ?? []))) tags.push({ node_id: id, thread_id: th.id, note: '' })
      return json({ thread_id: th.id })
    })
    if (path === '/api/studio/projects/demo/thread-suggestions' && method === 'POST') return write(() => {
      if (body.action === 'read') return json({ suggestions: nodes.filter((n) => !n.parent_id).length >= 3 ? suggestions : [] })
      const sg = suggestions.find((x) => x.id === body.id)
      suggestions = suggestions.filter((x) => x.id !== body.id)
      if (body.action === 'accept' && sg) {
        const th = { id: `th-${++seq}`, user_id: 'u', project_id: 'demo', position: threads.length, name: sg.name, intent: sg.intent, rules: [], hue: 'tide', board_x: null, board_y: null, created_at: NOW, updated_at: NOW }
        threads.push(th)
        for (const id of sg.piece_ids) tags.push({ node_id: id, thread_id: th.id, note: '' })
        return json({ thread_id: th.id })
      }
      return json({ ok: true })
    })
    if (path.startsWith('/api/studio/projects/demo/open')) return json({ success: true })
    if (path.startsWith('/api/studio/assistant-lock')) return json({ lockedUntil: null })
    if (path.startsWith('/api/settings')) return json({ settings: { dictation_lang: null, sunday_letter: false, onboarded_at: NOW }, email: 'you@example.com' })
    if (path.startsWith('/api/billing/status')) {
      const active = shelf.filter((x) => x.shelf_stage === 'active').map((x) => ({ id: x.id, title: String(x.title) }))
      return json({
        subscription, access: !ent.companion ? 'no_access' : o.plan === null ? 'uncapped' : 'capped', usage: null,
        entitlements: ent, over_limit: limited && active.length > max ? active : null,
      })
    }

    if (/^\/api\/studio\/nodes\/[^/]+\/tasks$/.test(path)) {
      if (method === 'GET') return json({ success: true, tasks })
      if (method === 'POST') return write(() => { const t = { id: `t${++seq}`, node_id: 'node-1', title: body.title, type: body.type ?? 'creation', status: 'pending', is_writing_related: (body.category ?? 'Writing') === 'Writing', category: body.category ?? 'Writing' }; tasks.push(t); return json({ success: true, task: t }, 201) })
      if (method === 'PATCH') return write(() => { const t = tasks.find((x) => x.id === body.task_id); if (t) t.status = body.status; return json({ success: true }) })
      if (method === 'DELETE') return write(() => { const i = tasks.findIndex((x) => x.id === body.task_id); if (i >= 0) tasks.splice(i, 1); return json({ success: true }) })
    }
    if (path === '/api/write/anchor-lines') {
      if (method === 'GET') return json({ anchorLines: lines })
      if (method === 'POST') return write(() => {
        const kids = sectionsOf(body.node_id)
        const l = { id: `l${++seq}`, section_id: body.section_id ?? kids[Math.min(1, kids.length - 1)]?.id ?? null, text: body.text }
        lines.push(l)
        return json({ anchorLine: l })
      })
      if (method === 'DELETE') return write(() => { const i = lines.findIndex((l) => l.id === body.id); if (i >= 0) lines.splice(i, 1); return json({ success: true }) })
    }
    if (path === '/api/write/node' && method === 'GET') {
      const root = nodes.find((n) => n.id === url.split('node_id=')[1]?.split('&')[0]) ?? nodes[0]
      return json({ success: true, piece: { id: root.id, project_id: 'demo', title: root.title, tasks: [] }, lone_piece: true })
    }
    if (path === '/api/write/history') {
      const q = new URL(url, location.origin).searchParams
      if (method === 'GET' && q.get('revision_id')) {
        const r = revisions.find((x) => x.id === q.get('revision_id'))
        return r ? json({ revision: { ...r, piece_id: 'node-1' } }) : json({ error: 'Not found' }, 404)
      }
      if (method === 'GET') return json({ piece_id: 'node-1', revisions: revisions.map(({ parts: _p, ...m }) => m), current: pieceParts() })
      if (method === 'POST') return write(() => {
        const r = revisions.find((x) => x.id === body.revision_id)
        if (!r) return json({ error: 'Not found' }, 404)
        snap('restore', true)
        const parts = r.parts as ReturnType<typeof pieceParts>
        const keep = new Set(parts.map((p) => p.id))
        for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].id !== 'node-1' && !keep.has(nodes[i].id)) nodes.splice(i, 1)
        for (const p of parts) {
          const n = nodes.find((x) => x.id === p.id)
          if (n) { if (p.is_leaf) { n.body = p.body; n.extent = words(p.body) } if (p.id !== 'node-1') { n.title = p.title; n.beat = p.beat; n.position = p.position; n.parent_id = p.parent_id } }
          else nodes.push(node(p.id, p.parent_id, p.position, p.title, p.beat, p.body))
        }
        resync('node-1')
        return json({ ok: true })
      })
    }
    if (path === '/api/write/distill' || path === '/api/write/activity') return json({ success: true })
    // The vision room (components/studio/work/vision-room.tsx): the page, the
    // talk, a reading of the canvas, and what is kept from talk.
    if (path === '/api/studio/projects/demo/vision') {
      if (method === 'GET') return json({ messages: visionTalk, kept: visionKept, reading: visionReading, stale: false, unread: { images: 0, recordings: 0 } })
      const said = String(body.message || '')
      visionTalk.push({ id: `vm-${++seq}`, role: 'person', text: said, sources: [], created_at: NOW })
      const looked = body.lens === 'field'
      const sources = looked ? [
        { url: 'https://example.com/short-documentary-distribution-2026', title: 'Where short documentaries are being shown this year' },
        { url: 'https://example.org/commissioners-survey', title: 'What commissioners say they are buying' },
      ] : []
      const reply = body.lens === 'audience'
        ? 'Three kinds of people are on this canvas, and only one of them is being made for.\n\n- People who are needed all day and have stopped noticing it. They have to meet the empty morning first, before any idea about rest.\n- People who already write about rest. They have heard the argument; they would stay for the room, not the claim.\n- The person you were before that morning. This is who the pieces are actually addressed to.\n\nThe canvas as written serves the third. Is that the one you mean it to reach?'
        : body.lens === 'weakest'
          ? 'The case against it: what the whole thing is for says rest is not the absence of worth, and every piece arrives there by the same door, a quiet room. Someone who is not already persuaded gets the same proof three times.\n\nWhat would a piece look like that reaches it from somewhere loud?'
          : looked
            ? 'What I found, both from the last few weeks: short documentaries are being bought in packages for free streaming channels more than one at a time, and commissioners say they are asking for a series shape even from single films.\n\nThat is what I found. What I am inferring: three pieces with one thread across them is closer to what is being bought than one long piece would be.'
            : 'Then the question is which of the three carries that, and which two are there to earn it. Which one could you least afford to lose?'
      const decided = said.match(/[^.!?]*\b(we are|we're|I am|I'm|it will|it goes|decided)\b[^.!?]*[.!?]?/i)?.[0]?.trim()
      const unsure = said.match(/[^.!?]*\b(don['’]t know|not sure|still deciding)\b[^.!?]*[.!?]?/i)?.[0]?.trim()
      const heard = [
        ...(decided ? [{ id: `vk-${++seq}`, kind: 'decision', text: decided.replace(/[.!?]$/, ''), why: '', quote: decided, at: NOW, state: 'pending' }] : []),
        ...(unsure && unsure !== decided ? [{ id: `vk-${++seq}`, kind: 'open', text: unsure.replace(/[.!?]$/, ''), why: '', quote: unsure, at: NOW, state: 'pending' }] : []),
      ]
      visionKept.push(...heard)
      visionTalk.push({ id: `vm-${++seq}`, role: 'companion', text: reply, sources, created_at: NOW })
      const enc = new TextEncoder()
      const parts = reply.match(/\S+\s*/g) ?? [reply]
      return new Response(new ReadableStream({
        async start(c) {
          // A lookup is slow to start, the way the real one is.
          await new Promise((r) => setTimeout(r, looked ? 5200 : 700))
          for (const piece of parts) { c.enqueue(enc.encode(piece)); await new Promise((r) => setTimeout(r, 18)) }
          c.enqueue(enc.encode(`\u001e${JSON.stringify({ sources, proposals: [], heard })}`))
          c.close()
        },
      }), { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    if (path === '/api/studio/projects/demo/vision/reading' && method === 'POST') {
      if (body?.dismiss) { if (visionReading) visionReading.gaps = visionReading.gaps.filter((g) => g.id !== body.dismiss); return json({ reading: visionReading, stale: false }) }
      await new Promise((r) => setTimeout(r, 1800))
      const tops = nodes.filter((n) => !n.parent_id)
      visionReading = {
        at: new Date().toISOString(),
        statement: tops.length > 1
          ? 'Three pieces about things kept for a later that does not come: a morning, a room, a stack of chairs. Each one stays with the waiting itself and refuses to resolve it. It is for someone who has mistaken being useful for being alive.'
          : 'One piece about a morning when nothing was asked, and what is left of a person when the asking stops.',
        gaps: tops.length > 1 ? [
          { id: `g-${++seq}`, text: 'What the whole thing is for speaks of rest, while “Before Opening” is written as photographs of things waiting to be used; nothing on the canvas says how waiting and rest are the same thing here.', where: ['Before Opening'] },
          { id: `g-${++seq}`, text: '“The Room I Never Used” is called a song and the other two are not; the canvas does not say whether this is one form or three.', where: ['The Room I Never Used'] },
        ] : [],
        signature: 'mock',
      }
      return json({ reading: visionReading, stale: false })
    }
    if (path === '/api/studio/projects/demo/vision/kept' && method === 'POST') return write(() => {
      if (body.action === 'add') { visionKept.push({ id: `vk-${++seq}`, kind: body.kind === 'open' ? 'open' : 'decision', text: body.text, why: body.why ?? '', quote: '', at: new Date().toISOString(), state: 'kept' }); return json({ kept: visionKept }) }
      const i = visionKept.findIndex((k) => k.id === body.id)
      if (i < 0) return json({ error: 'already answered' }, 409)
      if (body.action === 'keep') Object.assign(visionKept[i], { text: body.text || visionKept[i].text, why: body.why ?? visionKept[i].why, state: 'kept' })
      else if (body.action === 'settle') Object.assign(visionKept[i], { kind: 'decision', text: body.text, why: body.why ?? '', state: 'kept', at: new Date().toISOString() })
      else visionKept.splice(i, 1)
      return json({ kept: visionKept })
    })
    if (path === '/api/studio/projects/demo/companion') {
      if (method === 'GET') return json({ messages: [] })
      const said = String(body.message || '').match(/[^.!?]*\b(won['’]t|never|has to|no )[^.!?]*[.!?]?/i)?.[0]?.trim()
      const heard = said ? [{ id: `pr-${++seq}`, project_id: 'demo', node_id: body.node_id ?? null, kind: 'refusal', statement: said.replace(/[.!?]$/, ''), quote: said, source: 'talk', created_at: NOW }] : []
      proposals.push(...heard)
      const enc = new TextEncoder()
      const reply = 'Then the last piece can stop where the waiting stops. What would that look like?'
      return new Response(new ReadableStream({
        start(c) { c.enqueue(enc.encode(reply)); c.enqueue(enc.encode(`\u001e${JSON.stringify({ lockedMode: null, proposals: heard })}`)); c.close() },
      }), { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    if (path === '/api/write/chat' && method === 'POST') {
      ;(window as unknown as { __lastChat?: unknown }).__lastChat = body
      const asked = String(body.message || '')
      const proposes = body.assistant_mode === 'write' && /rewrite/i.test(asked) && body.active_section
      const saw = `(saw: ${body.active_section?.label ?? 'no part'}; ${body.preceding_sections?.length ?? 0} before; ${body.active_section?.anchor_lines?.length ?? 0} lines${body.selected_text ? '; a selection' : ''})`
      const reply = proposes
        ? `Here is a tighter version. ${saw}\n<proposed_edit>\nThe kettle took its time, and I let it.\n</proposed_edit>`
        : `What is that sentence trying to say underneath the words? ${saw}`
      // A boundary said in passing becomes a proposal, quoted.
      const said = asked.match(/[^.!?]*\b(won['’]t|never|has to|no )[^.!?]*[.!?]?/i)?.[0]?.trim()
      const heard = said ? [{ id: `pr-${++seq}`, project_id: 'demo', node_id: body.node_id, kind: 'refusal', statement: said.replace(/[.!?]$/, ''), quote: said, source: 'talk', created_at: NOW }] : []
      proposals.push(...heard)
      const meta = { lockedMode: null, proposals: heard, ...(proposes ? { proposedEdit: { section_id: body.active_section.id, content: 'The kettle took its time, and I let it.', anchor_text: body.selected_text ?? null } } : {}) }
      const enc = new TextEncoder()
      const chunks = reply.match(/[\s\S]{1,24}/g) ?? [reply]
      return new Response(new ReadableStream({
        async start(c) {
          for (const ch of chunks) { c.enqueue(enc.encode(ch)); await new Promise((r) => setTimeout(r, 30)) }
          c.enqueue(enc.encode(`\u001e${JSON.stringify(meta)}`))
          c.close()
        },
      }), { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    if ((path === '/api/write/sections/seed' || path === '/api/write/sections/divide' || path === '/api/write/sections/ingest') && method === 'POST') snap('restructure', true)
    if (path === '/api/write/sections/ingest' && method === 'POST') return write(() => {
      const root = nodes.find((n) => n.id === body.node_id)!
      const text = plain(root.body)
      const beats: Array<[string, string]> = [['Arrival', 'calm'], ['The pull', 'restless'], ['What it holds', 'tender'], ['Settling', 'still']]
      beats.forEach(([title, beat], i) => nodes.push(node(`ing-${++seq}`, root.id, i, title, beat, '')))
      const kids = sectionsOf(root.id)
      const full = words(text) >= 100 || text.split(/\n{2,}/).length >= 2
      if (full) {
        text.split(/\n{2,}/).forEach((para, i) => { const k = nodes.find((n) => n.id === kids[i % kids.length].id)!; k.body = paragraphs(`${plain(k.body)}\n\n${para}`.trim()); k.extent = words(k.body) })
        resync(root.id)
        return json({ type: 'draft', sections: sectionsOf(root.id) })
      }
      const made = text.split(/[.!?]+/).map((x) => x.trim()).filter((x) => x.split(/\s+/).length >= 2).map((x, i) => ({ id: `l${++seq}`, section_id: kids[i % kids.length].id, text: x }))
      lines.push(...made)
      return json({ type: 'loose', sections: kids, anchorLines: made })
    })
    if (path === '/api/write/sections/seed' && method === 'POST') return write(() => {
      const beats: Array<[string, string]> = [['Arrival', 'calm'], ['The pull', 'restless'], ['What it holds', 'tender'], ['Settling', 'still']]
      beats.forEach(([title, beat], i) => nodes.push(node(`seed-${++seq}`, body.node_id, i, title, beat, '')))
      return json({ sections: sectionsOf(body.node_id), suggestions: beats.map(() => '') })
    })
    if (path === '/api/write/sections/divide' && method === 'POST') return write(() => {
      const root = nodes.find((n) => n.id === body.node_id)!
      const text = plain(root.body)
      for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].parent_id === root.id) nodes.splice(i, 1)
      const chunks = text.split(/\n{2,}/).filter(Boolean)
      ;(chunks.length > 1 ? chunks : [text]).forEach((c, i) => nodes.push(node(`div-${++seq}`, root.id, i, ['Arrival', 'The pull', 'Settling'][i] ?? `Section ${i + 1}`, '', c)))
      resync(root.id)
      return json({ sections: sectionsOf(root.id) })
    })
    if (path === '/api/studio/projects/demo/nodes' && method === 'POST') return write(() => {
      const kids = nodes.filter((n) => n.parent_id === (body.parent_id ?? null))
      const n = node(`n-${++seq}`, body.parent_id ?? null, kids.length, '', '', '')
      nodes.push(n)
      return json({ node: n }, 201)
    })
    const reorder = path.match(/^\/api\/studio\/nodes\/([^/]+)\/reorder$/)
    if (reorder && method === 'POST') return write(() => { (body.ids as string[]).forEach((id, i) => { const n = nodes.find((x) => x.id === id); if (n) n.position = i }); resync(reorder[1]); return json({ nodes: sectionsOf(reorder[1]) }) })
    const one = path.match(/^\/api\/studio\/nodes\/([^/]+)$/)
    if (one && method === 'PATCH' && typeof body.body === 'string') snap('edit')
    if (one && method === 'DELETE') snap('remove', true)
    if (one && method === 'PATCH') return write(() => {
      const n = nodes.find((x) => x.id === one[1])
      if (!n) return json({ error: 'gone' }, 404)
      Object.assign(n, Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)))
      if (typeof body.body === 'string') { n.extent = words(body.body); resync(n.parent_id) }
      return json({ node: n })
    })
    if (one && method === 'DELETE') return write(() => {
      const n = nodes.find((x) => x.id === one[1])
      const parent = n?.parent_id ?? null
      for (let i = nodes.length - 1; i >= 0; i--) if (nodes[i].id === one[1] || nodes[i].parent_id === one[1]) nodes.splice(i, 1)
      resync(parent)
      return json(null, 204)
    })
    if (path.startsWith('/api/studio/') && method !== 'GET') return write(() => json({ success: true }))
    return real(input, init)
  }
}

function Inner() {
  const params = useSearchParams()
  const on = (k: string) => !!params.get(k)
  // ?empty=1 is a blank page; the default is the paragraph "Skip to writing" leaves behind. ?long=1 has a full draft.
  const text = on('empty') ? '' : on('long') || on('sectioned') ? LONG : IDEA
  const plan = (['practice', 'direction', 'ended', 'cancelled'] as const).find((x) => x === params.get('plan')) ?? null
  const opts: Opts = { text, concept: on('concept'), board: on('board'), sectioned: on('sectioned'), slow: on('slow'), pieces: on('pieces'), carried: on('carried'), plan, over: on('over'), reading: on('reading') }
  if (typeof window !== 'undefined') installMock(opts)
  // ?view=home reproduces Home's header (the only page with the settings gear) to check the sheet against the dock.
  if (params.get('view') === 'home') {
    return (
      <PageShell mood="ember">
        <PageHeader title="Good evening" actions={<SettingsButton />} />
        <Container><Card>A page with the settings gear in its header.</Card></Container>
      </PageShell>
    )
  }
  // The root layout's gate asked for the real plan before this mock was in
  // place (and was refused: nobody is signed in here). A second one, mounted
  // after it, is the one that sees the mocked plan.
  const gate = plan ? <AccessGate /> : null
  if (params.get('view') === 'kanban') return <>{gate}<ProjectBoard /></>
  // ?board=1 is the canvas a single piece opens onto from the Project Board.
  if (on('board') || on('pieces')) return <>{gate}<WorkPage projectId="demo" focus={{ kind: 'project' }} /></>
  return <>{gate}<WorkPage projectId="demo" focus={{ kind: 'node', id: 'node-1' }} /></>
}

export function WorkPageHarness() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
