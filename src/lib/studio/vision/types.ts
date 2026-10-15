// The room where one project's vision is talked through: the shapes both
// sides share. No React and no database, so the page arithmetic is tested on
// its own.
//
// Everything here belongs to ONE project. Nothing from another project is
// ever read into it: the room is about the project it was opened from.

/** Something settled in talk, or something named as still open. Their words. */
export interface KeptLine {
  id: string
  kind: 'decision' | 'open'
  /** The piece it is about, or null for the whole project. A kept open
   *  question about a piece does not stay here: it becomes one of that
   *  piece's open threads, in its core concept. */
  node_id: string | null
  /** The line as it is kept: theirs, after any rewording. */
  text: string
  /** The reason they gave, when they gave one. Never supplied for them. */
  why: string
  /** What they actually said, word for word. */
  quote: string
  /** When it was said. */
  at: string
  /** Heard and waiting for their answer, or kept. */
  state: 'pending' | 'kept'
}

/** A place where two things written on the canvas pull against each other, or nothing answers a stated purpose. */
export interface Gap {
  id: string
  text: string
  /** The pieces, threads or rules it points at, by the names on the canvas. */
  where: string[]
}

/** The companion's reading of the canvas, made when asked for and dated. */
export interface Reading {
  at: string
  /** The vision as it stands, in a few sentences built from their words. Empty when the canvas says too little. */
  statement: string
  gaps: Gap[]
  /** What the canvas said when this was read (canvasSignature), so a change shows. */
  signature: string
}

// ── the core concept, mirrored ─────────────────────────────────────────────
// A piece's core concept lives on its root node and nowhere else. The vision
// room and the concept on the writing page both read and change those same
// fields, so a change made in one is already there in the other.

/** The parts of a piece's core concept that can be rewritten after it was locked. */
export type ConceptField = 'core_truth' | 'intent' | 'emotional_journey'

export const CONCEPT_FIELDS: Array<{ key: ConceptField; label: string }> = [
  { key: 'core_truth', label: 'Core truth' },
  { key: 'intent', label: 'Conviction' },
  { key: 'emotional_journey', label: 'Emotional journey' },
]

export const isConceptField = (v: unknown): v is ConceptField => CONCEPT_FIELDS.some((f) => f.key === v)
export const conceptLabel = (f: ConceptField) => CONCEPT_FIELDS.find((x) => x.key === f)?.label ?? f

/** A change made to a piece's core concept after it was locked, kept with its date. */
export interface ConceptChange {
  id: string
  node_id: string
  /** An open thread added or answered counts too. */
  field: ConceptField | 'open_threads'
  from: string
  to: string
  at: string
  /** Where it was made: in talk (offered and accepted), on the vision page, or in the concept itself. */
  source: 'talk' | 'room' | 'concept'
}

/** What an offered change can rewrite: one part, or the whole list of open threads. */
export type OfferedField = ConceptField | 'open_threads'
export const offeredLabel = (f: OfferedField) => (f === 'open_threads' ? 'Open threads' : conceptLabel(f))

/** A change to the core concept heard in talk, waiting for their answer. */
export interface PendingChange {
  id: string
  node_id: string
  field: OfferedField
  /** The field as it would read after the change. Open threads: one per line. */
  to: string
  /** What in the conversation moved it, in a sentence; '' when heard in one message. */
  reason?: string
  /** What they said, word for word. */
  quote: string
  at: string
}

/** What a project keeps about its vision (studio_projects.settings.vision). */
export interface VisionState {
  kept: KeptLine[]
  /** Lines they said no to, normalised, so they are never offered again. */
  declined: string[]
  reading: Reading | null
  /** Gaps they said were not gaps, normalised, so a new reading leaves them alone. */
  gaps_dismissed: string[]
  /** Changes to the core concept made since it was locked, newest last. */
  changes: ConceptChange[]
  /** Changes to the core concept heard in talk and not yet answered. */
  pending_changes: PendingChange[]
}

