// ── the walk round an example, the first time one is opened ─────────────────
//
// An example's canvas can be busy — the Aldermoor one has five pieces, three
// threads and six things hung under them — and busy reads as complicated. The
// tour takes it apart once, in under a minute: what each kind of thing is for,
// not how to work it (the app is simple, and anyone can find the buttons).
//
// The words are short and follow what the person said they make (writing,
// songs, film, client work, creative direction), never the themes they gave:
// those are for the Idea Lab, and are nobody's business here. Nothing in it
// says what to do with a button, with one exception — that resting on a card
// (or holding it, on a phone) lights its threads — because that cannot be
// seen until it is done.
//
// Pure: given the example as the board has it and who is looking, which steps,
// pointing at what, saying what. The overlay that plays it is
// components/studio/work/example-tour.tsx.

import type { WebFocus } from '@/lib/studio/web-focus'
import type { Practice } from '@/lib/tour'

/** How a practice talks about its own work. */
export interface Voice {
  /** One piece, said the way that practice would. */
  piece: string
  /** The whole thing the pieces make. */
  whole: string
  /** Whoever the work is for. */
  audience: string
  /** What a practice keeps beside the words. */
  keep: string
}

export const VOICES: Record<Practice, Voice> = {
  writer: { piece: 'a chapter, an essay', whole: 'a book', audience: 'a reader', keep: 'A photograph. A line you overheard.' },
  songwriter: { piece: 'a song', whole: 'an album', audience: 'a listener', keep: 'A voice memo. The chords you hummed.' },
  cinematographer: { piece: 'a scene', whole: 'a film', audience: 'an audience', keep: 'A frame grab. A light reference.' },
  creator: { piece: 'an episode', whole: 'a series', audience: 'your audience', keep: 'A reference clip. A colour grade.' },
  client: { piece: 'a deliverable', whole: 'a client project', audience: 'the client', keep: 'A palette. A first sketch.' },
  director: { piece: 'a film, a poster, a print run', whole: 'a campaign', audience: 'the people it is for', keep: 'A mood frame. A palette.' },
}

/**
 * The practices each example stands for, by its key — the same as each
 * example's own `practices` (a test holds them together), kept here so the
 * browser need not load every example's words to know it.
 */
export const EXAMPLE_PRACTICES: Record<string, readonly Practice[]> = {
  writer: ['writer'],
  songwriter: ['songwriter'],
  series: ['creator', 'cinematographer'],
  studio: ['client'],
  director: ['director'],
}

/** For someone who named no practice. */
export const ANY_VOICE: Voice = { piece: 'one piece of the work', whole: 'one project', audience: 'whoever it is for', keep: 'An image. A recording. A palette.' }

/**
 * The practice to speak to: one they named that this example belongs to, so
 * a songwriter opening the album hears about songs, or else the first they
 * named, so a writer opening the campaign still hears about chapters.
 */
export function voiceFor(practices: readonly string[], exampleFor: readonly string[]): Voice {
  const named = practices.filter((p): p is Practice => p in VOICES)
  const here = named.find((p) => exampleFor.includes(p))
  const pick = here ?? named[0]
  return pick ? VOICES[pick] : ANY_VOICE
}

export interface TourPiece { id: string }
export interface TourThread { id: string; name: string; on: string[] }
export interface TourItem { id: string; kind: 'image' | 'recording' | 'tasks' | 'palette'; on: string[] }

export interface TourInput {
  pieces: TourPiece[]
  threads: TourThread[]
  items: TourItem[]
  practices: readonly string[]
  /** The practices the example itself stands for. */
  exampleFor: readonly string[]
  /** Holding, rather than resting, is how a phone asks what something is tied to. */
  phone: boolean
}

/** Something on the window the tour points at that is not on the canvas. */
export type TourAnchor = 'launcher' | 'vision-page' | 'vision-talk'

export interface TourStep {
  key: string
  headline: string
  lines: string[]
  /** Brought into view and lit round: canvas ids, the whole board, or a part of the window. */
  show: { ids: string[] | 'all' } | { anchor: TourAnchor }
  /** A web lit while the step stands. */
  light?: WebFocus
  /** What happens to the vision room as the step begins. */
  room?: 'open' | 'page' | 'talk' | 'close'
  /** Shown being done, on the first thing in view. */
  gesture?: 'hold' | 'rest'
  /** How long it stands once it has arrived, for reading. */
  ms: number
}

