'use client'

// ── pieces opened and left as they were ────────────────────────────────────
//
// Everything else a person does to a piece writes a row, and the database
// stamps it. Opening a piece, reading it and leaving writes nothing — and it
// is still the piece they were last working on, so the canvas should open
// there next time.
//
// Kept in the browser rather than the database: it is a convenience about
// where to look first, not a fact about the work, and it is not worth a
// request on every piece opened. It survives sessions on this machine, and
// on another the `updated_at` marks alone decide — a reasonable answer, just
// a less exact one.

const KEY = 'companheiro.opened'
/** Per project, how many pieces are remembered before the oldest is dropped. */
const KEEP = 24

type Store = Record<string, Record<string, number>>

function read(): Store {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as Store) : {}
  } catch {
    // Private windows, blocked site data, a half-written value: no note is
    // simply no note, and the board falls back to what the rows say.
    return {}
  }
}

/** When each piece of this project was last opened in this browser. */
export function openedIn(projectId: string): Record<string, number> {
  if (typeof window === 'undefined') return {}
  return read()[projectId] ?? {}
}

/** Notes that this piece was opened just now. */
export function noteOpened(projectId: string, pieceId: string): void {
  if (typeof window === 'undefined') return
  try {
    const store = read()
    const mine = { ...(store[projectId] ?? {}), [pieceId]: Date.now() }
    const kept = Object.entries(mine)
      .sort((a, b) => b[1] - a[1])
      .slice(0, KEEP)
    store[projectId] = Object.fromEntries(kept)
    window.localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // Not being able to remember where someone was is not worth an error.
  }
}

/** On sign-out: the next person in this browser starts from the rows alone. */
export function forgetOpened(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch { /* nothing to clear */ }
}
