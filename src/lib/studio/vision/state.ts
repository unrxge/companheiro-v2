// What a project keeps about its vision, read out of studio_projects.settings
// whatever state the row is in. Pure, so the browser can read it from the
// project it already holds (the concept on the writing page does) and the
// server can read it before changing it (store.ts).

import { EMPTY_VISION, isConceptField, type ConceptChange, type Gap, type KeptLine, type PendingChange, type Reading, type VisionState } from './types'

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-max) : [])

function cleanKept(raw: unknown): KeptLine[] {
  if (!Array.isArray(raw)) return []
  const out: KeptLine[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const k = r as Record<string, unknown>
    if (!str(k.id) || !str(k.text)) continue
    out.push({
      id: str(k.id),
      kind: k.kind === 'open' ? 'open' : 'decision',
      node_id: str(k.node_id) || null,
      text: str(k.text),
      why: str(k.why),
      quote: str(k.quote),
      at: str(k.at),
      state: k.state === 'kept' ? 'kept' : 'pending',
    })
  }
  return out
}

function cleanReading(raw: unknown): Reading | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!str(r.at)) return null
  const gaps: Gap[] = (Array.isArray(r.gaps) ? r.gaps : [])
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .map((g) => ({ id: str(g.id), text: str(g.text), where: strs(g.where, 6) }))
    .filter((g) => g.id && g.text)
  return { at: str(r.at), statement: str(r.statement), gaps, signature: str(r.signature) }
}

function cleanChanges(raw: unknown): ConceptChange[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .filter((r) => str(r.id) && str(r.node_id) && (isConceptField(r.field) || r.field === 'open_threads'))
    .map((r) => ({
      id: str(r.id), node_id: str(r.node_id), field: r.field as ConceptChange['field'], from: str(r.from), to: str(r.to), at: str(r.at),
      source: r.source === 'talk' || r.source === 'room' ? r.source : 'concept',
    }))
}

function cleanPending(raw: unknown): PendingChange[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .filter((r) => str(r.id) && str(r.node_id) && (isConceptField(r.field) || r.field === 'open_threads') && (str(r.to) || r.field === 'open_threads'))
    .map((r) => ({ id: str(r.id), node_id: str(r.node_id), field: r.field as PendingChange['field'], to: str(r.to), reason: str(r.reason), quote: str(r.quote), at: str(r.at) }))
}

/** The vision part of a project's settings, whatever state the row is in. */
export function visionOf(settings: unknown): VisionState {
  const v = settings && typeof settings === 'object' ? (settings as { vision?: unknown }).vision : null
  if (!v || typeof v !== 'object') return { ...EMPTY_VISION }
  const s = v as Record<string, unknown>
  return {
    kept: cleanKept(s.kept),
    declined: strs(s.declined, 60),
    reading: cleanReading(s.reading),
    gaps_dismissed: strs(s.gaps_dismissed, 60),
    changes: cleanChanges(s.changes),
    pending_changes: cleanPending(s.pending_changes),
  }
}
