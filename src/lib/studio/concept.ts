// src/lib/studio/concept.ts — lane H. Pure helpers around the concept:
// the revision diff summary the revisions drawer shows, constraint line
// splitting, and the validation that turns the model's draft-concept JSON into
// a `DraftConceptResponse` the person can trust (anchor candidates and compass
// quotes must be verbatim in what they wrote; references come from the urls in
// their own text, never from the model). No React, no DOM, no Date.now.

import type { ConceptRevision, DraftConceptResponse } from '@/lib/studio/types'

// ── verbatim (D-055) ────────────────────────────────────────────────────────
// Lane G owns talk/verbatim.ts and is writing it concurrently; these two are a
// local copy with the same contract (lowercase, strip punctuation, collapse
// spaces) so this lane never imports across the boundary. Reported as a
// deliberate duplication.

/** Lowercase, punctuation stripped, whitespace collapsed. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when `span` appears in `source` once both are normalised. Empty spans never match. */
export function isVerbatim(span: string, source: string): boolean {
  const a = normalise(span)
  if (!a) return false
  return normalise(source).includes(a)
}

// ── constraints ─────────────────────────────────────────────────────────────

/** One constraint per line; blank lines and leading bullets dropped. */
export function splitConstraints(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*[-•*·]\s*/, '').trim()
    if (!line) continue
    const key = normalise(line)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(line)
  }
  return out
}

export function joinConstraints(lines: readonly string[]): string {
  return lines.join('\n')
}

// ── body lines ──────────────────────────────────────────────────────────────

