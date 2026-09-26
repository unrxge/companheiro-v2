// Pure text helpers behind useDictation. Kept free of React and the browser
// so the rules that decide what gets written into someone's text can be
// tested on their own.

// Everything that counts as punctuation for the purposes of "did the model
// change any words": anything that isn't a letter, a number or whitespace.
// Unicode-aware so accented words (não, café) are compared as words, not
// silently reduced to their ASCII letters.
const NON_WORD = /[^\p{L}\p{N}\s]/gu

/** Lowercased words with all punctuation removed — the thing that must not change. */
export function wordKey(s: string): string {
  return s.toLowerCase().replace(NON_WORD, '').replace(/\s+/g, ' ').trim()
}

/** True when `candidate` has exactly the words of `raw`: only punctuation and case may differ. */
export function wordsUnchanged(raw: string, candidate: string): boolean {
  return wordKey(raw) === wordKey(candidate)
}

/** Split on whitespace, dropping empties. */
export function splitWords(s: string): string[] {
  return s.split(/\s+/).filter(Boolean)
}

/** Does this token carry a word (and not just a dash or ellipsis on its own)? */
export function isWordToken(token: string): boolean {
  return /[\p{L}\p{N}]/u.test(token)
}

export function countWords(s: string): number {
  return splitWords(s).filter(isWordToken).length
}

/**
 * Strip the sentence punctuation a speech recognizer adds on its own. Some
 * recognizers (Safari's, notably) put a full stop and a capital at every
 * pause, which is exactly the break we're trying not to make; left in, the
 * model tends to keep them. Only marks at the end of a word are removed, so
 * "3.5", "e.g" and "don't" survive.
 */
export function stripRecognizerPunctuation(s: string): string {
  return s
    .replace(/[.,!?;:…]+(?=\s|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Split punctuated text into sentences, keeping each one's closing marks
 * (and any closing quote or bracket) with it. A sentence only ends at a mark
 * followed by a space, so "3.5" stays one word, and splitting on whitespace
 * keeps the word count of each sentence aligned with the raw transcript.
 */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let current: string[] = []
  for (const token of splitWords(text)) {
    current.push(token)
    if (/[.!?…]["'”’)\]]*$/.test(token)) {
      out.push(current.join(' '))
      current = []
    }
  }
  if (current.length) out.push(current.join(' '))
  return out
}

/**
 * Given a punctuated rendering of the words still in play, decide how much
 * of it is safe to write into the person's text for good.
 *
 * A sentence is only settled once enough speech has followed it that the
 * model has seen what came next — that's what stops a thinking pause from
 * becoming a full stop. The final sentence always stays open while someone
 * is still talking, however complete it looks.
 */
export function settleSentences(
  punctuated: string,
  { final, minFollowingWords }: { final: boolean; minFollowingWords: number },
): { settled: string; settledWords: number; open: string } {
  if (final) {
    return { settled: punctuated.trim(), settledWords: countWords(punctuated), open: '' }
  }
  const sentences = splitSentences(punctuated)
  const counts = sentences.map(countWords)
  const total = counts.reduce((a, b) => a + b, 0)
  let take = 0
  let words = 0
  for (let i = 0; i < sentences.length - 1; i++) {
    if (total - (words + counts[i]) < minFollowingWords) break
    words += counts[i]
    take = i + 1
  }
  return {
    settled: sentences.slice(0, take).join(' '),
    settledWords: words,
    open: sentences.slice(take).join(' '),
  }
}

/** Join two pieces of text with a single space where one is needed. */
export function joinText(a: string, b: string): string {
  if (!a) return b
  if (!b) return a
  return /\s$/.test(a) ? a + b : `${a} ${b}`
}
