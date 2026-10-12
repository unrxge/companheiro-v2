'use client'

// Preview of /admin/people without an account: two made-up people, built by
// the same code that reads real rows (lib/ops/people.ts), so the screen can be
// looked at and laid out with nobody's data.
import { PeopleView, type PeopleSource } from '@/components/admin/people-view'
import { projectStories, summarise, writingByDay, type Rows } from '@/lib/ops/people'
import { personMoney } from '@/lib/ops/money'

const at = (daysAgo: number, hour = 10) => new Date(Date.now() - daysAgo * 86_400_000 + hour * 3_600_000).toISOString()
const dateOf = (daysAgo: number) => at(daysAgo).slice(0, 10)

const ANA: Rows = {
  studio_projects: [
    { id: 'p1', user_id: 'ana', shelf_stage: 'completed', status: 'finished', resting_until: null, completed_at: at(12), last_opened_at: at(11), created_at: at(40), updated_at: at(12) },
    { id: 'p2', user_id: 'ana', shelf_stage: 'active', status: 'active', resting_until: null, completed_at: null, last_opened_at: at(0), created_at: at(9), updated_at: at(0) },
    { id: 'p3', user_id: 'ana', shelf_stage: 'queued', status: 'resting', resting_until: at(-6), completed_at: null, last_opened_at: at(5), created_at: at(5), updated_at: at(5) },
  ],
  studio_nodes: [
    { id: 'n1', project_id: 'p1', parent_id: null, status: 'done', extent: 0, created_at: at(38) },
    { id: 'n1a', project_id: 'p1', parent_id: 'n1', status: 'done', extent: 640, created_at: at(36) },
    { id: 'n1b', project_id: 'p1', parent_id: 'n1', status: 'done', extent: 810, created_at: at(36) },
    { id: 'n1c', project_id: 'p1', parent_id: 'n1', status: 'done', extent: 420, created_at: at(30) },
    { id: 'n2', project_id: 'p2', parent_id: null, status: 'drafted', extent: 530, created_at: at(8) },
    { id: 'n3', project_id: 'p2', parent_id: null, status: 'open', extent: 0, created_at: at(3) },
  ],
  studio_concept_revisions: [
    { project_id: 'p1', origin: 'creation', created_at: at(39) },
    { project_id: 'p1', origin: 'edit', created_at: at(33) },
    { project_id: 'p2', origin: 'creation', created_at: at(9, 14) },
  ],
  studio_piece_revisions: [
    ...[[35, 180], [33, 520], [30, 900], [26, 1240], [21, 1500], [16, 1790], [13, 1870]].map(([d, w]) => ({ piece_id: 'n1', word_count: w, created_at: at(d) })),
    ...[[7, 90], [5, 260], [2, 410], [0, 530]].map(([d, w]) => ({ piece_id: 'n2', word_count: w, created_at: at(d) })),
  ],
  studio_threads: [{ project_id: 'p1', created_at: at(34) }, { project_id: 'p1', created_at: at(31) }, { project_id: 'p2', created_at: at(6) }],
  studio_tasks: [
    ...Array.from({ length: 6 }, (_, i) => ({ project_id: 'p1', status: 'complete', created_at: at(32 - i) })),
    { project_id: 'p2', status: 'complete', created_at: at(6) },
    { project_id: 'p2', status: 'pending', created_at: at(6) },
    { project_id: 'p2', status: 'pending', created_at: at(4) },
  ],
  studio_board_items: [
    { project_id: 'p1', kind: 'image', created_at: at(29) },
    { project_id: 'p1', kind: 'image', created_at: at(28) },
    { project_id: 'p2', kind: 'recording', created_at: at(4) },
    { project_id: 'p2', kind: 'tasks', created_at: at(6) },
  ],
  studio_vision_messages: [
    ...Array.from({ length: 5 }, (_, i) => ({ project_id: 'p1', node_id: null, role: i % 2 ? 'companion' : 'person', created_at: at(27, 10 + i) })),
    ...Array.from({ length: 8 }, (_, i) => ({ project_id: 'p1', node_id: 'n1b', role: i % 2 ? 'companion' : 'person', created_at: at(22, 10 + i) })),
    { project_id: 'p2', node_id: 'n2', role: 'person', created_at: at(2) },
  ],
  studio_rule_checks: [{ project_id: 'p1', created_at: at(20) }, { project_id: 'p1', created_at: at(18) }],
  studio_anchor_lines: [{ project_id: 'p1', created_at: at(25) }, { project_id: 'p2', created_at: at(3) }],
  studio_post_publication_logs: [{ node_id: 'n1', created_at: at(10) }],
  writing_activity: [0, 1, 2, 4, 5, 7, 9, 13, 16, 21, 26, 30, 33, 35].map((d, i) => ({ user_id: 'ana', date: dateOf(d), seconds: 900 + ((i * 7) % 5) * 600 })),
}

const TOMAS: Rows = {
  studio_projects: [{ id: 'q1', user_id: 'tomas', shelf_stage: 'active', status: 'active', resting_until: null, completed_at: null, last_opened_at: at(6), created_at: at(8), updated_at: at(6) }],
  studio_nodes: [],
  studio_concept_revisions: [{ project_id: 'q1', origin: 'creation', created_at: at(8, 11) }],
  writing_activity: [],
}

const PRICES = { prices: { practice: { monthly: 9, yearly: 90 }, direction: { monthly: 29, yearly: 290 } }, netFactor: 0.75, eurPerUsd: 0.86 }
const MONEY: Record<string, ReturnType<typeof personMoney>> = {
  ana: personMoney(
    [{ kind: 'subscribed', tier: 'direction', billing_interval: 'month', created_at: at(34) }],
    Array.from({ length: 140 }, (_, i) => ({ created_at: at(i % 40), cost_micros: 30_000 + ((i * 37) % 9) * 14_000 })),
    PRICES,
  ),
  tomas: personMoney([], Array.from({ length: 9 }, (_, i) => ({ created_at: at(i % 8), cost_micros: 21_000 })), PRICES),
}

const PEOPLE = [
  { account: { id: 'ana', email: 'ana@example.com', joined: at(41), name: 'Ana', practices: ['writer', 'director'], status: 'active', tier: 'direction' }, rows: ANA },
  { account: { id: 'tomas', email: 'tomas@example.com', joined: at(8), name: '', practices: ['songwriter'], status: 'trialing', tier: null }, rows: TOMAS },
]

const source: PeopleSource = {
  list: async () => ({ people: PEOPLE.map((p) => ({ ...summarise(p.account, p.rows), money: MONEY[p.account.id] })), switchedOff: 1, notYetTold: 2 }),
  person: async (id) => {
    const p = PEOPLE.find((x) => x.account.id === id)!
    return { person: { ...summarise(p.account, p.rows), money: MONEY[id] }, projects: projectStories(p.rows), writing: writingByDay(p.rows) }
  },
}

export default function DevPeoplePage() {
  return <PeopleView source={source} />
}
