// Looking back on a finished piece. Every answer is optional and in the
// person's own words or one tap; nothing here scores the work or asks whether
// it was shared. Shared by the Reflect page, the log route and the Reading
// room, so they agree on what the answers are.

export type SaidIt = 'said' | 'close' | 'other'

/** "Did it say what you set out to say?": what the person decides, not what anyone grades. */
export const SAID_IT: Array<{ key: SaidIt; label: string; line: string }> = [
  { key: 'said', label: 'Yes, it said it', line: 'It said what you set out to say.' },
  { key: 'close', label: 'Close, not quite', line: 'It came close to what you set out to say.' },
  { key: 'other', label: 'It became something else', line: 'It became something other than what you set out to say.' },
]

/** Some easy, some not: nobody is asked to feel pleased. */
export const FEELINGS = [
  'Proud', 'Relieved', 'Lighter', 'Tender', 'Surprised',
  'Grateful', 'Restless', 'Unsure', 'Empty', 'Still raw',
] as const

export const MAX_FEELINGS = 3
export const MAX_TEXT = 4000

export function cleanSaidIt(raw: unknown): SaidIt | null {
  return SAID_IT.some((s) => s.key === raw) ? (raw as SaidIt) : null
}

export function cleanFeelings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const known = new Set<string>(FEELINGS)
  const out: string[] = []
  for (const item of raw) {
    if (typeof item === 'string' && known.has(item) && !out.includes(item)) out.push(item)
    if (out.length === MAX_FEELINGS) break
  }
  return out
}

export const cleanText = (raw: unknown): string => (typeof raw === 'string' ? raw.trim().slice(0, MAX_TEXT) : '')

/** One idea to a line, bullets and numbers stripped. */
export function continuationLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*\d.)]+\s+/, '').trim())
    .filter((line) => line.length > 0)
}

export interface ReflectionAnswers {
  said_it: SaidIt | null
  felt: string[]
  remembered: string
  unresolved: string
  next: string
}

export const emptyAnswers = (): ReflectionAnswers => ({ said_it: null, felt: [], remembered: '', unresolved: '', next: '' })

export const hasAnyAnswer = (a: ReflectionAnswers) =>
  !!a.said_it || a.felt.length > 0 || !!a.remembered.trim() || !!a.unresolved.trim() || !!a.next.trim()

/** What is sent to the log route: the older four columns keep their meaning for everything that reads them. */
export function toLogBody(a: ReflectionAnswers) {
  return {
    said_it: a.said_it,
    felt: a.felt,
    what_it_opened: a.remembered.trim(),
    unresolved: a.unresolved.trim(),
    natural_continuations: a.next.trim(),
  }
}
