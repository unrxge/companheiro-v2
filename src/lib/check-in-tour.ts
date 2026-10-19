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
  feeling: 'Couldn’t sleep again. The presentation went fine, but I keep replaying the one question I fumbled.',
  reply: 'It went fine, and the one moment that didn’t is the one you’re carrying to bed. What did you wish you’d said?',
  aside: 'A thought for my project, The Orange Hours: open episode two on the ferry ramp at first light, not the market.',
  note: { text: 'Open episode two on the ferry ramp at first light, not the market.', kind: 'thought' as NoteKind },
  project: { id: 'demo-orange-hours', title: 'The Orange Hours' },
}

/** The spoken example's timing: the tap, each word, and a moment to settle. */
export const SPOKEN = { tapMs: 1100, wordMs: 230, settleMs: 900 }
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
  2: { label: 'Example 2 of 2', title: 'A thought on the go, for a project' },
} as const

/** What a stage puts on screen. */
export function demoShows(stage: DemoStage | null): {
  scene: 1 | 2 | null
  feeling: boolean
  reply: boolean
  typing: string | null
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
      key: 'feeling', stage: 'feeling', show: { anchor: ['checkin-scene', 'checkin-thread'] },
      headline: 'First, checking in: just how you are.',
      lines: ['A hard night, a good day, something you keep turning over.'],
    }),
    step({
      key: 'reply', stage: 'reply', show: { anchor: ['checkin-scene', 'checkin-thread'] },
      headline: 'It is reflected back, then one question.',
      lines: ['Not advice. Something to see your own words by, if you want to keep going.'],
    }),
    step({
      key: 'aside', stage: 'aside', show: { anchor: ['checkin-scene', 'checkin-start'] },
      headline: 'Second, a thought for one of your projects.',
      lines: ['Tap the mic and say it: an idea for a project, or something not to forget.', 'Name the project it is for. Here, a documentary series called The Orange Hours.'],
    }),
    step({
      key: 'understood', stage: 'understood', show: { anchor: ['checkin-scene', 'checkin-note'] },
      headline: 'You see what it understood first.',
      lines: ['The words, the project, a thought or a reminder. Change any of it, or say it was a check-in.'],
    }),
    step({
      key: 'added', stage: 'added', show: { anchor: ['checkin-scene', 'checkin-added'] },
      headline: 'It waits on that project’s canvas.',
      lines: ['Like a note on the wall, there the next time you open it.'],
    }),
    step({
      key: 'end', stage: 'end', show: { anchor: 'checkin-start' },
      headline: 'Whenever you are ready.',
      lines: ['It works out which one you mean. You never have to choose.'],
    }),
  ]
  // The second example is said out loud on screen, word by word: Next waits
  // until it has been heard out. The other steps play short page animations
  // (a card arriving), which the words outlast anyway.
  return steps.map((s) => (s.key === 'aside' ? { ...s, ms: s.ms + SPOKEN_MS, wait: SPOKEN_MS + 600 } : s))
}
