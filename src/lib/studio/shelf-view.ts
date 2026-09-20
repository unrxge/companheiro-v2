// src/lib/studio/shelf-view.ts — what the Project Board draws, as plain data.
//
// Folders come from two places: studio projects (queued / active / completed)
// and Idea Lab's unfinished conceptualise drafts (ideas not yet declared).
// Everything the view needs to decide — which icon, which order, what the
// hover says — is decided here, with no React, so it can be tested alone.

export type FolderState = 'undeclared' | 'queued' | 'active' | 'completed'

export interface ProjectLike {
  id: string
  title: string
  shelf_stage?: 'queued' | 'active' | 'completed' | null
  created_at: string
  last_opened_at: string
  completed_at: string | null
}

export interface DraftLike {
  id: string
  seed: string | null
  question: string | null
  messages: { role: 'user' | 'assistant'; content: string }[]
  created_at?: string | null
  updated_at: string
}

export type BoardItem =
  | { kind: 'project'; id: string; title: string; state: Exclude<FolderState, 'undeclared'>; created: string; accessed: string; completed: string | null }
  | { kind: 'draft'; id: string; title: string; state: 'undeclared'; created: string; accessed: string; completed: null }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

export function draftTitle(d: DraftLike): string {
  const firstUser = d.messages.find((m) => m.role === 'user')?.content
  const raw = [d.seed, firstUser, d.question].find((v) => typeof v === 'string' && v.trim())
  return raw ? clip(raw.trim().replace(/\s+/g, ' '), 60) : 'Untitled idea'
}

export function projectState(p: Pick<ProjectLike, 'shelf_stage'>): Exclude<FolderState, 'undeclared'> {
  return p.shelf_stage === 'queued' || p.shelf_stage === 'completed' ? p.shelf_stage : 'active'
}

/** Most recently accessed first; ties fall back to newest-created, then id, so
 *  the order never shuffles between renders. */
export function boardItems(projects: ProjectLike[], drafts: DraftLike[]): BoardItem[] {
  const items: BoardItem[] = [
    ...projects.map((p): BoardItem => ({
      kind: 'project',
      id: p.id,
      title: p.title.trim() || 'Untitled project',
      state: projectState(p),
      created: p.created_at,
      accessed: p.last_opened_at || p.created_at,
      completed: p.completed_at,
    })),
    ...drafts.map((d): BoardItem => ({
      kind: 'draft',
      id: d.id,
      title: draftTitle(d),
      state: 'undeclared',
      created: d.created_at || d.updated_at,
      accessed: d.updated_at,
      completed: null,
    })),
  ]
  const at = (iso: string) => {
    const n = new Date(iso).getTime()
    return Number.isNaN(n) ? 0 : n
  }
  return items.sort((a, b) =>
    at(b.accessed) - at(a.accessed) || at(b.created) - at(a.created) || a.id.localeCompare(b.id),
  )
}

const DAY = 86_400_000

/** "under a day", "6 days", "3 weeks", "5 months", "2 years" — how long a
 *  folder took from creation to completion. Never negative. */
export function spanLabel(ms: number): string {
  const days = Math.max(0, ms) / DAY
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (days < 1) return 'under a day'
  if (days < 14) return plural(Math.round(days), 'day')
  if (days < 90) return plural(Math.round(days / 7), 'week')
  if (days < 730) return plural(Math.round(days / 30.44), 'month')
  return plural(Math.round(days / 365.25), 'year')
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

const dateOf = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d)
}

export interface HoverLine { label: string; value: string }

/** The three things a folder says when hovered. Completed only appears once
 *  there is something to say, and carries the time it took in brackets. */
export function hoverLines(item: BoardItem): HoverLine[] {
  const d = new Date(item.accessed)
  const accessed = Number.isNaN(d.getTime()) ? '—' : `${dateFmt.format(d)}, ${timeFmt.format(d)}`
  const lines: HoverLine[] = [
    { label: 'Created', value: dateOf(item.created) },
    { label: 'Last accessed', value: accessed },
  ]
  if (item.completed) {
    const took = new Date(item.completed).getTime() - new Date(item.created).getTime()
    lines.push({ label: 'Completed', value: `${dateOf(item.completed)} (${spanLabel(Number.isNaN(took) ? 0 : took)})` })
  }
  return lines
}
