// "The pieces together": the one sentence-or-two the vision page may say about
// a project of several pieces that no single piece already says.
//
// Each piece already has its own core truth, conviction and journey, and the
// project has its own purpose; a statement that repeats or rephrases any of
// them adds nothing and, worse, can drift out of date beside the words it
// copies. So the statement is held to being new: it is only kept when most of
// its wording is not already on the page. Pure, so it is tested on its own.

import { normalise } from '@/lib/studio/talk/verbatim'

/** How many words in a row make a borrowed phrase. */
const RUN = 4
/** More than this share of the statement's runs found in what already exists, and it is a paraphrase. Some borrowing is natural: it names the pieces and uses their words. */
export const BORROWED_SHARE = 0.3

function runs(text: string): string[] {
  const words = normalise(text).split(' ').filter(Boolean)
  const out: string[] = []
  for (let i = 0; i + RUN <= words.length; i++) out.push(words.slice(i, i + RUN).join(' '))
  return out
}

/**
 * The share of the statement's four-word runs that already appear in `existing`
 * (the core truths, convictions, journeys and purposes). 0 is wholly new.
 */
export function borrowedShare(statement: string, existing: string[]): number {
  const mine = runs(statement)
  if (mine.length === 0) return 0
  const known = new Set(existing.flatMap(runs))
  return mine.filter((r) => known.has(r)).length / mine.length
}

/** The statement is kept when it is not a rewording of what the page already says. */
export const isNewToThePage = (statement: string, existing: string[]) => borrowedShare(statement, existing) <= BORROWED_SHARE

/** Which of the borrowed runs to point at when asking for another try. */
export function borrowedRuns(statement: string, existing: string[], max = 6): string[] {
  const known = new Set(existing.flatMap(runs))
  return [...new Set(runs(statement).filter((r) => known.has(r)))].slice(0, max)
}
