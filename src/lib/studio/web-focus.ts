// ── following one thing through the web ─────────────────────────────────────
//
// A canvas with a few pieces and a few threads is readable. One with eight
// pieces and a dozen threads is a net, and the question a person actually has
// in front of it is never "what is on this board" but "what is this one
// connected to".
//
// Resting on something answers that: its own strands light and everything
// else falls back. What counts as "its own" is here, and only here, so the
// lines, the cards and the things hanging under them all agree.

export type WebKind = 'piece' | 'hub' | 'item'

export interface WebFocus {
  kind: WebKind
  id: string
}

/** A thread or a thing on the board, with the pieces it reaches. */
export interface Strand {
  id: string
  on: string[]
}

export interface Web {
  threads: Strand[]
  items: Strand[]
}

export interface Lit {
  pieces: Set<string>
  threads: Set<string>
  items: Set<string>
  /** `${strandId}>${pieceId}` for every line that belongs to this focus. */
  lines: Set<string>
}

/** The name a line goes by, so the drawing and this agree without passing objects. */
export function lineKey(strandId: string, pieceId: string): string {
  return `${strandId}>${pieceId}`
}

const empty = (): Lit => ({ pieces: new Set(), threads: new Set(), items: new Set(), lines: new Set() })

/**
 * Everything lit by resting on one thing.
 *
 * Resting on a piece lights its threads *whole* — not just the strand reaching
 * this card, but every other card the same thread runs through. That is the
 * question being asked: a thread is a thing that runs through several pieces,
 * and where else it goes is the half you cannot see for the tangle. The same
 * holds for anything hanging under the piece that is also on another.
 *
 * Resting on a thread or on something hanging there lights the pieces it
 * reaches, and nothing further: following a piece's other threads from there
 * would light most of the board, which is the state being escaped.
 */
export function litBy(focus: WebFocus | null, web: Web): Lit | null {
  if (!focus) return null
  const lit = empty()

  const reach = (strand: Strand, into: Set<string>) => {
    into.add(strand.id)
    for (const pieceId of strand.on) {
      lit.pieces.add(pieceId)
      lit.lines.add(lineKey(strand.id, pieceId))
    }
  }

  if (focus.kind === 'piece') {
    lit.pieces.add(focus.id)
    for (const thread of web.threads) if (thread.on.includes(focus.id)) reach(thread, lit.threads)
    for (const item of web.items) if (item.on.includes(focus.id)) reach(item, lit.items)
    return lit
  }

  const from = focus.kind === 'hub' ? web.threads : web.items
  const strand = from.find((s) => s.id === focus.id)
  // Something with nothing on it still lights itself, so resting on it says
  // "this reaches nothing" rather than looking like nothing happened.
  if (!strand) {
    (focus.kind === 'hub' ? lit.threads : lit.items).add(focus.id)
    return lit
  }
  reach(strand, focus.kind === 'hub' ? lit.threads : lit.items)
  return lit
}

/** Is this one of the things lit? Nothing lit means everything reads normally. */
export function isLit(lit: Lit | null, kind: WebKind, id: string): boolean {
  if (!lit) return true
  if (kind === 'piece') return lit.pieces.has(id)
  if (kind === 'hub') return lit.threads.has(id)
  return lit.items.has(id)
}
