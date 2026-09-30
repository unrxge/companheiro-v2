// What people say about their work sometimes sets a rule for it — "no
// nostalgia in this", "the ending stays open". This finds those, in their own
// words, and holds them as proposals. Nothing becomes a rule until they keep
// it; a declined line is never proposed again.
//
// Proposals live in studio_compass_entries (status pending → active when kept,
// rejected when declined), the table the old canvas model built for exactly
// this lifecycle. A kept proposal is written into the rules array of the
// piece it was said about, or the project's, where the boundary checks
// (nodes/[nodeId]/check) already read it. The piece it belongs to travels in
// evidence[0].node_id, so no schema change was needed.

import type { AuthedContext } from '@/lib/supabase/route'
import { anthropic } from '@/lib/anthropic'
import { MODELS } from '@/lib/models'
import { logUsage } from '@/lib/usage-log'
import { badRequest, conflict, fromDbError, notFound, nowIso } from '@/lib/studio/db'
import { firstText, parseJsonObject } from '@/lib/studio/talk/sort'
import { isVerbatim, normalise } from '@/lib/studio/talk/verbatim'
import type { Rule } from '@/lib/studio/node-types'
import { newRule } from '@/lib/studio/tree'

export type ProposalSource = 'talk' | 'check-in'

export interface RuleProposal {
  id: string
  project_id: string
  /** The piece or part it was said about; null for the whole project. */
  node_id: string | null
  kind: 'refusal' | 'non_negotiable'
  statement: string
  quote: string
  source: ProposalSource
  created_at: string
}

interface Evidence {
  quote: string
  at: string
  node_id: string | null
  message_id: string | null
  source: ProposalSource
}

interface EntryRow {
  id: string
  project_id: string
  kind: string
  statement: string
  status: string
  evidence: unknown
  created_at: string
}

/** Waiting proposals per conversation; the oldest beyond this quietly expire. */
const PENDING_PER_SCOPE = 3
const MIN_WORDS = 4

const SYSTEM = `You read one thing a person just said about a piece of work they are making. You return JSON only: no prose, no code fence.

You are looking for exactly one kind of thing: a rule they have just set for this work, in their own words. Two shapes count:
- a refusal: a boundary about this work — "I won't…", "no nostalgia in this", "never explain the ending", "não quero…".
- a must-keep: something the work has to hold on to — "it has to stay in Portuguese", "the ending stays open", "tem de…".

A feeling, a doubt, a wish, a plan for today, an account of what happened, or a question is NOT a rule. Something they are unsure about is not a rule. Most of what people say holds no rule at all; an empty list is the usual and correct answer.

Quote them. "quote" must be their exact words, copied character for character from THE WORDS as one contiguous span. "rule" is that rule as one short present-tense line that keeps their words wherever it can, under fourteen words. Never invent one, never make it stronger or tidier than they said it.

Skip anything that restates a line under RULES ALREADY SET, WAITING FOR THEM, or ALREADY DECLINED.

At most two. Output exactly:
{"rules": [{"kind": "refusal" | "must_keep", "rule": "…", "quote": "…"}]}`

function evidenceOf(row: EntryRow): Evidence | null {
  const list = Array.isArray(row.evidence) ? row.evidence : []
  const first = list[0] as Partial<Evidence> | undefined
  if (!first || typeof first !== 'object') return null
  return {
    quote: typeof first.quote === 'string' ? first.quote : '',
    at: typeof first.at === 'string' ? first.at : row.created_at,
    node_id: typeof first.node_id === 'string' ? first.node_id : null,
    message_id: typeof first.message_id === 'string' ? first.message_id : null,
    source: first.source === 'check-in' ? 'check-in' : 'talk',
  }
}

function toProposal(row: EntryRow): RuleProposal {
  const ev = evidenceOf(row)
  return {
    id: row.id,
    project_id: row.project_id,
    node_id: ev?.node_id ?? null,
    kind: row.kind === 'non_negotiable' ? 'non_negotiable' : 'refusal',
    statement: row.statement,
    quote: ev?.quote ?? '',
    source: ev?.source ?? 'talk',
    created_at: row.created_at,
  }
}

async function projectEntries(auth: AuthedContext, projectId: string): Promise<EntryRow[]> {
  const { data, error } = await auth.supabase
    .from('studio_compass_entries')
    .select('id, project_id, kind, statement, status, evidence, created_at')
    .eq('project_id', projectId)
    .eq('user_id', auth.user.id)
    .in('kind', ['refusal', 'non_negotiable'])
    .in('status', ['pending', 'rejected'])
    .order('created_at', { ascending: false })
    .limit(60)
  if (error) throw fromDbError(error)
  return (data as EntryRow[] | null) ?? []
}

/** Proposals still waiting for an answer in one conversation (a piece's, or the whole project's). */
export async function listPending(auth: AuthedContext, projectId: string, nodeId: string | null): Promise<RuleProposal[]> {
  const rows = await projectEntries(auth, projectId)
  return rows
    .filter((r) => r.status === 'pending')
    .map(toProposal)
    .filter((p) => p.node_id === nodeId)
    .reverse()
}

/**
 * Reads what they said for rules they set, and stores any as pending.
 * `rulesInForce` is every live rule over this conversation, so a restatement
 * is never proposed. Returns only the new proposals.
 */
