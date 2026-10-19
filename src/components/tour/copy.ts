// The one slide between a new account's questions and the app: a warm
// handover, not a tour (each part of the app shows itself round the first time
// it is opened). What it says follows what they said they make. Choosing
// creative direction or client projects (Direction's people) always reads as
// professional work, whatever else they chose, so the slide speaks to a
// studio rather than to personal projects.

import type { Practice } from '@/lib/tour'

/** The example project on their board for each practice (lib/examples), by title. */
const EXAMPLE: Record<Practice, { title: string; kind: string }> = {
  director: { title: 'Aldermoor: Come Back Different', kind: 'campaign' },
  client: { title: 'Aurélia Bakery: The Second Shop', kind: 'client project' },
  songwriter: { title: 'The Age He Was', kind: 'album' },
  writer: { title: 'Before Anyone Wakes Up', kind: 'collection' },
  creator: { title: 'The Orange Hours', kind: 'series' },
  cinematographer: { title: 'The Orange Hours', kind: 'documentary series' },
}

/** What a practice makes, in its own words. */
const MAKES: Record<Practice, string> = {
  writer: 'writing',
  songwriter: 'songs',
  cinematographer: 'films',
  creator: 'videos',
  client: 'client work',
  director: 'campaigns',
}

const PRO: Practice[] = ['director', 'client']

/** Direction's people: anyone who named creative direction or client projects. */
export function isProfessional(practices: Practice[]): boolean {
  return practices.some((p) => PRO.includes(p))
}

/** The practice the slide speaks to: a professional one first, otherwise the first they named. */
function lead(practices: Practice[]): Practice | null {
  return practices.find((p) => PRO.includes(p)) ?? practices[0] ?? null
}

function list(words: string[]): string {
  const w = [...new Set(words)]
  return w.length <= 1 ? (w[0] ?? '') : `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`
}

export interface Handover {
  eyebrow: string
  title: string
  body: string
  /** Where to start, in order. */
  steps: { title: string; body: string }[]
}

export function handover(practices: Practice[], name: string, newAccount: boolean): Handover {
  const who = lead(practices)
  const example = who ? EXAMPLE[who] : null
  const first = newAccount && example
    ? { title: `Open ${example.title}`, body: `An example ${example.kind} is waiting on your Project Board. Open it first: it shows you round as you go, and nothing you do there can break it.` }
    : null

  if (isProfessional(practices)) {
    const what = list(practices.filter((p) => PRO.includes(p)).map((p) => MAKES[p]))
    return {
      eyebrow: 'Your studio',
      title: name ? `Ready when you are, ${name}.` : 'Ready when you are.',
      body: `Companheiro is set up for professional work: ${what} held to one clear concept from the brief onwards, every deliverable laid out where you can see how it connects, and the whole vision talked through whenever a client pulls it somewhere else.`,
      steps: [
        ...(first ? [first] : []),
        { title: 'Start from the brief', body: 'Bring the job you’re on. A few questions, and it has a concept the whole team can be held to.' },
        { title: 'Talk the vision through', body: 'When the work drifts or a client pushes, talk it over with something that has read the whole project.' },
      ],
    }
  }

  const what = practices.length ? list(practices.map((p) => MAKES[p])) : 'what you make'
  return {
    eyebrow: 'Welcome in',
    title: name ? `Welcome in, ${name}.` : 'Welcome in.',
    body: `This is a place for your ${what}: ideas drawn from the themes you just named, a clear concept before you begin, and someone to talk the work through with when it stalls. Each part shows you round the first time you open it.`,
    steps: [
      ...(first ? [first] : []),
      { title: 'Find a question in the Idea Lab', body: 'On a day with no plan, choose one of your themes and start from what it asks.' },
      { title: 'Check in when something’s in the way', body: 'Say how you are, or leave a thought for a project on the go.' },
    ],
  }
}
