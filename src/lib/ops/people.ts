// Usage analytics for /admin/people: how each person uses the project side of
// the app, and how each of their projects came to be. Built only from dates,
// counts and fixed choices. See lib/usage-analytics.ts for what that means and
// whose may be shown.
//
// COLUMNS is the whole of what is ever read. Nothing a person wrote is in it:
// no title, intent, body, text, note or name. Adding a column here is adding
// to what the maker can see, so add only numbers, dates, ids and enums, and
// never a table outside the project side of the app (no check-ins, captures,
// ideas, portrait, letters).

export const COLUMNS = {
  studio_projects: 'id, user_id, shelf_stage, status, resting_until, completed_at, last_opened_at, created_at, updated_at',
  studio_nodes: 'id, project_id, parent_id, status, extent, created_at',
  studio_concept_revisions: 'project_id, origin, created_at',
  studio_piece_revisions: 'piece_id, word_count, created_at',
  studio_threads: 'project_id, created_at',
  studio_tasks: 'project_id, status, created_at',
  studio_board_items: 'project_id, kind, created_at',
  studio_vision_messages: 'project_id, node_id, role, created_at',
  studio_rule_checks: 'project_id, created_at',
  studio_anchor_lines: 'project_id, created_at',
  studio_post_publication_logs: 'node_id, created_at',
  writing_activity: 'user_id, date, seconds',
} as const

export type Table = keyof typeof COLUMNS
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>
export type Rows = Partial<Record<Table, Row[]>>

const DAY = 86_400_000
const earliest = (dates: (string | null | undefined)[]) => dates.filter(Boolean).sort()[0] ?? null
const latest = (dates: (string | null | undefined)[]) => dates.filter(Boolean).sort().at(-1) ?? null

// ── The list ────────────────────────────────────────────────────────────────

export interface PersonSummary {
  id: string
  name: string
  email: string
  joined: string
  /** Trial, Practice, Direction… as the plan stands today. */
  plan: string
  practices: string[]
  projects: { total: number; queued: number; active: number; completed: number }
  /** The last time any project of theirs was opened or changed. */
  lastActive: string | null
  /** Days with writing in the last 30, and the minutes written on them. */
  writingDays: number
  writingMinutes: number
  /** What they have cost and brought in (lib/ops/money.ts). Added by the routes. */
  money?: import('./money').PersonMoney
}

export interface Account {
  id: string
  email: string
  joined: string
  name?: string | null
  practices?: string[] | null
  status?: string | null
  tier?: string | null
}

export function planLabel(status?: string | null, tier?: string | null): string {
  if (status === 'grandfathered') return 'Everything, free'
  if (status === 'trialing') return 'Free month'
  if (status === 'canceled') return 'Ended'
  if (status === 'active' || status === 'past_due') return tier === 'direction' ? 'Direction' : 'Focus'
  return '—'
}

export function summarise(account: Account, rows: Rows, now = Date.now()): PersonSummary {
  const projects = rows.studio_projects ?? []
  const count = (stage: string) => projects.filter((p) => p.shelf_stage === stage).length
  const since = new Date(now - 30 * DAY).toISOString().slice(0, 10)
  const recent = (rows.writing_activity ?? []).filter((w) => w.date >= since && w.seconds > 0)
  return {
    id: account.id,
    name: account.name?.trim() || '',
    email: account.email,
    joined: account.joined,
    plan: planLabel(account.status, account.tier),
    practices: account.practices ?? [],
    projects: { total: projects.length, queued: count('queued'), active: count('active'), completed: count('completed') },
    lastActive: latest(projects.flatMap((p) => [p.updated_at, p.last_opened_at])),
    writingDays: recent.length,
    writingMinutes: Math.round(recent.reduce((s, w) => s + w.seconds, 0) / 60),
  }
}

// ── One person: how each project came to be ─────────────────────────────────

export interface Step {
  key: string
  /** What happened, in the app's own words for the feature. */
  label: string
  at: string
  /** Whole days since the step before it. */
  daysAfter: number
}

export interface ProjectStory {
  /** Project 1, 2, 3… in the order they were started. Never its title. */
  n: number
  id: string
  shelf: 'queued' | 'active' | 'completed'
  resting: boolean
  /** Where it has got to. */
  stage: 'Shaping the concept' | 'Writing' | 'Written' | 'Finished'
  started: string
  lastOpened: string | null
  /** What has happened, oldest first. */
  steps: Step[]
  /** Parts of the app this project has not touched. */
  untouched: string[]
  counts: {
    pieces: number
    parts: number
    words: number
    threads: number
    tasks: number
    tasksDone: number
    images: number
    recordings: number
    taskLists: number
    anchorLines: number
    conceptEdits: number
    visionTurns: number
    partTurns: number
    ruleChecks: number
    reflections: number
  }
  /** Total words across the project's pieces each time one was saved to history. */
  words: { at: string; words: number }[]
}

