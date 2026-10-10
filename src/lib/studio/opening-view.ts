// ── which card the canvas opens on ──────────────────────────────────────────
//
// A project with several pieces has no obvious front. Opening at the left
// edge every time means scrolling back to what you were doing before you can
// do anything, so the canvas opens on the piece last engaged with.
//
// Engagement is not recorded anywhere: it is read off what the board already
// knows. Every row carries `updated_at`, kept by the database itself, so
// anything that changed a piece — renaming it, moving its card, writing in
// it, adding or rearranging what hangs under it, running a thread through it
// — has already left its mark. The one thing no row remembers is opening a
// piece and changing nothing, which is why the browser's own note of that is
// taken alongside (see `opened.ts`).

/** A piece, and the parts written under it. */
export interface EngagedPiece {
  id: string
  updated_at?: string | null
  children?: EngagedPiece[]
}

/** Something hanging on the board, with the pieces it is connected to. */
export interface EngagedThing {
  updated_at?: string | null
  on: string[]
}

export interface EngagementInput {
  pieces: EngagedPiece[]
  /** Images, recordings, task lists, palettes — and the threads, by the
   *  pieces they run through. */
  things?: EngagedThing[]
  /** Pieces opened in this browser and left unchanged, by id, as epoch ms. */
  opened?: Record<string, number>
}

const at = (iso: string | null | undefined): number => {
  if (!iso) return 0
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : 0
}

/** The latest moment anywhere under this piece, itself included. */
function deepest(piece: EngagedPiece): number {
  let latest = at(piece.updated_at)
  for (const child of piece.children ?? []) latest = Math.max(latest, deepest(child))
  return latest
}

/**
 * When each piece was last engaged with, by id. A piece with no mark at all
 * is absent rather than zero, so a caller can tell "never touched" from
 * "touched at the epoch".
 */
export function engagement(input: EngagementInput): Map<string, number> {
  const out = new Map<string, number>()
  const mark = (id: string, when: number) => {
    if (when <= 0) return
    const had = out.get(id) ?? 0
    if (when > had) out.set(id, when)
  }

  for (const piece of input.pieces) mark(piece.id, deepest(piece))
  // A thing touches every piece it is on: a thread run through three pieces
  // is engagement with all three, because that is what was being worked on.
  for (const thing of input.things ?? []) {
    const when = at(thing.updated_at)
    for (const id of thing.on) mark(id, when)
  }
  const live = new Set(input.pieces.map((p) => p.id))
  for (const [id, when] of Object.entries(input.opened ?? {})) {
    if (live.has(id)) mark(id, when)
  }
  return out
}

/**
 * The piece the canvas opens on: the one last engaged with. With nothing to
 * go on — a project whose pieces have never been touched since they were
 * made — it is the first, which is where reading starts anyway.
 */
export function opensOn(input: EngagementInput): string | null {
  if (input.pieces.length === 0) return null
  const when = engagement(input)
  let best = input.pieces[0]
  let bestAt = when.get(best.id) ?? 0
  for (const piece of input.pieces.slice(1)) {
    const mine = when.get(piece.id) ?? 0
    if (mine > bestAt) { best = piece; bestAt = mine }
  }
  return best.id
}
