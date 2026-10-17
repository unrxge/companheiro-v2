// The example projects on a new account's Project Board: which there are,
// which a person is shown, and whether they are shown at all.
//
// They are never rows in anyone's database. A person's examples are chosen
// from what they said their practice is at sign-up, and the whole project is
// served read-only from code (serve.ts), so an example can never reach the
// companion's context, the person's analytics, their plan's count of active
// projects, or anything else that reads their own work.

import { PRACTICE_KEYS, type Practice } from '@/lib/tour'
import type { ShelfProject } from '@/lib/studio/types'
import { buildExample, exampleProjectId, type ExampleMark } from './build'
import type { ExampleKey, ExampleSource } from './types'
import { writer } from './writer'
import { songwriter } from './songwriter'
import { series } from './series'
import { studio } from './studio'

/** In the order PRACTICES lists them, so a person's examples come in a familiar order. */
export const EXAMPLES: readonly ExampleSource[] = [writer, songwriter, series, studio]

export const exampleByKey = (key: string): ExampleSource | null => EXAMPLES.find((e) => e.key === key) ?? null

/** The example a project id belongs to, for any id it hands out (`example-songwriter--…`). */
export function exampleOfId(id: string): ExampleSource | null {
  const m = /^example-([a-z]+)(?:--|$)/.exec(id)
  return m ? exampleByKey(m[1]) : null
}

/**
 * Which examples a person sees, theirs first: one for each practice they chose
 * at sign-up, in the order they chose them. With none that match (they only
 * wrote "Something else", or skipped it) they see them all, since any of the
 * four could be the one that shows them what the app is for.
 */
export function examplesFor(practices: readonly string[] | null | undefined): Array<{ example: ExampleSource; matched: boolean }> {
  const chosen = (practices ?? []).filter((p): p is Practice => PRACTICE_KEYS.includes(p as Practice))
  const mine: ExampleSource[] = []
  for (const p of chosen) {
    const found = EXAMPLES.find((e) => e.practices.includes(p))
    if (found && !mine.includes(found)) mine.push(found)
  }
  if (mine.length === 0) return EXAMPLES.map((example) => ({ example, matched: true }))
  return [
    ...mine.map((example) => ({ example, matched: true })),
    ...EXAMPLES.filter((e) => !mine.includes(e)).map((example) => ({ example, matched: false })),
  ]
}

export { EXAMPLES_FROM, examplesShown, type ExamplesChoice } from './shown'

// ── the card on the board ───────────────────────────────────────────────────

export interface ExampleCard extends ShelfProject {
  example: ExampleMark & { key: ExampleKey; label: string; teaser: string; matched: boolean }
}

/** An example as the Project Board draws a card: the same shape as a project of the person's own, marked. */
export function exampleCard(src: ExampleSource, matched: boolean, now: number = Date.now()): ExampleCard {
  const built = buildExample(src, now)
  const roots = built.tree.nodes.filter((n) => !n.parent_id)
  return {
    ...built.project,
    concept_body: src.intent.slice(0, 200),
    since: {
      cutoff: built.project.last_opened_at, last_opened_at: built.project.last_opened_at, canvas_version: 1,
      last_said: null, arrived_since: 0, waiting: 0, compass_pending: 0, catches_unmarked: 0, commitments_open: 0,
    },
    root_ids: roots.map((r) => r.id),
    thread_count: built.tree.threads.length,
    stage: null,
    example: { key: src.key, label: src.label, who: src.who, teaser: src.teaser, matched },
  }
}

export { exampleProjectId }