export const EMPTY_VISION: VisionState = { kept: [], declined: [], reading: null, gaps_dismissed: [], changes: [], pending_changes: [] }

/** What a change to the page or the concept answers with: everything that moved. */
export interface VisionUpdate {
  kept?: KeptLine[]
  changes?: ConceptChange[]
  pending_changes?: PendingChange[]
  /** A piece's core concept changed, so the pieces on screen should be read again. */
  thread_added?: boolean
  node?: { id: string } | null
}

/** One conversation in the vision room (migration 035). */
export interface VisionConversation {
  id: string
  /** Written once it has some substance; '' before. */
  title: string
  summary: string
  created_at: string
  updated_at: string
  messages: number
}

/** A page the companion looked something up on, shown under what it said. */
export interface Source { url: string; title: string }

/** The ways of looking at the vision that can be pulled on purpose. */
export type Lens = 'audience' | 'reach' | 'field' | 'client' | 'weakest'

/** What pressing each one says, in the person's voice, and what the button reads. */
export const LENSES: Array<{ key: Lens; label: string; says: string }> = [
  { key: 'audience', label: 'Who it is for', says: 'Who exactly is this for?' },
  { key: 'reach', label: 'How it reaches them', says: 'How does this reach them?' },
  { key: 'field', label: 'The field right now', says: 'What is happening in the field around this right now?' },
  { key: 'client', label: 'The brief against the vision', says: 'Hold what was asked for against the vision as it stands.' },
  { key: 'weakest', label: 'Say what is weakest', says: 'Say what is weakest in this.' },
]

export const isLens = (v: unknown): v is Lens => LENSES.some((l) => l.key === v)

export interface VisionMessage {
  id: string
  role: 'person' | 'companion'
  text: string
  sources: Source[]
  created_at: string
}

/** GET /api/studio/projects/:id/vision */
export interface VisionPayload {
  messages: VisionMessage[]
  /** The conversation these messages belong to; null for a new one, or before migration 035. */
  conversation_id: string | null
  /** Past conversations can be listed and returned to (migration 035 applied). */
  conversations: boolean
  kept: KeptLine[]
  changes: ConceptChange[]
  pending_changes: PendingChange[]
  reading: Reading | null
  /** The canvas has changed since the reading was made. */
  stale: boolean
  /** What the room does not look at, said plainly on the page. */
  unread: { images: number; recordings: number }
}

// Sources travel inside the stored message, after the words, so a reply read
// back later still shows where it looked. One line each: title, tab, address.
const SOURCES_OPEN = '\n\n<sources>\n'
const SOURCES_CLOSE = '\n</sources>'

export function withSources(text: string, sources: Source[]): string {
  if (sources.length === 0) return text
  const lines = sources.map((s) => `${s.title.replace(/[\t\n]+/g, ' ')}\t${s.url}`)
  return `${text}${SOURCES_OPEN}${lines.join('\n')}${SOURCES_CLOSE}`
}

export function splitSources(stored: string): { text: string; sources: Source[] } {
  const at = stored.lastIndexOf(SOURCES_OPEN)
  if (at < 0 || !stored.endsWith(SOURCES_CLOSE)) return { text: stored, sources: [] }
  const sources = stored
    .slice(at + SOURCES_OPEN.length, -SOURCES_CLOSE.length)
    .split('\n')
    .map((line) => {
      const [title, url] = line.split('\t')
      return { title: title ?? '', url: url ?? '' }
    })
    .filter((s) => /^https?:\/\//.test(s.url))
  return { text: stored.slice(0, at), sources }
}

/** Only web addresses, one per page, in the order they were cited. */
export function cleanSources(raw: Array<{ url?: string | null; title?: string | null }>, max = 8): Source[] {
  const seen = new Set<string>()
  const out: Source[] = []
  for (const r of raw) {
    const url = (r.url ?? '').trim()
    if (!/^https?:\/\//.test(url) || seen.has(url)) continue
    seen.add(url)
    out.push({ url, title: (r.title ?? '').trim() || hostOf(url) })
    if (out.length >= max) break
  }
  return out
}

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}
