// ── the walks round Home, the Idea Lab's summoning, and the Portrait ────────
//
// Each plays once, the first time its page is opened, through the same overlay
// as the examples' and the check-in's walks
// (components/studio/work/example-tour.tsx): a lit window travels over the real
// page and the words say what each part is for, never how to press it.
//
// The Idea Lab's walk covers only "Summon an idea": the other two ways in say
// what they are on their own. The Portrait's shows where a pattern comes from
// (the check-ins) with an invented example played on the page, because a new
// account has none of its own yet.
//
// Pure: the steps, and what the Portrait's example shows at each stage.

import { readingTime, type TourStep } from '@/lib/examples/tour-script'

const step = (s: Omit<TourStep, 'ms'>): TourStep => ({ ...s, ms: readingTime(s.headline, s.lines) })

export function homeTourSteps(): TourStep[] {
  return [
    step({
      key: 'home', show: { anchor: 'home-greeting' },
      headline: 'This is home.',
      lines: ['Where a day with the work starts. Everything here leads somewhere.'],
    }),
    step({
      key: 'progress', show: { anchor: 'home-progress' },
      headline: 'What you are making right now.',
      lines: ['Each project in motion, one tap from where you left the writing.', 'New idea opens the Idea Lab; the board holds the rest.'],
    }),
    step({
      key: 'ideas', show: { anchor: 'home-ideas' },
      headline: 'How your projects are spread.',
      lines: ['Waiting, in motion, finished. When the first bar outgrows the others, finish something before you start the next.'],
    }),
    step({
      key: 'weather', show: { anchor: 'home-weather' },
      headline: 'Your last thirty days.',
      lines: ['One bar a day: its height is your energy, its colour the movement you were in.', 'It fills as you check in and write.'],
    }),
    step({
      key: 'capture', show: { anchor: 'home-capture' },
      headline: 'Keep what moves you, the moment it does.',
      lines: ['Someone else’s post, video or article stopped you? Paste the link and say what caught your eye.'],
    }),
    step({
      key: 'bank', show: { anchor: 'home-captures' },
      headline: 'It all goes to your capture bank.',
      lines: ['The latest show here. The rest wait in the Idea Lab, for a day you need a spark.'],
    }),
  ]
}

/** What the Idea Lab's walk acts out on the lens as each step stands. */
export type LabDemo = 'energy' | 'mode' | null

export function ideaLabTourSteps(): TourStep[] {
  return [
    step({
      key: 'lens', show: { anchor: 'lab-lens' },
      headline: 'Set a lens, and a question comes through it.',
      lines: ['For a day you sit down with no idea. Three settings, then one question to make from.'],
    }),
    step({
      key: 'movement', show: { anchor: 'lab-movement' },
      headline: 'Movement: where you are in your life.',
      lines: [
        'Breakaway, stepping away from what no longer fits. Beginning, something new. Expansion, growing into it. Integration, bringing it together.',
        'The question meets you there. Random or Skip if you’d rather not say.',
      ],
    }),
    step({
      key: 'territory', show: { anchor: 'lab-territory' },
      headline: 'Territory: the themes you work from.',
      lines: ['The ones you named when you joined. Choose one or several, or add your own.'],
    }),
    step({
      key: 'energy', stage: 'energy', show: { anchor: 'lab-energy' }, wait: 4200,
      headline: 'Energy: how much you have today.',
      lines: ['Toward Heavy, the question goes honestly into harder ground. Toward Bright, it reaches for what is alive and possible.'],
    }),
    step({
      key: 'mode', stage: 'mode', show: { anchor: 'lab-mode' }, wait: 3000,
      headline: 'Open or charged.',
      lines: ['Open asks about the world, wide, with no single right answer.', 'Charged asks about your own life: only you can answer it.'],
    }),
    step({
      key: 'ask', show: { anchor: 'lab-stage' },
      headline: 'Then summon it.',
      lines: ['Not the one? Ask again until one lands. Write your answer, and it becomes the start of a project.'],
    }),
  ]
}

// ── the Portrait's example ──────────────────────────────────────────────────

export type PortraitDemo = 'checkin' | 'noticed' | 'counted' | 'kinds' | 'forget' | 'end'

export const PORTRAIT_DEMO = {
  /** A check-in, in invented words, with the part a pattern was noticed in. */
  checkIn: {
    day: 'Tuesday',
    before: 'I said I’d finish the edit this week. Then ',
    caught: 'I started something new instead',
    after: ', and somehow that felt like progress.',
  },
  /** One pattern per kind, said the way someone who knows you would say it. */
  entries: [
    { id: 'demo-develop', kind: 'creative_pattern' as const, statement: 'When a piece gets close to done, you start a new one and call it momentum.', count: 7, checkIns: 4 },
    { id: 'demo-process', kind: 'processing_pattern' as const, statement: 'You say “I’m fine, just tired” first. The real thing comes out three sentences later.', count: 9, checkIns: 6 },
    { id: 'demo-recurring', kind: 'recurring_theme' as const, statement: 'Whatever you start talking about, you end up asking whether you’re allowed to want this.', count: 6, checkIns: 5 },
    { id: 'demo-guidance', kind: 'guidance_note' as const, statement: 'Advice makes you defend yourself. A good question makes you think.', count: 5, checkIns: 3 },
  ],
} as const

/** What a stage of the Portrait's walk puts on screen. */
export function portraitShows(stage: PortraitDemo | null): { checkIn: boolean; entries: 'none' | 'first-once' | 'first' | 'all'; caught: boolean } {
  switch (stage) {
    case 'checkin': return { checkIn: true, entries: 'none', caught: false }
    case 'noticed': return { checkIn: true, entries: 'first-once', caught: true }
    case 'counted': return { checkIn: true, entries: 'first', caught: true }
    case 'kinds': case 'forget': case 'end': return { checkIn: false, entries: 'all', caught: false }
    default: return { checkIn: false, entries: 'none', caught: false }
  }
}

export function portraitTourSteps(): TourStep[] {
  return [
    step({
      key: 'checkin', stage: 'checkin', show: { anchor: 'portrait-checkin' },
      headline: 'It starts in your check-ins.',
      lines: ['When you talk, the companion listens for what you keep doing, not only what you say.'],
    }),
    step({
      key: 'noticed', stage: 'noticed', show: { anchor: ['portrait-checkin', 'portrait-entry'] }, wait: 1600,
      headline: 'Something it notices becomes a line here.',
      lines: ['Said plainly, the way a friend who knows you would say it.'],
    }),
    step({
      key: 'counted', stage: 'counted', show: { anchor: 'portrait-entry' }, wait: 1400,
      headline: 'Each time it comes up again, it is counted.',
      lines: ['Seven times, across four check-ins: a pattern, not a bad week.'],
    }),
    step({
      key: 'kinds', stage: 'kinds', show: { anchor: 'portrait-list' },
      headline: 'Four kinds of pattern.',
      lines: ['How you process things, what keeps coming back, how you develop ideas, and what kind of help actually helps you.'],
    }),
    step({
      key: 'forget', stage: 'forget', show: { anchor: 'portrait-forget' },
      headline: 'Not you? Forget it.',
      lines: ['A line that is not true goes the moment you say so. One that stops coming up fades on its own.'],
    }),
    step({
      key: 'end', stage: 'end', show: { anchor: 'portrait-intro' },
      headline: 'Yours starts empty.',
      lines: ['It fills as you check in. It changes how the companion meets you, never its voice.'],
    }),
  ]
}
