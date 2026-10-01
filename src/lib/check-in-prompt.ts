// Shared between /api/check-in/process (first turn) and /api/check-in/respond
// (every turn after). Both emit the same signals block so the reading can be
// revised as a conversation deepens — someone who opens "bit tired" and gets
// somewhere real four turns later should not be logged as what their opening
// line said.

export interface Signals {
  energy: 'low' | 'medium' | 'high'
  inner_weather: string
  creative_readiness: boolean
  arc_texture: 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration'
}

export const SIGNALS_SPEC = `Then extract four signals as a JSON block at the very end of your response, in this exact format:
<signals>
{
  "energy": "low" | "medium" | "high",
  "inner_weather": "<short evocative descriptor, e.g. 'foggy but clearing', 'steady', 'stormy'>",
  "creative_readiness": true | false,
  "arc_texture": "Breakaway" | "Beginning" | "Expansion" | "Integration"
}
</signals>

Arc texture guide:
- Breakaway: restless, wanting to escape, resistant to structure
- Beginning: fresh energy, openness, new curiosity
- Expansion: building momentum, going deeper, multiplying ideas
- Integration: consolidating, reflecting, letting things settle

\`creative_readiness\` decides whether they are offered a door into developing an idea, so it is false by default and true only rarely. Set it true only when ALL of these hold:
- There is a specific subject on the table that could become a piece of work: an image, a question, a story, an argument, a thing they noticed about the world. A mood, a state, a problem in their life or a plan for the day is not a subject.
- It came from them, in their own words, with enough said about it that someone could start developing it right now without asking "what is it about?".
- They are leaning toward it: curious, energised, wanting to say more or make something of it. Mentioning in passing that they might write about something is not leaning.
- They have the room for it. Someone depleted, raw, ashamed, or still in the middle of putting something heavy down is false, however good the material is.
It is not a measure of whether they are creative, whether the conversation went well, or whether you gave a good reflection. When in doubt it is false.`

export const SIGNALS_REVISION_SPEC = `${SIGNALS_SPEC}

Read the signals from the conversation as a whole, not from the latest message alone, and not from where it started. If what this is actually about has changed since the opening line, the signals change with it. That includes \`creative_readiness\`: it can turn true once a real subject has taken shape, and it turns false again if the conversation moves somewhere heavy or tender.`

// The door into the Idea Lab needs two things: the model's reading above, and
// enough actually said to carry over. The second is counted here rather than
// left to the model, which is generous with thin material — a one-line
// check-in handed to the Lab arrives with nothing to develop.
export const LAB_OFFER_MIN_WORDS = 80

export function canOfferLab(creativeReadiness: boolean | undefined, userTexts: string[]): boolean {
  if (!creativeReadiness) return false
  const words = userTexts.join(' ').trim().split(/\s+/).filter(Boolean).length
  return words >= LAB_OFFER_MIN_WORDS
}

// Reached when the model omits or malforms the <signals> block. This gets
// written into the permanent emotional record, so the weather word says it
// is unread rather than inventing a plausible-sounding one.
const FALLBACK: Signals = {
  energy: 'medium',
  inner_weather: 'unclear',
  creative_readiness: false,
  arc_texture: 'Expansion',
}

export function parseSignals(fullText: string): Signals {
  const match = fullText.match(/<signals>([\s\S]*?)<\/signals>/)
  if (!match) return FALLBACK

  try {
    const parsed = JSON.parse(match[1].trim())
    return {
      energy: parsed.energy ?? FALLBACK.energy,
      inner_weather: parsed.inner_weather ?? FALLBACK.inner_weather,
      creative_readiness: parsed.creative_readiness ?? FALLBACK.creative_readiness,
      arc_texture: parsed.arc_texture ?? FALLBACK.arc_texture,
    }
  } catch {
    return FALLBACK
  }
}

// True when the model returned a usable signals block. The respond route uses
// this so a malformed block on a later turn leaves the existing reading alone
// rather than overwriting it with the fallback.
export function hasSignals(fullText: string): boolean {
  const match = fullText.match(/<signals>([\s\S]*?)<\/signals>/)
  if (!match) return false
  try {
    JSON.parse(match[1].trim())
    return true
  } catch {
    return false
  }
}

// Appended to the signal spec. The model emits this only when a genuine
// realisation has emerged or the conversation has reached a natural close —
// it gates the journal-prompt button in the UI.
export const JOURNAL_CUE_SPEC = `After the signals block, if a genuine realisation has surfaced — something the person would benefit from sitting with alone in a reflective offline environment — or if the conversation has reached a natural resting point, add:
<journal_cue>1</journal_cue>
Omit it entirely otherwise. Do not add it just because the conversation felt productive or because you gave a good reflection.`

// True when the model decided this moment warrants a journal prompt.
export function parseJournalCue(fullText: string): boolean {
  return fullText.includes('<journal_cue>')
}
