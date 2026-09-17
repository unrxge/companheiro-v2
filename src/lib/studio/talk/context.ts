// studio/src/lib/studio/talk/context.ts — the only path from the project into a
// prompt (8.4, D-059). `readable()` is the choke point: it accepts a block and
// returns a CompanionReadable or null, and nothing else about a block ever reaches
// a model — no url, no asset id, no storage path, no swatch, no draft prose.

import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import type { AuthedContext } from '@/lib/supabase/route'
import type {
  AnyBlock, Asset, Catch, CompanionReadable, CompassEntry, ConceptRevision, Project, TalkEntry, TalkKind,
} from '@/lib/studio/types'
import { fromDbError, latestConcept } from '@/lib/studio/db'
import { getActiveCompass } from '@/lib/studio/compass'
import { formatPortraitForPrompt, getActivePortrait } from '@/lib/studio/portrait-read'
import { daysAgoWords, shortDateLower } from '@/lib/studio/since'

export interface TalkContext {
  /** The context text that goes into the reply's system prompt (stable-first). */
  text: string
  /** The last 20 entries of the same kind, as alternating messages. */
  priorTurns: MessageParam[]
  commitmentToAsk: CompassEntry | null
  /** Active, fresh refusals / non-negotiables / drift / commitments (decayed ones excluded). */
  active: CompassEntry[]
  pending: CompassEntry[]
  /** Statements the person rejected: never re-proposed. */
  rejected: string[]
  /** Active, unresolved commitments (fresh or faded). */
  openCommitments: CompassEntry[]
  recentUpdates: Array<{ text: string; at: string }>
  /** The compact context the sorter reads (concept, compass with ids, rejected). */
  sortText: string
  /** The last person entry before this one (the sweep and the ask rule use it). */
  lastPersonAt: string | null
}

const OWN_WORDS_CAP = 2000
const PRIOR_TURNS = 20
const ASK_AFTER_DAYS = 2

// ── the choke point ─────────────────────────────────────────────────────────

type AssetLike = Pick<Asset, 'id' | 'own_voice' | 'transcript'>

/**
 * What the companion may read of one block. Titles of reference pages are the
 * title the person typed; the page is never fetched. Recordings yield the
 * transcript only when the asset is the person's own voice (the DB forbids the
 * other case anyway). Struck blocks keep their sentence so they are listed as struck.
 */
export function readable(block: AnyBlock, assets: Map<string, AssetLike>): CompanionReadable | null {
  if (block.deleted_at) return null
  const struck = block.struck_at ? (block.struck_by ?? '') : null
  switch (block.type) {
    case 'update': {
      const text = block.content.text?.trim()
      if (!text) return null
      return { type: 'update', text, at: block.content.said_at || block.created_at, struck }
    }
    case 'anchor': {
      const text = block.content.text?.trim()
      if (!text) return null
      return { type: 'anchor', text, struck }
    }
    case 'note': {
      const text = block.content.text?.trim()
      if (!text) return null
      return { type: 'note', text, struck }
    }
    case 'reference': {
      const title = block.content.title?.trim() ?? ''
      const note = block.content.note?.trim() ?? ''
      if (!title && !note) return null
      return { type: 'reference', title, note, struck }
    }
    case 'heading': {
      const text = block.content.text?.trim()
      if (!text) return null
      return { type: 'heading', text }
    }
    case 'image': {
      const caption = block.content.caption?.trim()
      if (!caption) return null
      return { type: 'image', captions: [caption] }
    }
    case 'gallery': {
      const captions = block.content.items.map((i) => i.caption?.trim()).filter((c): c is string => Boolean(c))
      if (captions.length === 0) return null
      return { type: 'image', captions }
    }
    case 'recording': {
      const asset = assets.get(block.content.asset_id)
      const title = block.content.title?.trim() ?? ''
      const note = block.content.note?.trim() ?? ''
      const own_transcript = asset?.own_voice && asset.transcript ? asset.transcript.trim() || null : null
      if (!title && !note && !own_transcript) return null
      return { type: 'recording', title, note, own_transcript }
    }
    // commitments read from the compass (their statement lives there); the rest hold nothing readable
    case 'concept':
    case 'since':
    case 'timeline':
    case 'draft':
    case 'commitment':
    case 'compass':
    case 'frame':
    case 'divider':
    case 'palette':
    default:
      return null
  }
}

// ── loads ───────────────────────────────────────────────────────────────────

