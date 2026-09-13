// studio/src/lib/studio/talk/verbatim.ts — verbatim in code (D-055). Every update
// text, commitment text, decision text and compass evidence quote must be a
// normalised substring of the person's entry or it is dropped. Pure; no deps.
//
// normalise: NFC, lowercase, punctuation and symbols stripped (Unicode-aware, so
// curly quotes, dashes and the apostrophe in "I'll" all vanish), whitespace
// collapsed. Letters with diacritics are kept: "não" and "nao" are different words.

const PUNCT = /[\p{P}\p{S}]+/gu
const SPACES = /\s+/g

export function normalise(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(PUNCT, ' ')
    .replace(SPACES, ' ')
    .trim()
}

/** True when `span` (after normalisation) is a contiguous, non-empty run of words inside `source`. */
export function isVerbatim(span: string, source: string): boolean {
  const a = normalise(span)
  if (a.length === 0) return false
  const b = normalise(source)
  if (b.length === 0) return false
  // word-boundary containment: " a " inside " b " so "art" never matches inside "start"
  return ` ${b} `.includes(` ${a} `)
}
