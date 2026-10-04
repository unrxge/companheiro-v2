// What each tour slide says to this person. The landing page speaks to
// everyone (slides.tsx); here the same parts of the app are described in the
// words of what they said they make, with their own themes named where the
// part uses them. A slide speaks as the practice that wants it most.

import type { Practice } from '@/lib/tour'
import { RANK, type SlideId } from './slides'

interface Words {
  /** "an essay", "a song": one thing they make. */
  a: string
  /** "essays", "songs". */
  many: string
  /** The one they haven't made yet, as they might think of it. */
  unmade: string
  /** What they get stuck on while writing. */
  part: string
  /** What sits on their canvas. */
  canvas: string
  /** The line they won't cross, as it comes up for them. */
  rule: string
  /** What they save from other people. */
  finds: string
}

const WORDS: Record<Practice | 'none', Words> = {
  writer: {
    a: 'an essay', many: 'essays', unmade: 'the essay you keep circling', part: 'paragraph',
    canvas: 'the chapters, your notes, a voice memo from a walk, what’s left to do',
    rule: 'a way you refuse to write about something',
    finds: 'an essay, a talk or a post',
  },
  songwriter: {
    a: 'a song', many: 'songs', unmade: 'the song that’s only a feeling so far', part: 'verse',
    canvas: 'the lyrics, a recording of the melody, the songs that belong beside it, what’s left to do',
    rule: 'a sound or a line you won’t use',
    finds: 'a live session, a lyric or a record',
  },
  cinematographer: {
    a: 'a film', many: 'films', unmade: 'the film you can see but can’t yet pitch', part: 'scene',
    canvas: 'the treatment, the shot list, reference frames, a voice note from the recce, what’s left to do',
    rule: 'a shot you refuse to take',
    finds: 'a film, a frame or a behind-the-scenes clip',
  },
  creator: {
    a: 'a video', many: 'videos', unmade: 'the video you keep meaning to make', part: 'script',
    canvas: 'the scripts, reference clips, a voice note, what’s left to do',
    rule: 'something you won’t do for the views',
    finds: 'a reel, a video or a post',
  },
  client: {
    a: 'a client project', many: 'client projects', unmade: 'the brief that arrived half-formed', part: 'draft',
    canvas: 'the brief, the deliverables, references, a voice note after the call, the task list',
    rule: 'something the client asks for that the work shouldn’t do',
    finds: 'a campaign, a film or a reference a client sent',
  },
  director: {
    a: 'a campaign', many: 'campaigns', unmade: 'the campaign that still needs its one clear idea', part: 'treatment',
    canvas: 'the treatment, every deliverable, references, voice notes, the task lists',
    rule: 'a line the work won’t cross, whoever asks',
    finds: 'a campaign, a film or a piece of design',
  },
  none: {
    a: 'a piece', many: 'pieces', unmade: 'the idea you keep circling', part: 'line',
    canvas: 'the pieces, a reference image, a voice note, what’s left to do',
    rule: 'a line the work won’t cross',
    finds: 'a video, a post or an article',
  },
}

/** Whose words a slide is said in: of the practices they chose, the one that ranks this part highest. */
function voiceFor(id: SlideId, practices: Practice[]): Words {
  let best: Practice | 'none' = practices[0] ?? 'none'
  let at = Infinity
  for (const p of practices) {
    const i = RANK[p].indexOf(id)
    if (i >= 0 && i < at) { best = p; at = i }
  }
  return WORDS[best]
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** ‘A’, ‘B’ and ‘C’. Their themes are only ever named, never worked into a sentence's grammar. */
function named(themes: string[]): string {
  const q = themes.map((t) => `‘${t}’`)
  return q.length <= 1 ? q.join('') : `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}`
}

export function tourCopy(id: SlideId, practices: Practice[], themes: string[]): { title: string; body: string } | null {
  const w = voiceFor(id, practices)
  switch (id) {
    case 'idea':
      return {
        title: 'A question to start from, on your own themes.',
        body: themes.length
          ? `Your Idea Lab already holds ${named(themes)}. Choose one whenever you sit down to work, and it asks you a question worth making ${w.a} from. No waiting for the muse to turn up.`
          : `Choose a theme whenever you sit down to work, and the Idea Lab asks you a question worth making ${w.a} from. No waiting for the muse to turn up.`,
      }
    case 'conceptualise':
      return {
        title: `Get ${w.unmade} into words.`,
        body: `Say what you have so far, at whatever length it takes. ‘Conceptualise’ then asks one question at a time, about what it is, who it’s for and what it stands on, until ${w.a.replace(/^an? /, 'your ')} has a concept you can say in a sentence.`,
      }
    case 'board':
      return {
        title: `Every one of your ${w.many}, in one place.`,
        body: `Each idea becomes a project. The board is there to help you finish more of them: you see the one you’re on now, the ${w.many} waiting their turn, and how many you’ve already brought to the end.`,
      }
    case 'canvas':
      return {
        title: `Lay ${w.a.replace(/^an? /, 'the whole ')} out.`,
        body: `Open a project and everything it needs sits on one canvas: ${w.canvas}. Threads show what connects, so you can see the shape of the work at a glance.`,
      }
    case 'rules':
      return {
        title: 'Say a rule once. It’s kept for you.',
        body: `Talk a project through, and when you mention ${w.rule}, it asks whether to keep that as a rule. A kept rule comes back as a question the day new work runs against it. Nothing becomes a rule without you.`,
      }
    case 'writing':
      return {
        title: `Stuck on a ${w.part}? Talk it over.`,
        body: `Select any part of what you’re writing to talk about it. Companheiro asks questions and reflects things back until you can see what you meant, so the ${w.part} you end up with is the one you were reaching for.`,
      }
    case 'portrait':
      return {
        title: 'Discover your own patterns.',
        body: `The more ${w.many} you make here, the more of your own patterns you get to see: what keeps returning, how you think things through, what actually helps you. ‘Portrait’ shows them to you, and you can remove any that aren’t true.`,
      }
    case 'capture':
      return {
        title: 'Save the work that moves you.',
        body: `${cap(w.finds)} by someone else stopped you in your tracks? Paste the link and note what caught your eye. It waits in your capture bank until you need a spark for ${w.a.replace(/^an? /, 'your next ')}.`,
      }
    default:
      return null
  }
}
