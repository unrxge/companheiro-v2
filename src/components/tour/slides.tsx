// The tour's slides: one part of the app each, with a plain headline, when to
// use it, and a small working copy of the real screen. After sign-up the tour
// shows the four that fit what the person said their practice is (slidesFor)
// and names the rest; the landing page shows four (see landing.tsx, Inside).

import type { Hue } from '@/lib/design-tokens'
import type { Practice } from '@/lib/tour'
import { CanvasMockup, RuleHeardMockup } from '@/components/landing/mockups'
import { BoardWidget, CaptureWidget, CheckInWidget, ConceptualiseWidget, PortraitWidget, SummonWidget, WritingWidget, type TourWidgetProps } from './widgets'

export type SlideId = 'idea' | 'conceptualise' | 'board' | 'canvas' | 'rules' | 'writing' | 'checkin' | 'portrait' | 'capture'
export interface TourSlide {
  id: SlideId
  where: string
  title: string
  body: string
  /** One line, for where the tour only names this part. */
  short: string
  mood: Hue
  Widget: (p: TourWidgetProps) => React.ReactNode
}

export const SLIDES: TourSlide[] = [
  {
    id: 'idea',
    where: 'Idea',
    short: 'A question to make from, drawn from your own themes.',
    title: 'Systemise your creativity.',
    body: 'No need to wait for the creative muse to “drop down from the heavens” any more. Pick a theme you care about, and the ‘Idea Lab’ gives you a question worth making something from, every time you sit down.',
    mood: 'violet',
    Widget: SummonWidget,
  },
  {
    id: 'conceptualise',
    where: 'Conceptualise',
    short: 'Questions that turn a rough idea into a clear concept.',
    title: 'Turn a rough idea into a clear one.',
    body: 'Find the voice of your idea outside of the fog of the abstract. ‘Conceptualise’ helps you define the outline of what you want to express, one question at a time – until you can declare your concept in one clear sentence.',
    mood: 'verdant',
    Widget: ConceptualiseWidget,
  },
  {
    id: 'board',
    where: 'Project Board',
    short: 'Everything you’re making: waiting, active, finished.',
    title: 'Keep track of everything you’re making.',
    body: 'Every idea becomes a project. The board is there to help you finish more of them: you always see what you’re working on now, what’s waiting its turn, and how much you’ve already brought to the end.',
    mood: 'tide',
    Widget: BoardWidget,
  },
  {
    id: 'writing',
    where: 'Writing',
    short: 'Select any part of a piece and talk it over.',
    title: 'Stuck on a line? Talk it over.',
    body: 'Select any part of your piece to talk about it. Companheiro asks questions and reflects things back until you can see what you meant. The writing is always yours.',
    mood: 'violet',
    Widget: WritingWidget,
  },
  {
    id: 'checkin',
    where: 'Check-in',
    short: 'Talk through what’s on your mind, by voice or typing.',
    title: 'Talk through what’s on your mind.',
    body: 'Check-in whenever something is on your mind, about your work or your day. Speak or type, press Send, and Companheiro answers you.',
    mood: 'tide',
    Widget: CheckInWidget,
  },
  {
    id: 'portrait',
    where: 'Portrait',
    short: 'Your own patterns, as they show up in your work.',
    title: 'Discover your own patterns.',
    body: 'The more you use the app, the more of your own patterns you get to see: what keeps returning in your work, how you think things through, what actually helps you. ‘Portrait’ shows them to you, and you can remove any that aren’t true.',
    mood: 'verdant',
    Widget: PortraitWidget,
  },
  {
    id: 'capture',
    where: 'Capture',
    short: 'Save other people’s work that moved you.',
    title: 'Save work that inspires you.',
    body: 'Moved by someone else’s video, post or article? Paste its link from Instagram, YouTube or anywhere, and note what caught your eye.',
    mood: 'tide',
    Widget: CaptureWidget,
  },
]

// Parts of the app the landing page shows in its own sections, and the tour
// shows to the people they are for.
const MORE: TourSlide[] = [
  {
    id: 'canvas',
    where: 'Canvas',
    short: 'A project’s pieces, references, recordings and tasks, side by side.',
    title: 'Lay the whole project out.',
    body: 'Open a project and everything it needs sits on one canvas: the pieces, a reference image, a voice note, the tasks. Threads show what connects, so you can see the shape of the work at a glance.',
    mood: 'verdant',
    Widget: ({ active }) => <CanvasMockup compact active={active} />,
  },
  {
    id: 'rules',
    where: 'Vision',
    short: 'Say a rule once while you talk a project through, and it’s kept.',
    title: 'Say a rule once. It keeps it for you.',
    body: 'Mention a line you won’t cross while you talk the work through, and it asks whether to keep it. Kept rules come back as a question when new work runs against them, and never become rules without you.',
    mood: 'violet',
    Widget: () => <RuleHeardMockup />,
  },
]

const ALL: TourSlide[] = [...SLIDES, ...MORE]
/** The order the parts are met in when making something. */
const FLOW: SlideId[] = ['idea', 'conceptualise', 'board', 'canvas', 'rules', 'writing', 'checkin', 'portrait', 'capture']
const SHOWN = 4

// What matters most to each kind of practice, first to fourth (also read by copy.ts,
// to decide whose words a slide is said in). Someone who
// picks several gets the parts their choices agree on.
export const RANK: Record<Practice | 'none', SlideId[]> = {
  writer: ['conceptualise', 'writing', 'idea', 'portrait'],
  songwriter: ['idea', 'writing', 'canvas', 'conceptualise'],
  cinematographer: ['canvas', 'conceptualise', 'rules', 'board'],
  creator: ['idea', 'capture', 'writing', 'board'],
  client: ['board', 'rules', 'canvas', 'conceptualise'],
  director: ['rules', 'canvas', 'board', 'conceptualise'],
  none: ['conceptualise', 'board', 'writing', 'idea'],
}

/** The four parts to show someone with these practices, and the rest to name. Both in the order they are met. */
export function slidesFor(practices: Practice[]): { shown: TourSlide[]; rest: TourSlide[] } {
  const score = new Map<SlideId, number>()
  for (const p of practices.length ? practices : (['none'] as const)) {
    RANK[p].forEach((id, i) => score.set(id, (score.get(id) ?? 0) + RANK[p].length - i))
  }
  const byFlow = (a: SlideId, b: SlideId) => FLOW.indexOf(a) - FLOW.indexOf(b)
  const picked = [...score.keys()].sort((a, b) => score.get(b)! - score.get(a)! || byFlow(a, b)).slice(0, SHOWN)
  const of = (ids: SlideId[]) => ids.sort(byFlow).map((id) => ALL.find((s) => s.id === id)!)
  return { shown: of(picked), rest: of(FLOW.filter((id) => !picked.includes(id))) }
}
