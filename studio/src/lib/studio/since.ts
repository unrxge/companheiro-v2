// studio/src/lib/studio/since.ts — since you were here (8.8, D-032). Deterministic:
// no model, no clock other than `now`. The since block (C), the phone strip (B)
// and the shelf card (A) all render what this returns; the talk drawer (G)
// recomputes it locally on every meta frame.

import type { SincePayload } from '@/lib/studio/types'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** `12 sep` (with the year only when it differs from `now`'s). */
export function shortDateLower(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/** Lowercase relative words: `just now`, `4 min ago`, `2 h ago`, `yesterday`, `3 days ago`, `12 sep`. */
export function relativeLower(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const s = Math.max(0, (now.getTime() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 2 * 86400) return 'yesterday'
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`
  return shortDateLower(iso, now)
}

/** Whole days between two instants, floored at 0. */
export function daysBetween(iso: string, now: Date = new Date()): number {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 0
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86400000))
}

/** `today`, `yesterday`, `n days ago` — for "said …" in prompts and rows. */
export function daysAgoWords(iso: string, now: Date = new Date()): string {
  const n = daysBetween(iso, now)
  if (n === 0) return 'today'
  if (n === 1) return 'yesterday'
  return `${n} days ago`
}

/** Trim a quoted span for the since line; the RPC already caps it at 140 chars. */
function quote(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > 120 ? `${one.slice(0, 119).trimEnd()}…` : one
}

/**
 * Up to three lines with a dot flag per line (a 6 px tide dot precedes a line
 * that has something waiting).
 *  1. `you last said “…” · 2 h ago` (direction talk names itself)
 *  2. `n arrived from talk` | `n waiting at the edge`
 *  3. `the compass has something` | `one thing to mark`
 * Only line 1 and nothing waiting → `· nothing new since {relative(cutoff)}` is appended.
 * `first time here` only when nothing has ever been said and nothing waits at all.
 */
export function sinceSentence(p: SincePayload, now: Date, firstOpen: boolean): { lines: string[]; dots: boolean[] } {
  const compassCount = Math.max(0, p.compass_pending) + Math.max(0, p.catches_unmarked)
  const nothingEverSaid = !p.last_said && p.arrived_since === 0 && p.waiting === 0
  if (firstOpen && nothingEverSaid && compassCount === 0) {
    return { lines: ['first time here'], dots: [false] }
  }

  const lines: string[] = []
  const dots: boolean[] = []

  if (p.last_said) {
    const where = p.last_said.kind === 'direction' ? 'in direction talk ' : ''
    lines.push(`you last said ${where}“${quote(p.last_said.text)}” · ${relativeLower(p.last_said.at, now)}`)
    dots.push(false)
  }

  if (p.arrived_since > 0) {
    lines.push(`${p.arrived_since} arrived from talk`)
    dots.push(true)
  } else if (p.waiting > 0) {
    lines.push(`${p.waiting} waiting at the edge`)
    dots.push(true)
  }

  if (compassCount > 0) {
    lines.push(p.compass_pending > 0 ? 'the compass has something' : 'one thing to mark')
    dots.push(true)
  }

  if (lines.length === 1 && p.last_said) {
    const since = relativeLower(p.cutoff, now)
    lines[0] = since ? `${lines[0]} · nothing new since ${since}` : `${lines[0]} · nothing new`
  }

  if (lines.length === 0) {
    // nothing said, nothing waiting, nothing in the compass, but not the first open (e.g. seeds decided)
    return { lines: ['first time here'], dots: [false] }
  }

  return { lines, dots }
}
