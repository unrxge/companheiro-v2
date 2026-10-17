// Where someone has dragged things on an example's canvas. The examples are
// never stored, so the arrangement is kept in this browser (localStorage), as
// a convenience for the one looking: it survives a reload and goes nowhere
// else. Moving things is the one thing an example lets anyone do.
//
// Each change is also sent to /api/examples/layout, which keeps it only for
// the owner (ADMIN_USER_IDS): that is how the arrangement the owner leaves
// becomes the one every new account starts from (scripts/example-layout.mjs
// reads it, and it is written into the example's file).

export type Spot = { x: number; y: number } | null
export type Layout = Record<string, Spot>

const KEY = (projectId: string) => `companheiro:example-layout:${projectId}`

export function readLayout(projectId: string): Layout {
  try {
    const raw = window.localStorage.getItem(KEY(projectId))
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Layout = {}
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (!id.startsWith(projectId)) continue
      if (at === null) out[id] = null
      else if (at && typeof at === 'object' && Number.isFinite((at as Spot)!.x) && Number.isFinite((at as Spot)!.y)) out[id] = { x: Math.round((at as { x: number }).x), y: Math.round((at as { y: number }).y) }
    }
    return out
  } catch {
    return {}
  }
}

function send(projectId: string, layout: Layout | null) {
  try {
    void fetch('/api/examples/layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify({ project_id: projectId, layout }),
    }).catch(() => {})
  } catch {
    // Nothing depends on it.
  }
}

/** Keeps where one thing was put (null: back where the board would place it). */
export function keepSpot(projectId: string, id: string, at: Spot): Layout {
  const next = { ...readLayout(projectId), [id]: at ? { x: Math.round(at.x), y: Math.round(at.y) } : null }
  try { window.localStorage.setItem(KEY(projectId), JSON.stringify(next)) } catch { /* private window: it lasts this visit */ }
  send(projectId, next)
  return next
}

/** Everything back where the example put it. */
export function forgetLayout(projectId: string): void {
  try { window.localStorage.removeItem(KEY(projectId)) } catch { /* nothing kept */ }
  send(projectId, null)
}

/** Rows with what was dragged laid over them. */
export function withLayout<T extends { id: string; board_x: number | null; board_y: number | null }>(rows: T[], layout: Layout): T[] {
  return rows.map((row) => (row.id in layout
    ? { ...row, board_x: layout[row.id]?.x ?? null, board_y: layout[row.id]?.y ?? null }
    : row))
}
