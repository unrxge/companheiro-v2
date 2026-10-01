// The tour's slides: one part of the app each, with a plain headline, when to
// use it, and a small working copy of the real screen. The tour shows all of
// them after sign-up; the landing page shows four (see landing.tsx, Inside).

import type { Hue } from '@/lib/design-tokens'
import { BoardWidget, CaptureWidget, CheckInWidget, ConceptualiseWidget, PortraitWidget, SummonWidget, WritingWidget, type TourWidgetProps } from './widgets'

export interface TourSlide { where: string; title: string; body: string; mood: Hue; Widget: (p: TourWidgetProps) => React.ReactNode }

export const SLIDES: TourSlide[] = [
  {
    where: 'Idea',
    title: 'Systemise your creativity.',
    body: 'No need to wait for the creative muse to “drop down from the heavens” any more. Pick a theme you care about, and the ‘Idea Lab’ gives you a question worth making something from, every time you sit down.',
    mood: 'violet',
    Widget: SummonWidget,
  },
  {
    where: 'Conceptualise',
    title: 'Turn a rough idea into a clear one.',
    body: 'Find the voice of your idea outside of the fog of the abstract. ‘Conceptualise’ helps you define the outline of what you want to express, one question at a time – until you can declare your concept in one clear sentence.',
    mood: 'verdant',
    Widget: ConceptualiseWidget,
  },
  {
    where: 'Project Board',
    title: 'Keep track of everything you’re making.',
    body: 'Every idea becomes a project. The board is there to help you finish more of them: you always see what you’re working on now, what’s waiting its turn, and how much you’ve already brought to the end.',
    mood: 'tide',
    Widget: BoardWidget,
  },
  {
    where: 'Writing',
    title: 'Stuck on a line? Talk it over.',
    body: 'Select any part of your piece to talk about it. Companheiro asks questions and reflects things back until you can see what you meant. The writing is always yours.',
    mood: 'violet',
    Widget: WritingWidget,
  },
  {
    where: 'Check-in',
    title: 'Talk through what’s on your mind.',
    body: 'Check-in whenever something is on your mind, about your work or your day. Speak or type, press Send, and Companheiro answers you.',
    mood: 'tide',
    Widget: CheckInWidget,
  },
  {
    where: 'Portrait',
    title: 'Discover your own patterns.',
    body: 'The more you use the app, the more of your own patterns you get to see: what keeps returning in your work, how you think things through, what actually helps you. ‘Portrait’ shows them to you, and you can remove any that aren’t true.',
    mood: 'verdant',
    Widget: PortraitWidget,
  },
  {
    where: 'Capture',
    title: 'Save work that inspires you.',
    body: 'Moved by someone else’s video, post or article? Paste its link from Instagram, YouTube or anywhere, and note what caught your eye.',
    mood: 'tide',
    Widget: CaptureWidget,
  },
]

