// The tour's slides: one part of the app each, with a plain headline, when to
// use it, and a small working copy of the real screen. The landing page shows
// four of them (see landing.tsx, Inside). After sign-up there is no feature
// tour: each part of the app shows itself round the first time it is opened.

import type { Hue } from '@/lib/design-tokens'
import { BoardWidget, CaptureWidget, CheckInWidget, ConceptualiseWidget, PortraitWidget, SummonWidget, WritingWidget, type TourWidgetProps } from './widgets'

export type SlideId = 'idea' | 'conceptualise' | 'board' | 'writing' | 'checkin' | 'portrait' | 'capture'
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
