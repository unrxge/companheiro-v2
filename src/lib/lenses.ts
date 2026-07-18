// Creative lenses for Reimagine mode — each recasts the finished piece into an
// unexpected form to surface new angles. label/description drive the client
// gallery; instruction drives the server generation. Keep the keys in sync.
export interface Lens {
  key: string
  label: string
  description: string
  instruction: string
}

export const LENSES: Lens[] = [
  {
    key: 'letter',
    label: 'As a letter',
    description: 'Written to one specific person who needs to hear it.',
    instruction:
      'Recast the piece as an intimate personal letter to one specific reader who needs to hear it. Use direct address, let the relationship shape what gets said and left unsaid.',
  },
  {
    key: 'reverse',
    label: 'Start from the end',
    description: 'Open on the conclusion, then earn it backward.',
    instruction:
      'Restructure the piece so it opens on its ending — the conclusion, the last image, the landing — and then moves backward or circles to earn it. Same truth, reversed arc.',
  },
  {
    key: 'metaphor',
    label: 'One extended metaphor',
    description: 'The whole thing through a single sustained image.',
    instruction:
      'Recast the entire piece through ONE sustained metaphor that carries from first line to last. Choose an image that genuinely fits the core truth, then commit to it fully.',
  },
  {
    key: 'confession',
    label: 'As a confession',
    description: 'Stripped of distance — closer, rawer, first-person.',
    instruction:
      'Retell the piece as an intimate confession. Strip the analytical distance, move fully into first person and the present, admit what the original kept at arm’s length.',
  },
  {
    key: 'manifesto',
    label: 'As a manifesto',
    description: 'Sharpened into declarations you could nail to a door.',
    instruction:
      'Sharpen the piece into a manifesto: declarative, unhedged, rhythmic. Turn its reflections into stances. Keep it honest, not bombastic — conviction, not noise.',
  },
  {
    key: 'short_form',
    label: 'The short-form cut',
    description: 'A punchy script for a reel or short video.',
    instruction:
      'Distil the piece into a punchy short-form video script (30–60 seconds spoken): a hook in the first line, the single sharpest idea, a landing. Mark it as spoken script.',
  },
]

export function getLens(key: string): Lens | undefined {
  return LENSES.find((l) => l.key === key)
}