export async function proposeRules(
  auth: AuthedContext,
  args: {
    projectId: string
    nodeId: string | null
    text: string
    intent: string
    rulesInForce: string[]
    messageId: string | null
    source: ProposalSource
  },
): Promise<RuleProposal[]> {
  const text = args.text.trim()
  if (text.split(/\s+/).length < MIN_WORDS) return []

  const rows = await projectEntries(auth, args.projectId)
  const pending = rows.filter((r) => r.status === 'pending').map((r) => r.statement)
  const declined = rows.filter((r) => r.status === 'rejected').map((r) => r.statement)
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '(none)')

  const res = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 400,
    temperature: 0,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        `WHAT THE WORK IS FOR: ${args.intent.trim() || '(not written yet)'}`,
        `RULES ALREADY SET:\n${list(args.rulesInForce)}`,
        `WAITING FOR THEM:\n${list(pending)}`,
        `ALREADY DECLINED:\n${list(declined)}`,
        `THE WORDS:\n${text}`,
      ].join('\n\n'),
    }],
  })
  logUsage(auth.user.id, 'studio/rule-proposals', res.model, res.usage, { source: args.source })

  const raw = parseJsonObject(firstText(res.content as Array<{ type: string; text?: string }>))
  const items = raw && typeof raw === 'object' && Array.isArray((raw as { rules?: unknown }).rules)
    ? (raw as { rules: unknown[] }).rules
    : []

  const known = new Set([...args.rulesInForce, ...pending, ...declined].map(normalise))
  const fresh: Array<{ kind: 'refusal' | 'non_negotiable'; statement: string; quote: string }> = []
  for (const item of items.slice(0, 2)) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const statement = typeof rec.rule === 'string' ? rec.rule.replace(/\s+/g, ' ').trim().replace(/\.$/, '') : ''
    const quote = typeof rec.quote === 'string' ? rec.quote.trim() : ''
    if (!statement || statement.length > 160 || !quote) continue
    // Their words or nothing: a paraphrased quote means the rule is ours, not theirs.
    if (!isVerbatim(quote, text)) continue
    if (known.has(normalise(statement))) continue
    known.add(normalise(statement))
    fresh.push({ kind: rec.kind === 'must_keep' ? 'non_negotiable' : 'refusal', statement, quote })
  }
  if (fresh.length === 0) return []

  const at = nowIso()
  const { data, error } = await auth.supabase
    .from('studio_compass_entries')
    .insert(fresh.map((f) => ({
      user_id: auth.user.id,
      project_id: args.projectId,
      kind: f.kind,
      statement: f.statement,
      proposed_statement: f.statement,
      status: 'pending',
      evidence: [{ quote: f.quote, at, node_id: args.nodeId, message_id: args.messageId, source: args.source } satisfies Evidence],
    })))
    .select('id, project_id, kind, statement, status, evidence, created_at')
  if (error) throw fromDbError(error)

  // Only a few wait at once per conversation; older unanswered ones expire.
  const waiting = [...(data as EntryRow[]), ...rows.filter((r) => r.status === 'pending')]
    .filter((r) => (evidenceOf(r)?.node_id ?? null) === args.nodeId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const expired = waiting.slice(PENDING_PER_SCOPE).map((r) => r.id)
  if (expired.length) {
    await auth.supabase
      .from('studio_compass_entries')
      .update({ status: 'dormant', rejection_note: 'expired', forgotten_at: at })
      .in('id', expired)
  }

  return ((data as EntryRow[] | null) ?? []).map(toProposal).filter((p) => !expired.includes(p.id))
}

/**
 * The person's answer. Keeping writes the rule (with their edit, if they made
 * one) onto the piece it was said about, or the project; declining makes sure
 * it is never proposed again.
 */
export async function decideProposal(
  auth: AuthedContext,
  entryId: string,
  action: 'keep' | 'decline',
  editedText?: string,
): Promise<{ rule: Rule | null; target: 'node' | 'project' | null }> {
  const { data, error } = await auth.supabase
    .from('studio_compass_entries')
    .select('id, project_id, kind, statement, status, evidence, created_at')
    .eq('id', entryId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) throw fromDbError(error)
  if (!data) throw notFound()
  const row = data as EntryRow
  if (row.status !== 'pending') throw conflict('already answered')

  if (action === 'decline') {
    const { error: e } = await auth.supabase
      .from('studio_compass_entries')
      .update({ status: 'rejected', decided_at: nowIso() })
      .eq('id', row.id)
    if (e) throw fromDbError(e)
    return { rule: null, target: null }
  }

  const text = (editedText ?? row.statement).replace(/\s+/g, ' ').trim()
  if (!text) throw badRequest('the rule needs words')
  if (text.length > 400) throw badRequest('keep the rule short')
  const rule = newRule(text)
  const nodeId = evidenceOf(row)?.node_id ?? null

  let target: 'node' | 'project' = 'project'
  if (nodeId) {
    const { data: node } = await auth.supabase
      .from('studio_nodes')
      .select('id, rules')
      .eq('id', nodeId)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (node) {
      const rules = Array.isArray(node.rules) ? (node.rules as Rule[]) : []
      const { error: e } = await auth.supabase.from('studio_nodes').update({ rules: [...rules, rule] }).eq('id', nodeId)
      if (e) throw fromDbError(e)
      target = 'node'
    }
  }
  if (target === 'project') {
    const { data: project, error: pe } = await auth.supabase
      .from('studio_projects')
      .select('id, rules')
      .eq('id', row.project_id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (pe) throw fromDbError(pe)
    if (!project) throw notFound()
    const rules = Array.isArray(project.rules) ? (project.rules as Rule[]) : []
    const { error: e } = await auth.supabase.from('studio_projects').update({ rules: [...rules, rule] }).eq('id', row.project_id)
    if (e) throw fromDbError(e)
  }

  const { error: e } = await auth.supabase
    .from('studio_compass_entries')
    .update({ status: 'active', statement: text, decided_at: nowIso() })
    .eq('id', row.id)
  if (e) throw fromDbError(e)
  return { rule, target }
}
