// ── the walk round the check-in, the first time it is opened ────────────────
//
// The check-in does two things in one place, and the second one cannot be
// seen until it is done: say how you are and hear it reflected back, or leave
// a thought or a reminder on a project on the go. So the walk plays one of
// each on the page itself, an example conversation set out step by step and
// nothing sent anywhere, the way the examples' walk plays a canvas.
//
// Pure: the steps, the example words, and which of them a stage shows. The
// overlay that plays it is components/studio/work/example-tour.tsx; the page
// draws whatever `stage` asks for.

import { readingTime, type TourStep } from '@/lib/examples/tour-script'
import type { NoteKind } from '@/lib/studio/board-items'


/** One reflective exchange and one note, in invented words. */
export const DEMO = {
  feeling: 'I was at a dinner with eight people, laughing in all the right places, and I have never felt so alone at a table.',
  reply: 'Surrounded, and still on the outside of it. What did you want someone at that table to notice?',
  aside: 'Add a reminder to my project “Orange Hours”: the deadline has been ramped to two weeks from now and Rita still needs to be looped in on the venue change.',
  note: { text: 'Loop Rita in on the venue change: the deadline has been ramped to two weeks from now.', kind: 'reminder' as NoteKind },
  project: { id: 'demo-orange-hours', title: 'The Orange Hours' },
}

/** The spoken example's timing: the tap, each word, and a moment to settle. */
export const SPOKEN = { tapMs: 1100, wordMs: 230, settleMs: 900 }
/** The first example is typed, a letter at a time, then sent; the reply then arrives a word at a time. */
export const TYPED = { leadMs: 600, charMs: 26, sendMs: 650 }
export const TYPED_MS = TYPED.leadMs + DEMO_FEELING_LEN() * TYPED.charMs + TYPED.sendMs
export const REPLY = { thinkMs: 1100, wordMs: 75 }
export const REPLY_MS = REPLY.thinkMs + DEMO_REPLY_WORDS() * REPLY.wordMs
function DEMO_FEELING_LEN() { return DEMO.feeling.length }
function DEMO_REPLY_WORDS() { return DEMO.reply.split(' ').length }
/** How long the spoken example takes to say. */
export const SPOKEN_MS = SPOKEN.tapMs + 300 + DEMO.aside.split(' ').length * SPOKEN.wordMs + SPOKEN.settleMs

export type DemoStage = 'start' | 'feeling' | 'reply' | 'aside' | 'understood' | 'added' | 'end'

/**
 * The two examples are two separate moments, not one conversation: the first
 * (checking in) clears away completely before the second (a thought on the
 * go) begins, and each is labelled as which example it is.
 */
export const SCENES = {
  1: { label: 'Example 1 of 2', title: 'Checking in' },
  2: { label: 'Example 2 of 2', title: '' },
} as const

/** What a stage puts on screen. */
export function demoShows(stage: DemoStage | null): {
  scene: 1 | 2 | null
  feeling: boolean
  reply: boolean
  typing: string | null
  /** Being typed into the box, before it has been sent (the first example). */
  typed: string | null
  offer: 'none' | 'offered' | 'added'
} {
  const scene = stage === 'feeling' || stage === 'reply' ? 1
    : stage === 'aside' || stage === 'understood' || stage === 'added' ? 2
    : null
  return {
    scene,
    feeling: scene === 1,
    reply: stage === 'reply',
    // Being said, before it has been sent.
    typing: stage === 'aside' ? DEMO.aside : null,
    typed: stage === 'feeling' ? DEMO.feeling : null,
    offer: stage === 'understood' ? 'offered' : stage === 'added' ? 'added' : 'none',
  }
}

const step = (s: Omit<TourStep, 'ms'>): TourStep => ({ ...s, ms: readingTime(s.headline, s.lines) })

export function checkInTourSteps(): TourStep[] {
  const steps: TourStep[] = [
    // The whole page first, so the example that follows is seen to happen on a page already known.
    step({
      key: 'page', stage: 'start', show: { anchor: 'page' },
      headline: 'This is the check-in.',
      lines: ['A quiet page to say what is on your mind, today or any day.'],
    }),
    step({
      key: 'start', stage: 'start', show: { anchor: 'checkin-start' },
      headline: 'Say whatever is there, out loud or in writing.',
      lines: ['Voice or Type. A sentence is enough.'],
    }),
    step({
      // The window takes in the box as the words are typed into it, and the conversation they become.
      key: 'feeling', stage: 'feeling', show: { anchor: ['checkin-scene', 'checkin-thread', 'checkin-start'] },
      headline: 'First, checking in: just how you are.',
      lines: ['A hard night, a good day, a room full of people and still feeling alone.'],
    }),
    step({
      key: 'reply', stage: 'reply', show: { anchor: ['checkin-scene', 'checkin-thread'] },
      headline: 'It is reflected back, then one question.',
      lines: ['Not advice. Something to see your own words by, if you want to keep going.'],
    }),
    step({
      key: 'aside', stage: 'aside', show: { anchor: ['checkin-scene', 'checkin-start'] }, edge: 'bottom',
      headline: 'The same box takes what you need to remember, too.',
      lines: ['Something comes to you between two other things. Tap the mic and say it, and the project it is for.'],
    }),
    step({
      key: 'understood', stage: 'understood', show: { anchor: ['checkin-scene', 'checkin-note'] }, edge: 'bottom',
      headline: 'You see what it understood first.',
      lines: ['A reminder, for The Orange Hours, in fewer words than you said it. Change any of it before it is added.'],
    }),
    step({
      key: 'added', stage: 'added', show: { anchor: ['checkin-scene', 'checkin-added'] }, edge: 'bottom', bare: true,
      headline: 'It waits on that project’s canvas.',
      lines: ['The new deadline and Rita, like a note on the wall, there the next time you open it.'],
    }),
    step({
      key: 'end', stage: 'end', show: { anchor: 'checkin-window' },
      headline: 'Whenever you are ready.',
      lines: ['It works out which one you mean. You never have to choose.'],
    }),
  ]
  // The second example is said out loud on screen, word by word: Next waits
  // until it has been heard out. The other steps play short page animations
  // (a card arriving), which the words outlast anyway.
  // The first example is typed and sent, and its reply arrives word by word: those wait too.
  const plays: Record<string, number> = { aside: SPOKEN_MS + 600, feeling: TYPED_MS + 500, reply: REPLY_MS + 500 }
  return steps.map((s) => (plays[s.key] ? { ...s, ms: s.ms + plays[s.key], wait: plays[s.key] } : s))
}
