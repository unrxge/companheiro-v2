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
  shelf_x?: number | null
  shelf_y?: number | null
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
  | { kind: 'project'; id: string; title: string; state: Exclude<FolderState, 'undeclared'>; created: string; accessed: string; completed: string | null; shelfX: number | null; shelfY: number | null }
  | { kind: 'draft'; id: string; title: string; state: 'undeclared'; created: string; accessed: string; completed: null; shelfX: null; shelfY: null }

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
      shelfX: p.shelf_x ?? null,
      shelfY: p.shelf_y ?? null,
    })),
    ...drafts.map((d): BoardItem => ({
      kind: 'draft',
      id: d.id,
      title: draftTitle(d),
      state: 'undeclared',
      created: d.created_at || d.updated_at,
      accessed: d.updated_at,
      completed: null,
      shelfX: null,
      shelfY: null,
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

// ── the grid ────────────────────────────────────────────────────────────────

/** What one screenful of the board holds: portrait screens (a phone held
 *  upright) show 4 columns by 3 rows, landscape screens show 5 by 2. More
 *  folders than that scroll downward; the width never grows. */
export const VIEW = {
  portrait: { cols: 4, rows: 3 },
  landscape: { cols: 5, rows: 2 },
} as const

export interface Grid {
  cols: number
  rows: number
  portrait: boolean
  /** Clear space left and right, matching the canvas's own edge fade. */
  sidePad: number
  topPad: number
  bottomPad: number
  /** One folder's cell, including the air around it. */
  pitchX: number
  pitchY: number
  iconW: number
  fontSize: number
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** The grid for a canvas window of this size, sized so exactly VIEW.cols by
 *  VIEW.rows folders fit in it at 100%. */
export function gridFor(w: number, h: number): Grid {
  const portrait = h > w
  const { cols, rows } = portrait ? VIEW.portrait : VIEW.landscape
  // The canvas fades its edges; folders live inside the part that isn't faded.
  const sidePad = clamp(Math.round(w * 0.06), 16, 80)
  const topPad = clamp(Math.round(h * 0.06), 12, 52) + 6
  const bottomPad = 64 // room for the corner controls
  const pitchX = Math.max(40, (w - sidePad * 2) / cols)
  const pitchY = Math.max(60, (h - topPad - bottomPad) / rows)
  const fontSize = portrait ? 11 : 13
  const titleH = Math.ceil(fontSize * 1.3 * 2)
  const byWidth = pitchX * (portrait ? 0.84 : 0.72)
  const byHeight = ((pitchY - titleH - 12) * 160) / 132
  return {
    cols, rows, portrait, sidePad, topPad, bottomPad, pitchX, pitchY,
    iconW: Math.floor(Math.max(36, Math.min(byWidth, byHeight))),
    fontSize,
  }
}

export interface Pt { x: number; y: number }

/** Where the nth folder sits when nobody has moved it: left to right, wrapping. */
export function slotAt(index: number, g: Grid): Pt {
  return {
    x: Math.round(g.sidePad + (index % g.cols) * g.pitchX),
    y: Math.round(g.topPad + Math.floor(index / g.cols) * g.pitchY),
  }
}

/**
 * Hand-placed positions are saved in units that mean the same thing on every
 * screen — a fraction of the board's width, and a number of rows down — not
 * in pixels, so a layout made on a desktop still makes sense on a phone. The
 * offset marks the format: anything below it is an older pixel position from
 * before this existed, and is treated as not placed at all.
 */
const STORED_BASE = 1_000_000

export function encodePosition(at: Pt, worldW: number, pitchY: number): { x: number; y: number } {
  return {
    x: STORED_BASE + Math.round((at.x / Math.max(1, worldW)) * 10_000),
    y: STORED_BASE + Math.round((at.y / Math.max(1, pitchY)) * 1_000),
  }
}

export function decodePosition(x: number | null, y: number | null, worldW: number, pitchY: number): Pt | null {
  if (x === null || y === null || x < STORED_BASE || y < STORED_BASE) return null
  return {
    x: Math.round(((x - STORED_BASE) / 10_000) * worldW),
    y: Math.round(((y - STORED_BASE) / 1_000) * pitchY),
  }
}
