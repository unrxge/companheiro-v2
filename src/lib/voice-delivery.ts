// How the companion's voice reads a check-in reply aloud.
//
// One voice, one character, for everyone. What changes between replies is
// only pace and pause, chosen from the reading the check-in already has
// (energy and movement), never from a person's history. Nothing here asks the
// speech model for a feeling: told to sound "warm" or "compassionate" it
// performs, and a performance is the one thing this must not be. The words
// carry the feeling; the voice gets out of their way.
//
// The registers come from 51 real check-ins (June to October 2026):
//   - medium energy 59%, high 31%, low 10%
//   - movement: Integration 49%, Breakaway 29%, Expansion + Beginning 22%
//   - low-energy check-ins open longest (median 256 words against 152) and
//     run shortest: the person puts it all down once and hears one reply
//   - a third of all check-ins are a single turn, so the first reply is often
//     the only thing heard; three quarters of first replies end on a question
//   - mornings and evenings are equal, midday is rare

export type Energy = 'low' | 'medium' | 'high'
export type Movement = 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration'
export type Register = 'settled' | 'restless' | 'lifted' | 'depleted'

export interface VoiceContext {
  energy?: Energy | null
  movement?: Movement | null
  /** The listener's own clock, 0-23. */
  hour?: number | null
}

// Who is listening, in the four states the data actually shows.
export function registerFor({ energy, movement }: VoiceContext): Register {
  // Running on empty outranks everything: they have just put a lot down.
  if (energy === 'low') return 'depleted'
  // Pushing against something, agitated or stuck (29% of check-ins).
  if (movement === 'Breakaway') return 'restless'
  // Momentum: something opening or building.
  if (movement === 'Expansion' || movement === 'Beginning') return 'lifted'
  // Reflecting, settling, a good or ordinary day: the most common state.
  return 'settled'
}

const CHARACTER = `A man's low, calm voice, speaking quietly to one person in the same room. Plain and unhurried. Read the words as they are written and let them do the work: do not act any emotion, do not add emphasis for effect, do not smile through the words. Never bright, never like an announcer, a narrator, a therapist or an assistant.`

// Pace and pause only.
const PACE: Record<Register, string> = {
  settled: `Even, conversational pace, with the ordinary pauses of someone thinking as they speak.`,
  // Agitation met with evenness. Slowing down for someone restless sounds
  // like being handled; matching their speed feeds it.
  restless: `Steady, level pace from first word to last: neither slowed down nor hurried. Let each sentence finish cleanly before the next begins.`,
  // Momentum is theirs. The voice keeps up without getting excited about it.
  lifted: `A slightly more forward pace than usual, still relaxed. No added brightness or enthusiasm.`,
  // The one register that slows: this is often the only reply they hear.
  depleted: `Slower than conversation, with a full breath of silence between sentences. A little quieter. Nothing pressed.`,
}

export function deliveryFor(context: VoiceContext, text: string): string {
  const register = registerFor(context)
  const parts = [CHARACTER, PACE[register]]

  // Late evening and night: lower the volume of the whole thing a notch.
  const hour = context.hour
  if (typeof hour === 'number' && (hour >= 21 || hour < 6)) {
    parts.push(`It is late where they are: keep it quiet.`)
  }

  // Most replies end by offering a question; the rest come to rest.
  if (/\?\s*$/.test(text.trim())) {
    parts.push(`Leave a short pause before the final question and ask it simply, as a real question, without pressing.`)
  } else {
    parts.push(`Let the last sentence come to rest; do not trail off and do not lift at the end.`)
  }

  parts.push(`Speak in the language the text is written in.`)
  return parts.join(' ')
}

// Cut for length at the end of a sentence, never mid-word.
export function trimForSpeech(text: string, max: number): string {
  const clean = text.replace(/[*_`#]+/g, '').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('\n'))
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut).trim()
}

const ENERGIES: Energy[] = ['low', 'medium', 'high']
const MOVEMENTS: Movement[] = ['Breakaway', 'Beginning', 'Expansion', 'Integration']

// Accepts only known values from the browser; anything else is ignored.
export function parseVoiceContext(raw: unknown): VoiceContext {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const hour = typeof r.hour === 'number' && r.hour >= 0 && r.hour <= 23 ? Math.floor(r.hour) : null
  return {
    energy: ENERGIES.includes(r.energy as Energy) ? (r.energy as Energy) : null,
    movement: MOVEMENTS.includes(r.movement as Movement) ? (r.movement as Movement) : null,
    hour,
  }
}