/** Non-empty lines of a body, trimmed. A concept body is short; lines are the unit the diff counts. */
export function bodyLines(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

// ── diff summary ────────────────────────────────────────────────────────────

export interface RevisionDiff {
  linesAdded: number
  linesRemoved: number
  constraintsAdded: number
  constraintsRemoved: number
}

function multisetDiff(prev: readonly string[], next: readonly string[]): { added: number; removed: number } {
  const counts = new Map<string, number>()
  for (const p of prev) {
    const k = normalise(p)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let added = 0
  for (const n of next) {
    const k = normalise(n)
    const c = counts.get(k) ?? 0
    if (c > 0) counts.set(k, c - 1)
    else added++
  }
  let removed = 0
  for (const c of counts.values()) removed += c
  return { added, removed }
}

export function diffRevisions(
  prev: Pick<ConceptRevision, 'body' | 'constraints'> | null,
  next: Pick<ConceptRevision, 'body' | 'constraints'>
): RevisionDiff {
  const prevLines = prev ? bodyLines(prev.body) : []
  const prevCons = prev ? prev.constraints : []
  const lines = multisetDiff(prevLines, bodyLines(next.body))
  const cons = multisetDiff(prevCons, next.constraints)
  return {
    linesAdded: lines.added,
    linesRemoved: lines.removed,
    constraintsAdded: cons.added,
    constraintsRemoved: cons.removed,
  }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * One line for the revisions list: `+2 lines · −1 constraint`. The first
 * revision reads `first version`; an identical save reads `no change`.
 */
export function diffSummary(
  prev: Pick<ConceptRevision, 'body' | 'constraints'> | null,
  next: Pick<ConceptRevision, 'body' | 'constraints'>
): string {
  if (!prev) return 'first version'
  const d = diffRevisions(prev, next)
  const parts: string[] = []
  if (d.linesAdded) parts.push(`+${plural(d.linesAdded, 'line', 'lines')}`)
  if (d.linesRemoved) parts.push(`−${plural(d.linesRemoved, 'line', 'lines')}`)
  if (d.constraintsAdded) parts.push(`+${plural(d.constraintsAdded, 'constraint', 'constraints')}`)
  if (d.constraintsRemoved) parts.push(`−${plural(d.constraintsRemoved, 'constraint', 'constraints')}`)
  return parts.length ? parts.join(' · ') : 'no change'
}

/** True when a revision's words are already the current concept (nothing to restore). */
export function sameRevision(
  a: Pick<ConceptRevision, 'body' | 'constraints'>,
  b: Pick<ConceptRevision, 'body' | 'constraints'>
): boolean {
  if (a.body.trim() !== b.body.trim()) return false
  if (a.constraints.length !== b.constraints.length) return false
  return a.constraints.every((c, i) => c.trim() === b.constraints[i].trim())
}

/** Newest first, ties broken by id so the order is stable. */
export function sortRevisions(revisions: readonly ConceptRevision[]): ConceptRevision[] {
  return [...revisions].sort((a, b) => {
    const d = Date.parse(b.created_at) - Date.parse(a.created_at)
    return d !== 0 ? d : a.id < b.id ? 1 : -1
  })
}

// ── references from the person's own text ───────────────────────────────────

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi
const TRAILING = /[.,;:!?)\]}'"»”’]+$/

/** Every url in the text, in order, deduplicated; `www.` urls are kept as written. */
export function extractUrls(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(TRAILING, '')
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

/** The sentence the url sits in, with the url itself removed. */
export function sentenceAround(text: string, url: string): string {
  const sentences = text.split(/(?<=[.!?])\s+|\n+/)
  const hit = sentences.find((s) => s.includes(url)) ?? ''
  return hit
    .replace(url, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, '')
    .trim()
}

export function referencesFrom(text: string): DraftConceptResponse['references'] {
  return extractUrls(text).map((url) => ({ url, title: '', note: sentenceAround(text, url) }))
}

// ── the model's draft → a trustworthy response ──────────────────────────────

export const TITLE_MAX_WORDS = 6
export const ANCHOR_MAX = 3
export const CONSTRAINT_MAX = 8
export const COMPASS_SEED_MAX = 4

/** Finds the first `{ … }` in a model reply, tolerating code fences and prose around it. */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim()
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(unfenced)
  } catch {
    const start = unfenced.indexOf('{')
    const end = unfenced.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
      return JSON.parse(unfenced.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

/** ≤ 6 words, lowercase, no trailing punctuation; empty when nothing usable. */
export function cleanTitle(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const words = raw.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?:;,]+$/, '').split(' ').filter(Boolean)
  return words.slice(0, TITLE_MAX_WORDS).join(' ').slice(0, 80)
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

function uniqueVerbatim(candidates: readonly string[], source: string, max: number, maxLen: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    const s = c.trim()
    if (!s || s.length > maxLen) continue
    const key = normalise(s)
    if (seen.has(key)) continue
    if (!isVerbatim(s, source)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= max) break
  }
  return out
}

/**
 * Turns whatever the model returned into a `DraftConceptResponse`. `source`
 * is the person's whole input (the brief, or the four answers joined). Every
 * verbatim field is checked in code and dropped when it is not theirs.
 */
export function validateDraft(raw: unknown, source: string): DraftConceptResponse {
  const r = isRecord(raw) ? raw : {}
  const title = cleanTitle(r.title)
  const body = typeof r.body === 'string' ? r.body.trim().slice(0, 2000) : ''
  const constraints = splitConstraints(strings(r.constraints).join('\n')).slice(0, CONSTRAINT_MAX)
  const anchor_candidates = uniqueVerbatim(strings(r.anchor_candidates), source, ANCHOR_MAX, 200)

  const compass_seed: DraftConceptResponse['compass_seed'] = []
  const seenSeed = new Set<string>()
  if (Array.isArray(r.compass_seed)) {
    for (const item of r.compass_seed) {
      if (!isRecord(item)) continue
      if (item.kind !== 'refusal' && item.kind !== 'non_negotiable') continue
      const statement = typeof item.statement === 'string' ? item.statement.trim().slice(0, 200) : ''
      const quote = typeof item.quote === 'string' ? item.quote.trim().slice(0, 300) : ''
      if (!statement || !quote || !isVerbatim(quote, source)) continue
      const key = `${item.kind}:${normalise(statement)}`
      if (seenSeed.has(key)) continue
      seenSeed.add(key)
      compass_seed.push({ kind: item.kind, statement, quote })
      if (compass_seed.length >= COMPASS_SEED_MAX) break
    }
  }

  return {
    title,
    body,
    constraints,
    anchor_candidates,
    references: referencesFrom(source),
    compass_seed,
  }
}

/** The four questions, verbatim from the brief (10.2). */
export const FOUR_QUESTIONS = [
  'What is it?',
  'Who is it for, and what should it do to them?',
  'What will you not do in it?',
  'What must it keep, whatever happens?',
] as const

/** The person's input as one text, for verbatim checks and the prompt. */
export function sourceText(mode: 'brief' | 'questions', brief: string | undefined, answers: readonly string[] | undefined): string {
  if (mode === 'brief') return (brief ?? '').trim()
  return (answers ?? []).map((a) => a.trim()).join('\n')
}