export function projectStories(rows: Rows, now = Date.now()): ProjectStory[] {
  const by = (list: Row[] | undefined, key: string) => {
    const map = new Map<string, Row[]>()
    for (const r of list ?? []) map.set(r[key], [...(map.get(r[key]) ?? []), r])
    return map
  }
  const nodes = by(rows.studio_nodes, 'project_id')
  const projectOfNode = new Map((rows.studio_nodes ?? []).map((n) => [n.id, n.project_id]))
  const concept = by(rows.studio_concept_revisions, 'project_id')
  const threads = by(rows.studio_threads, 'project_id')
  const tasks = by(rows.studio_tasks, 'project_id')
  const items = by(rows.studio_board_items, 'project_id')
  const talk = by(rows.studio_vision_messages, 'project_id')
  const checks = by(rows.studio_rule_checks, 'project_id')
  const anchors = by(rows.studio_anchor_lines, 'project_id')
  const history = by((rows.studio_piece_revisions ?? []).map((r) => ({ ...r, project_id: projectOfNode.get(r.piece_id) })), 'project_id')
  const reflections = by((rows.studio_post_publication_logs ?? []).map((r) => ({ ...r, project_id: projectOfNode.get(r.node_id) })), 'project_id')

  return [...(rows.studio_projects ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((p, i) => {
      const mine = nodes.get(p.id) ?? []
      const pieces = mine.filter((n) => !n.parent_id)
      const parts = mine.filter((n) => n.parent_id)
      const said = (talk.get(p.id) ?? []).filter((m) => m.role === 'person')
      const saved = [...(history.get(p.id) ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
      const kinds = (kind: string) => (items.get(p.id) ?? []).filter((it) => it.kind === kind)
      const finished = p.shelf_stage === 'completed'

      // Total words over time: the latest count of every piece, each time one is saved.
      const lastCount = new Map<string, number>()
      const words = saved.map((r) => {
        lastCount.set(r.piece_id, r.word_count)
        return { at: r.created_at, words: [...lastCount.values()].reduce((s, w) => s + w, 0) }
      })

      // [key, what happened, when, what to call it when it has not happened]
      const happened: [string, string, string | null, string][] = [
        ['started', 'Project started', p.created_at, ''],
        ['concept', 'Core concept written', earliest((concept.get(p.id) ?? []).map((c) => c.created_at)), 'a core concept'],
        ['piece', 'First piece added', earliest(pieces.map((n) => n.created_at)), 'pieces'],
        ['parts', 'A piece divided into parts', earliest(parts.map((n) => n.created_at)), 'parts'],
        ['writing', 'Writing began', earliest(saved.filter((r) => r.word_count > 0).map((r) => r.created_at)), 'writing'],
        ['thread', 'First thread added', earliest((threads.get(p.id) ?? []).map((t) => t.created_at)), 'threads'],
        ['tasks', 'First task', earliest((tasks.get(p.id) ?? []).map((t) => t.created_at)), 'tasks'],
        ['image', 'First image on the canvas', earliest(kinds('image').map((it) => it.created_at)), 'images'],
        ['recording', 'First recording on the canvas', earliest(kinds('recording').map((it) => it.created_at)), 'recordings'],
        ['vision', 'Talked about the vision', earliest(said.filter((m) => !m.node_id).map((m) => m.created_at)), 'talk about the vision'],
        ['companion', 'Talked with the companion inside a piece', earliest(said.filter((m) => m.node_id).map((m) => m.created_at)), 'the companion inside a piece'],
        ['finished', 'Finished', finished ? p.completed_at ?? p.updated_at : null, ''],
        ['reflected', 'Looked back on it', earliest((reflections.get(p.id) ?? []).map((r) => r.created_at)), ''],
      ]
      const done = happened.filter((h): h is [string, string, string, string] => !!h[2]).sort((a, b) => a[2].localeCompare(b[2]))
      const steps = done.map(([key, label, at], j) => ({
        key,
        label,
        at,
        daysAfter: j === 0 ? 0 : Math.max(0, Math.floor((Date.parse(at) - Date.parse(done[j - 1][2])) / DAY)),
      }))

      const totalWords = mine.reduce((s, n) => s + (n.extent ?? 0), 0)
      const stage: ProjectStory['stage'] = finished
        ? 'Finished'
        : pieces.length > 0 && pieces.every((n) => n.status === 'done')
          ? 'Written'
          : totalWords > 0 || pieces.some((n) => n.status !== 'open')
            ? 'Writing'
            : 'Shaping the concept'

      return {
        n: i + 1,
        id: p.id,
        shelf: p.shelf_stage,
        resting: !!p.resting_until && Date.parse(p.resting_until) > now,
        stage,
        started: p.created_at,
        lastOpened: latest([p.last_opened_at, p.updated_at]),
        steps,
        untouched: happened.filter((h) => !h[2] && h[3]).map((h) => h[3]),
        counts: {
          pieces: pieces.length,
          parts: parts.length,
          words: totalWords,
          threads: (threads.get(p.id) ?? []).length,
          tasks: (tasks.get(p.id) ?? []).length,
          tasksDone: (tasks.get(p.id) ?? []).filter((t) => t.status === 'complete').length,
          images: kinds('image').length,
          recordings: kinds('recording').length,
          taskLists: kinds('tasks').length,
          anchorLines: (anchors.get(p.id) ?? []).length,
          conceptEdits: (concept.get(p.id) ?? []).filter((c) => c.origin === 'edit').length,
          visionTurns: said.filter((m) => !m.node_id).length,
          partTurns: said.filter((m) => m.node_id).length,
          ruleChecks: (checks.get(p.id) ?? []).length,
          reflections: (reflections.get(p.id) ?? []).length,
        },
        words,
      }
    })
}

/** Minutes written on each of the last `days` days, oldest first, for the small chart. */
export function writingByDay(rows: Rows, days = 60, now = Date.now()): { date: string; minutes: number }[] {
  const seconds = new Map((rows.writing_activity ?? []).map((w) => [w.date as string, w.seconds as number]))
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(now - (days - 1 - i) * DAY).toISOString().slice(0, 10)
    return { date, minutes: Math.round((seconds.get(date) ?? 0) / 60) }
  })
}
