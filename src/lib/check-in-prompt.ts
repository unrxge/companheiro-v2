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
- Integration: consolidating, reflecting, letting things settle`

export const SIGNALS_REVISION_SPEC = `${SIGNALS_SPEC}

Read the signals from the conversation as a whole, not from the latest message alone, and not from where it started. If what this is actually about has changed since the opening line, the signals change with it. \`creative_readiness\` means there is genuinely something here they could make something from — it is not a measure of whether the conversation went well, and a conversation that arrived somewhere heavy or tender is usually false.`

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