async function loadRevisions(auth: AuthedContext, projectId: string, n: number): Promise<ConceptRevision[]> {
  const { data, error } = await auth.supabase
    .from('studio_concept_revisions')
    .select('id, project_id, body, constraints, origin, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(n)
  if (error) throw fromDbError(error)
  return ((data as ConceptRevision[] | null) ?? []).map((r) => ({ ...r, constraints: Array.isArray(r.constraints) ? r.constraints : [] }))
}

async function loadRejected(auth: AuthedContext, projectId: string): Promise<string[]> {
  const { data, error } = await auth.supabase
    .from('studio_compass_entries')
    .select('proposed_statement, statement')
    .eq('project_id', projectId)
    .eq('status', 'rejected')
    .order('decided_at', { ascending: false })
    .limit(30)
  if (error) throw fromDbError(error)
  const out = new Set<string>()
  for (const r of (data as Array<{ proposed_statement: string; statement: string }> | null) ?? []) {
    if (r.proposed_statement) out.add(r.proposed_statement)
    if (r.statement) out.add(r.statement)
  }
  return [...out]
}

async function loadWrongCatches(auth: AuthedContext, projectId: string): Promise<Catch[]> {
  const { data, error } = await auth.supabase
    .from('studio_catches')
    .select('*')
    .eq('project_id', projectId)
    .eq('mark', 'wrong')
    .order('marked_at', { ascending: false })
    .limit(5)
  if (error) throw fromDbError(error)
  return (data as Catch[] | null) ?? []
}

async function loadLiveBlocks(auth: AuthedContext, projectId: string): Promise<AnyBlock[]> {
  const { data, error } = await auth.supabase
    .from('studio_blocks')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw fromDbError(error)
  return (data as AnyBlock[] | null) ?? []
}

/** Only the three columns readable() needs; storage paths never leave the DB here. */
async function loadAssetsLite(auth: AuthedContext, projectId: string): Promise<Map<string, AssetLike>> {
  const { data, error } = await auth.supabase
    .from('studio_assets')
    .select('id, own_voice, transcript')
    .eq('project_id', projectId)
    .eq('kind', 'audio')
  if (error) throw fromDbError(error)
  const map = new Map<string, AssetLike>()
  for (const a of (data as AssetLike[] | null) ?? []) map.set(a.id, a)
  return map
}

async function loadPriorEntries(auth: AuthedContext, projectId: string, kind: TalkKind): Promise<TalkEntry[]> {
  const { data, error } = await auth.supabase
    .from('studio_talk_entries')
    .select('id, project_id, kind, role, input, text, reply_to, catch_id, sorted_at, truncated, created_at')
    .eq('project_id', projectId)
    .eq('kind', kind)
    .order('created_at', { ascending: false })
    .limit(PRIOR_TURNS)
  if (error) throw fromDbError(error)
  return (((data as TalkEntry[] | null) ?? [])).reverse()
}

// ── text assembly ───────────────────────────────────────────────────────────

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** One line per changed field between two revisions; the bodies themselves are not repeated. */
function revisionDiffLine(prev: ConceptRevision | undefined, cur: ConceptRevision): string {
  if (!prev) return 'first version'
  const parts: string[] = []
  if (prev.body !== cur.body) {
    const grew = cur.body.length - prev.body.length
    parts.push(grew > 0 ? 'the body grew' : grew < 0 ? 'the body was cut' : 'the body was reworded')
  }
  const added = cur.constraints.filter((c) => !prev.constraints.includes(c))
  const removed = prev.constraints.filter((c) => !cur.constraints.includes(c))
  if (added.length) parts.push(`added: ${added.map((c) => `“${clip(c, 80)}”`).join(', ')}`)
  if (removed.length) parts.push(`removed: ${removed.map((c) => `“${clip(c, 80)}”`).join(', ')}`)
  return parts.length ? parts.join('; ') : 'saved unchanged'
}

function conceptSection(concept: ConceptRevision, revisions: ConceptRevision[], kind: TalkKind, now: Date): string {
  const lines = ['CONCEPT (in their words):', concept.body.trim() || '(nothing written yet)']
  if (concept.constraints.length) {
    lines.push('', 'What it must keep:')
    for (const c of concept.constraints) lines.push(`- ${c}`)
  }
  if (kind === 'direction' && revisions.length > 0) {
    lines.push('', 'Concept edits, newest first (a dated edit is recalibration, not drift):')
    // revisions arrive newest first; diff each against the one before it in time
    for (let i = 0; i < revisions.length; i++) {
      const cur = revisions[i]
      const prev = revisions[i + 1]
      lines.push(`- ${shortDateLower(cur.created_at, now)} (${cur.origin}): ${revisionDiffLine(prev, cur)}`)
    }
  }
  return lines.join('\n')
}

const kindWord = (k: CompassEntry['kind']) => (k === 'non_negotiable' ? 'must keep' : k)

function compassSection(active: CompassEntry[], open: CompassEntry[], now: Date): string {
  const refusals = active.filter((e) => e.kind === 'refusal')
  const keeps = active.filter((e) => e.kind === 'non_negotiable')
  const drift = active.filter((e) => e.kind === 'drift')
  const lines = ['COMPASS (only what they confirmed; nothing here is yours):']
  if (!refusals.length && !keeps.length && !drift.length && !open.length) {
    lines.push('(empty so far)')
    return lines.join('\n')
  }
  const row = (e: CompassEntry) =>
    `- ${e.statement}${e.reinforcement_count > 1 ? ` (said ${e.reinforcement_count} times)` : ''}`
  if (refusals.length) lines.push('Refusals:', ...refusals.map(row))
  if (keeps.length) lines.push('Must keep:', ...keeps.map(row))
  if (drift.length) lines.push('Drift they confirmed:', ...drift.map(row))
  if (open.length) {
    lines.push('Open commitments:')
    for (const c of open) {
      const said = c.evidence[0]?.at ?? c.created_at
      const asked = c.ask_count > 0 ? `, asked about ${c.ask_count === 1 ? 'once' : `${c.ask_count} times`}` : ''
      lines.push(`- ${c.statement} (said ${daysAgoWords(said, now)}${asked})`)
    }
  }
  return lines.join('\n')
}

function wrongSection(wrong: Catch[]): string {
  if (wrong.length === 0) return ''
  return ['WHERE THEY MARKED YOU WRONG (do not repeat these readings):', ...wrong.map((c) => `- ${c.sentence}`)].join('\n')
}

function updatesSection(updates: Array<{ text: string; at: string }>, now: Date): string {
  if (updates.length === 0) return ''
  return ['THEIR LAST UPDATES, newest first:', ...updates.map((u) => `- ${shortDateLower(u.at, now)}: ${u.text}`)].join('\n')
}

function ownWordsSection(items: CompanionReadable[], now: Date): string {
  if (items.length === 0) return ''
  const lines: string[] = ['THEIR OWN WORDS ON THE PROJECT (you know only these words, never the things themselves):']
  const struckSuffix = (s: string | null) => (s === null ? '' : ` [struck through — “${s}”]`)
  let used = lines[0].length
  for (const r of items) {
    let line = ''
    switch (r.type) {
      case 'anchor': line = `- anchor line: ${r.text}${struckSuffix(r.struck)}`; break
      case 'note': line = `- note: ${r.text}${struckSuffix(r.struck)}`; break
      case 'reference': line = `- reference${r.title ? ` “${r.title}”` : ''}${r.note ? `: ${r.note}` : ''}${struckSuffix(r.struck)}`; break
      case 'heading': line = `- heading: ${r.text}`; break
      case 'image': line = `- image caption${r.captions.length > 1 ? 's' : ''}: ${r.captions.join(' / ')}`; break
      case 'recording':
        line = `- recording${r.title ? ` “${r.title}”` : ''}${r.note ? `: ${r.note}` : ''}${r.own_transcript ? ` — in their voice: ${clip(r.own_transcript, 400)}` : ''}`
        break
      case 'update': line = `- update (${shortDateLower(r.at, now)}): ${r.text}${struckSuffix(r.struck)}`; break
      case 'commitment': line = `- commitment (${shortDateLower(r.at, now)}): ${r.text}`; break
      case 'concept': continue
    }
    if (used + line.length + 1 > OWN_WORDS_CAP) {
      lines.push('- (more, not shown)')
      break
    }
    lines.push(line)
    used += line.length + 1
  }
  return lines.join('\n')
}

function sortSection(concept: ConceptRevision, active: CompassEntry[], pending: CompassEntry[], open: CompassEntry[], rejected: string[]): string {
  const lines: string[] = ['CONCEPT:', clip(concept.body.trim() || '(nothing written yet)', 1200)]
  if (concept.constraints.length) lines.push('MUST KEEP (from the concept):', ...concept.constraints.map((c) => `- ${c}`))
  const activeNonCommit = active.filter((e) => e.kind !== 'commitment')
  lines.push('', 'ACTIVE COMPASS ENTRIES (id · kind · statement):')
  if (activeNonCommit.length === 0) lines.push('(none)')
  for (const e of activeNonCommit) lines.push(`- ${e.id} · ${kindWord(e.kind)} · ${e.statement}`)
  lines.push('', 'PENDING PROPOSALS, not yet confirmed (id · kind · statement):')
  if (pending.length === 0) lines.push('(none)')
  for (const e of pending) lines.push(`- ${e.id} · ${kindWord(e.kind)} · ${e.statement}`)
  lines.push('', 'OPEN COMMITMENTS (id · statement):')
  if (open.length === 0) lines.push('(none)')
  for (const c of open) lines.push(`- ${c.id} · ${c.statement}`)
  lines.push('', 'REJECTED — never propose these again:')
  if (rejected.length === 0) lines.push('(none)')
  for (const r of rejected) lines.push(`- ${r}`)
  return lines.join('\n')
}

/** Alternating person → user / companion → assistant; consecutive same-role turns are joined; must start with the person. */
export function toPriorTurns(entries: TalkEntry[]): MessageParam[] {
  const out: MessageParam[] = []
  for (const e of entries) {
    const text = e.text.trim()
    if (!text) continue
    const role: MessageParam['role'] = e.role === 'person' ? 'user' : 'assistant'
    if (out.length === 0 && role === 'assistant') continue
    const last = out[out.length - 1]
    if (last && last.role === role && typeof last.content === 'string') {
      out[out.length - 1] = { role, content: `${last.content}\n\n${text}` }
    } else {
      out.push({ role, content: text })
    }
  }
  // the new entry is a user turn, so the history must end with the assistant
  if (out.length > 0 && out[out.length - 1].role === 'user') out.pop()
  return out
}

/**
 * Which open commitment, if any, the reply may ask about: active, unresolved,
 * never asked or asked more than 2 days ago, said before the previous talk
 * (so nothing they just said is asked back), oldest asked_at first (nulls first).
 */
export function pickCommitmentToAsk(open: CompassEntry[], lastPersonAt: string | null, now: Date): CompassEntry | null {
  if (!lastPersonAt) return null
  const cutoff = now.getTime() - ASK_AFTER_DAYS * 86400000
  const due = open.filter((c) => {
    if (c.status !== 'active' || c.resolution) return false
    if (c.created_at >= lastPersonAt) return false
    if (!c.asked_at) return true
    const t = new Date(c.asked_at).getTime()
    return Number.isFinite(t) && t < cutoff
  })
  due.sort((a, b) => {
    if (!a.asked_at && b.asked_at) return -1
    if (a.asked_at && !b.asked_at) return 1
    if (a.asked_at && b.asked_at && a.asked_at !== b.asked_at) return a.asked_at < b.asked_at ? -1 : 1
    return a.created_at < b.created_at ? -1 : 1
  })
  return due[0] ?? null
}

// ── the builder ─────────────────────────────────────────────────────────────

export async function buildTalkContext(auth: AuthedContext, project: Project, kind: TalkKind, now: Date = new Date()): Promise<TalkContext> {
  const [concept, revisions, compass, rejected, wrong, blocks, assets, prior, portrait] = await Promise.all([
    latestConcept(auth, project),
    kind === 'direction' ? loadRevisions(auth, project.id, 4) : Promise.resolve([] as ConceptRevision[]),
    getActiveCompass(auth, project.id, now),
    loadRejected(auth, project.id),
    loadWrongCatches(auth, project.id),
    loadLiveBlocks(auth, project.id),
    loadAssetsLite(auth, project.id),
    loadPriorEntries(auth, project.id, kind),
    getActivePortrait(auth).catch((e: unknown) => {
      console.error('[studio] portrait read:', e)
      return []
    }),
  ])

  // updates (including stacked rows) newest first, capped at 10
  const recentUpdates = blocks
    .filter((b): b is Extract<AnyBlock, { type: 'update' }> => b.type === 'update' && !b.struck_at)
    .map((b) => ({ text: b.content.text.trim(), at: b.content.said_at || b.created_at }))
    .filter((u) => u.text.length > 0)
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, 10)

  // the person's own words: everything readable except updates (listed above), in canvas order (created asc)
  const ownWords: CompanionReadable[] = []
  for (const b of [...blocks].reverse()) {
    if (b.type === 'update') continue
    const r = readable(b, assets)
    if (r) ownWords.push(r)
  }

  const lastPerson = [...prior].reverse().find((e) => e.role === 'person') ?? null
  const lastPersonAt = lastPerson?.created_at ?? null
  const commitmentToAsk = kind === 'talk' ? pickCommitmentToAsk(compass.openCommitments, lastPersonAt, now) : null

  const sections = [
    conceptSection(concept, revisions.slice(0, 3), kind, now),
    compassSection(compass.active, compass.openCommitments, now),
    wrongSection(wrong),
    updatesSection(recentUpdates, now),
    ownWordsSection(ownWords, now),
    formatPortraitForPrompt(portrait),
  ].filter((s) => s.length > 0)

  return {
    text: sections.join('\n\n'),
    priorTurns: toPriorTurns(prior),
    commitmentToAsk,
    active: compass.active,
    pending: compass.pending,
    rejected,
    openCommitments: compass.openCommitments,
    recentUpdates,
    sortText: sortSection(concept, compass.active, compass.pending, compass.openCommitments, rejected),
    lastPersonAt,
  }
}
