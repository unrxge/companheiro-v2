// The example projects new accounts find on their Project Board: how they are
// written. Each one is authored once, in its own file, in this compact shape,
// and build.ts turns it into the rows the real canvas, writing page and vision
// room read. Nothing here is ever stored in anyone's database.
//
// Dates are written as days before today, so an example always reads as work
// in progress this month, never as something abandoned a year ago.

import type { NodeStatus, ThreadHue } from '@/lib/studio/node-types'
import type { Practice } from '@/lib/tour'

export type ExampleKey = 'songwriter' | 'writer' | 'studio' | 'series' | 'director'

/** A part of a piece: a verse, a section, a scene. */
export interface ExamplePart {
  /** Unique within the example; becomes part of the id. */
  key: string
  title: string
  /** The beat it carries: grounded, restless, tender, expansive, urgent, or a word of its own. */
  beat?: string
  /** What this part has to do. */
  intent?: string
  /** Plain text. A blank line starts a paragraph; a single line break stays a line break (lyrics). */
  body?: string
  status?: NodeStatus
}

/** One piece: a song, an issue, a deliverable, an episode. */
export interface ExamplePiece {
  key: string
  title: string
  status: NodeStatus
  /** The conviction (the piece's `intent`). */
  conviction: string
  /** The core truth. Absent on a piece whose concept is still to be built. */
  truth?: string
  /** "Label — what it holds", one beat per line. */
  journey?: string[]
  /** Open threads the concept was locked with. */
  open?: string[]
  /** How it should be made. */
  ethos?: string
  rules?: string[]
  /** The words, when the piece has no parts. */
  body?: string
  parts?: ExamplePart[]
  tasks?: Array<{ title: string; category: string; done?: boolean }>
  /** Days since it was last worked on, when it should differ from the usual (the canvas opens on the latest). */
  touchedDaysAgo?: number
}

/**
 * Where something sits on the canvas, as a hand would have left it: `x` in
 * piece slots along the lane (0 is the first piece's left edge, 1.5 halfway
 * along the second), `y` in pixels below the row of cards. Left out, the board
 * places it itself.
 */
export interface ExampleSpot { x: number; y: number }

export interface ExampleThread {
  key: string
  at?: ExampleSpot
  name: string
  intent: string
  hue: ThreadHue
  rules?: string[]
  /** Where it runs: a piece or a part, by key, and what it does there. */
  on: Array<{ at: string; note?: string }>
}

/** A file the example shows: an image or a recording, served from public/examples (scripts/make-example-media.py). */
export interface ExampleFile {
  /** The file's name in public/examples. */
  name: string
  mime: string
  bytes: number
  width?: number
  height?: number
  seconds?: number
  /** Loudness in 24 slices, for the little waveform. */
  envelope?: number[]
  /** The person's own voice: its words are kept (the transcript) and read. */
  ownVoice?: boolean
  transcript?: string
}

export interface ExampleItem {
  kind: 'tasks' | 'palette' | 'image' | 'recording'
  /** An image's caption, a recording's name. */
  caption?: string
  file?: ExampleFile
  /** Where it sits. `y: 'beside'` stands it level with the cards, to the left of the first. */
  at?: ExampleSpot | { x: number; y: 'beside' }
  /** The pieces it sits beside, by key. Empty: it stands on its own. */
  pieces: string[]
  tasks?: Array<{ title: string; done?: boolean }>
  swatches?: Array<{ hex: string; name: string }>
}

export interface ExampleKept {
  kind: 'decision' | 'open'
  /** The piece it is about, by key; the whole project when absent. */
  piece?: string
  text: string
  why?: string
  /** What was said, word for word. */
  quote?: string
  daysAgo: number
}

export interface ExampleChange {
  piece: string
  field: 'core_truth' | 'intent' | 'emotional_journey' | 'open_threads'
  from: string
  to: string
  daysAgo: number
  source: 'talk' | 'room' | 'concept'
}

export interface ExampleSource {
  key: ExampleKey
  /** The practices from sign-up (lib/tour.ts) this example is shown for. */
  practices: Practice[]
  /** One or two words for the card on the board: "Songwriter". */
  label: string
  /** Who made it, in a few words, for the banner: "a songwriter halfway through an album". */
  who: string
  /** Anything the banner should add about this example (a generated voice). */
  note?: string
  /** The line under the card on the Project Board. */
  teaser: string
  title: string
  /** What the whole thing is for. */
  intent: string
  /** The Movement it began in. */
  arc: 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration'
  rules: string[]
  startedDaysAgo: number
  /** The Idea Lab conversation it came out of. */
  log: Array<{ role: 'user' | 'assistant'; content: string }>
  pieces: ExamplePiece[]
  threads: ExampleThread[]
  items: ExampleItem[]
  kept: ExampleKept[]
  changes: ExampleChange[]
  reading: { daysAgo: number; statement: string; gaps: Array<{ text: string; where: string[] }> }
  /** One past conversation in the vision room. */
  conversation: {
    title: string
    summary: string
    daysAgo: number
    messages: Array<{ role: 'person' | 'companion'; text: string }>
  }
}
