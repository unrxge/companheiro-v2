// What each tour slide says to this person. The landing page speaks to
// everyone (slides.tsx); here a part of the app is put in the terms of what
// they said they make, and the point of each slide is how to get the most out
// of that part, not how it works (the example walks show that). Their themes
// are named where the part uses them, never worked into a sentence.

import type { Practice } from '@/lib/tour'
import { practiceFor, type HabitId, type SlideId } from './slides'

interface Words {
  /** "an essay", "a song": one thing they make. */
  a: string
  /** "essays", "songs". */
  many: string
  /** What they save from other people. */
  finds: string
}

const WORDS: Record<Practice | 'none', Words> = {
  writer: { a: 'an essay', many: 'essays', finds: 'an essay, a talk or a post' },
  songwriter: { a: 'a song', many: 'songs', finds: 'a live session, a lyric or a record' },
  cinematographer: { a: 'a film', many: 'films', finds: 'a film, a frame or a behind-the-scenes clip' },
  creator: { a: 'a video', many: 'videos', finds: 'a reel, a video or a post' },
  client: { a: 'a client project', many: 'client projects', finds: 'a campaign, a film or a reference a client sent' },
  director: { a: 'a campaign', many: 'campaigns', finds: 'a campaign, a film or a piece of design' },
  none: { a: 'a piece', many: 'pieces', finds: 'a video, a post or an article' },
}

/** ‘A’, ‘B’ and ‘C’. */
function named(themes: string[]): string {
  const q = themes.map((t) => `‘${t}’`)
  return q.length <= 1 ? q.join('') : `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}`
}
const yours = (a: string) => a.replace(/^an? /, 'your ')

export function tourCopy(id: SlideId, practices: Practice[], themes: string[]): { title: string; body: string } | null {
  const habit = id === 'capture' || id === 'checkin' || id === 'portrait' ? (id as HabitId) : null
  const w = WORDS[(habit ? practiceFor(habit, practices) : practices[0]) ?? 'none']
  switch (id) {
    case 'idea':
      return {
        title: 'Start from a question, not a blank page.',
        body: themes.length
          ? `Your Idea Lab already holds ${named(themes)}. On a day you sit down without a plan, choose one and you’re given a question worth making ${w.a} from. Ask again until one lands.`
          : `On a day you sit down without a plan, choose one of your themes in the Idea Lab and you’re given a question worth making ${w.a} from. Ask again until one lands.`,
      }
    case 'conceptualise':
      return {
        title: 'Give every project its concept first.',
        body: `A few minutes of questions, and ${yours(w.a)} has a concept: what it is, who it’s for, what it stands on. Everything after leans on it, and when the work drifts, it’s how you find your way back.`,
      }
    case 'capture':
      return {
        title: 'Keep what moves you, for later.',
        body: `When ${w.finds} by someone else stops you in your tracks, paste the link and say what caught you. On a day you’re empty, your capture bank is where to start.`,
      }
    case 'checkin':
      return {
        title: 'Talk it through before you make.',
        body: `When something is in the way of ${yours(w.a)}, a few minutes in ‘Check-in’ clears room for it. Speak or type, and Companheiro answers. Come when you need it, not every day.`,
      }
    case 'portrait':
      return {
        title: 'Watch your own patterns appear.',
        body: `The more ${w.many} you make here, the more ‘Portrait’ shows you how you work: what keeps returning, what actually helps. Read it now and then, and remove anything that isn’t you.`,
      }
    default:
      return null
  }
}

/** The last slide: a few ways to get the most from the app. */
export const BEST_VALUE: { title: string; body: string }[] = [
  { title: 'Keep only a few things active.', body: 'Finish one before you start the next. The rest wait safely in the Queue.' },
  { title: 'Come back to the concept.', body: 'When the work drifts, read it again before you change anything.' },
  { title: 'Talk it over when you’re stuck.', body: 'Select the part that won’t come right. It asks; you decide.' },
]
