import { anthropic } from './anthropic'
import { MODELS } from './models'

export interface PoeticTitleInput {
  one_sentence: string
  conviction_statement: string
  emotional_journey: string
  core_truth: string
}

// Called once, when a core-concept document is first locked — the title this
// returns becomes the piece/idea's title until the user renames it while
// writing. Falls back to one_sentence on any failure so saving never blocks.
export async function generatePoeticTitle(input: PoeticTitleInput): Promise<string> {
  const summary = `
What it's about: ${input.one_sentence}
Conviction: ${input.conviction_statement}
Emotional journey: ${input.emotional_journey}
Core truth: ${input.core_truth}
  `.trim()

  try {
    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 60,
      system: `You name nascent creative pieces with short, poetic titles — not summaries or descriptions, titles. Think chapter titles, art piece names, single evocative phrases: 2-6 words that capture the emotional core of the piece and spark curiosity without explaining it away. Mysterious and playful, never literal.

Rules:
- 2-6 words. Never a full sentence, never a colon-and-subtitle construction.
- Draw from the emotional/thematic core (conviction, emotional journey, core truth) rather than restating the literal description.
- No quotation marks, no trailing punctuation, no preamble.
- Output ONLY the title itself, nothing else.`,
      messages: [
        {
          role: 'user',
          content: `Give this piece a title:\n${summary}`,
        },
      ],
    })

    const textContent = response.content.find((block) => block.type === 'text')
    if (!textContent || textContent.type !== 'text') return input.one_sentence

    const title = textContent.text.trim().replace(/^["']+|["']+$/g, '')
    return title.length > 0 ? title : input.one_sentence
  } catch (error) {
    console.error('generatePoeticTitle error:', error)
    return input.one_sentence
  }
}