/** Long enough to read twice at a calm pace, never so long it drags. */
export function readingTime(headline: string, lines: string[]): number {
  const words = [headline, ...lines].join(' ').split(/\s+/).filter(Boolean).length
  return Math.round(Math.min(5600, Math.max(2600, 1000 + words * 210)))
}

const step = (s: Omit<TourStep, 'ms'>): TourStep => ({ ...s, ms: readingTime(s.headline, s.lines) })

const count = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']
const say = (n: number) => count[n] ?? String(n)

export function tourSteps(input: TourInput): TourStep[] {
  const v = voiceFor(input.practices, input.exampleFor)
  const total = input.pieces.length
  const steps: TourStep[] = []

  steps.push(step({
    key: 'arrive',
    headline: 'One whole project, in one view.',
    lines: [`Yours might be ${v.whole}.`],
    show: { ids: 'all' },
  }))

  // The piece most threads run through: the one where the most is going on.
  const busiest = [...input.pieces].sort((a, b) =>
    input.threads.filter((t) => t.on.includes(b.id)).length - input.threads.filter((t) => t.on.includes(a.id)).length)[0]
  if (busiest) {
    steps.push(step({
      key: 'piece',
      headline: 'Every card is one piece.',
      lines: [`For you, ${v.piece}.`, 'Each knows what it’s for, so none drifts.'],
      show: { ids: [busiest.id] },
    }))
  }

  // A thread that runs through more than one piece and fewer than all: the
  // gaps are what make it a thread, and what the step is about.
  const thread = [...input.threads]
    .filter((t) => t.on.length >= 2 && t.on.length < total)
    .sort((a, b) => b.on.length - a.on.length)[0]
    ?? input.threads.find((t) => t.on.length > 0)
  if (thread) {
    steps.push(step({
      key: 'thread',
      headline: 'Threads run through some pieces, not all.',
      lines: [
        `“${thread.name}” touches ${say(thread.on.length)} of ${say(total)}.`,
        `See what carries across ${v.whole} before ${v.audience} does.`,
        input.phone ? 'Hold a card to light its threads.' : 'Rest on a card to light its threads.',
      ],
      show: { ids: [thread.id, ...thread.on] },
      light: { kind: 'hub', id: thread.id },
      gesture: input.phone ? 'hold' : 'rest',
    }))
  }

  // What the words cannot hold: pictures, sound, colour. Up to three, so the
  // step frames a handful and not the whole board again.
  const kept = input.items.filter((i) => i.kind !== 'tasks')
  const pick = [
    kept.find((i) => i.kind === 'image'),
    kept.find((i) => i.kind === 'recording'),
    kept.find((i) => i.kind === 'palette'),
  ].filter((i): i is TourItem => !!i)
  const shown = (pick.length ? pick : kept).slice(0, 3)
  if (shown.length) {
    steps.push(step({
      key: 'keep',
      headline: 'Keep what words can’t hold.',
      lines: [v.keep, 'Next to the work, not lost in another app.'],
      show: { ids: shown.map((i) => i.id) },
    }))
  }

  steps.push(step({
    key: 'room-door',
    headline: 'One more room.',
    lines: ['Where the whole project gets talked through.'],
    show: { anchor: 'launcher' },
  }))
  steps.push(step({
    key: 'room-page',
    headline: 'It reads every word on the canvas.',
    lines: ['Never your drafts.', 'Ask it what doesn’t hold together yet.'],
    show: { anchor: 'vision-page' },
    room: 'open',
  }))
  steps.push(step({
    key: 'room-talk',
    headline: 'Then talk it through.',
    lines: ['What you settle on here is kept with the work.'],
    show: { anchor: 'vision-talk' },
    room: 'talk',
  }))

  steps.push(step({
    key: 'end',
    headline: 'Yours to wander.',
    lines: ['Move anything. Nothing here is saved.', 'Start your own when you’re ready.'],
    show: { ids: 'all' },
    room: 'close',
  }))

  return steps
}

/** The whole tour, for a sense of its length. */
export function tourLength(steps: TourStep[]): number {
  return steps.reduce((sum, s) => sum + s.ms, 0)
}
