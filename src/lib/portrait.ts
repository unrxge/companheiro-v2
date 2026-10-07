import { anthropic } from './anthropic'
import { MODELS } from './models'
import { logUsage } from './usage-log'
import type { AuthedContext } from './supabase/route'

import { DECAY_DAYS } from './portrait-kinds'

// Per section. The portrait is something people come to read about
// themselves, so each section keeps room for a real body of evidence.
const ACTIVE_PER_KIND_CAP = 10

export type PortraitSource = 'check_in' | 'conceptualise' | 'zoom_out' | 'writing'
export type PortraitKind =
  | 'processing_pattern'
  | 'recurring_theme'
  | 'creative_pattern'
  | 'guidance_note'

export interface PortraitEntry {
  id: string
  kind: PortraitKind
  statement: string
  status: 'pending' | 'active' | 'rejected' | 'dormant'
  reinforcement_count: number
  last_reinforced_at: string
  /** When it was first noticed. */
  created_at?: string
}

function decayCutoff(): string {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - DECAY_DAYS)
  return cutoff.toISOString()
}

export interface CheckInPattern {
  id: string
  kind: PortraitKind
  statement: string
}

// The evidence table arrives with migration 033. Until it is applied every
// read answers empty and every write is skipped, so nothing else breaks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const evidence = (supabase: AuthedContext['supabase']) => (supabase as any).from('portrait_evidence')

// Patterns noticed in each of the given check-ins. Only entries the portrait
// page itself would show (active and not decayed) are returned: a pattern the
// person has forgotten, or that has faded, disappears here too.
export async function patternsForCheckIns(
  { supabase, user }: AuthedContext,
  checkInIds: string[]
): Promise<Record<string, CheckInPattern[]>> {
  if (checkInIds.length === 0) return {}
  const { data, error } = await evidence(supabase)
    .select('check_in_id, portrait_entries!inner(id, kind, statement, status, last_reinforced_at)')
    .eq('user_id', user.id)
    .in('check_in_id', checkInIds)
  if (error || !data) return {}

  const cutoff = decayCutoff()
  const out: Record<string, CheckInPattern[]> = {}
  for (const row of data as Array<{ check_in_id: string; portrait_entries: PortraitEntry }>) {
    const e = row.portrait_entries
    if (!e || e.status !== 'active' || e.last_reinforced_at < cutoff) continue
    ;(out[row.check_in_id] ??= []).push({ id: e.id, kind: e.kind, statement: e.statement })
  }
  return out
}

// When each portrait entry was noticed in a check-in, newest first.
export async function checkInDatesForEntries(
  { supabase, user }: AuthedContext,
  entryIds: string[]
): Promise<Record<string, string[]>> {
  if (entryIds.length === 0) return {}
  const { data, error } = await evidence(supabase)
    .select('entry_id, check_ins!inner(created_at)')
    .eq('user_id', user.id)
    .in('entry_id', entryIds)
  if (error || !data) return {}

  const out: Record<string, string[]> = {}
  for (const row of data as Array<{ entry_id: string; check_ins: { created_at: string } }>) {
    ;(out[row.entry_id] ??= []).push(row.check_ins.created_at)
  }
  for (const id of Object.keys(out)) out[id].sort().reverse()
  return out
}

// Reads the undecayed active portrait for injection into a conversation.
export async function getActivePortrait(
  { supabase, user }: AuthedContext
): Promise<PortraitEntry[]> {
  const { data } = await supabase
    .from('portrait_entries')
    .select('id, kind, statement, status, reinforcement_count, last_reinforced_at, created_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gte('last_reinforced_at', decayCutoff())
    .order('reinforcement_count', { ascending: false })

  return data || []
}

// Formats the active portrait for a system prompt. Adapts strategy, never voice.
export function formatPortraitForPrompt(entries: PortraitEntry[]): string {
  if (entries.length === 0) return ''

  const lines = entries.map((e) => `- [${e.kind}] ${e.statement}`)
  return `WHO THIS PERSON IS (patterns observed from working with them over time — use these to adapt your STRATEGY: which questions you ask, when to challenge vs. hold, which pattern to name first, and how to deliver it so it actually reaches them. Adapting delivery to the person is the point of knowing them. What these must never do is buy silence: never use them to withhold a hard truth, to flatter, or to tell them only the version they would like to hear):\n${lines.join('\n')}`
}

const DISTILL_SYSTEM_PROMPT = `You are a quiet observer distilling what a piece of material reveals about a specific person — how they process things, what keeps recurring, how they approach ideas, and what kind of guidance actually reaches them.

You are given the person's EXISTING confirmed portrait (things already established about them) and NEW material from a session. Your job:

1. Decide if this material reinforces an existing entry (list its id in reinforce_ids) — genuinely the same pattern showing up again, not just a loose theme.
2. Decide if this material reveals something genuinely NEW and significant enough to remember — not every session reveals something. Most sessions should produce nothing new. Only propose an entry if it's a real, specific, reusable insight — never a generic restatement of what they said.

For "guidance_note" entries specifically: capture BOTH what kind of framing/question/challenge lands AND what gets deflected or resisted — never only the flattering half. A guidance note that only says what pleases them is worthless and dangerous.

When the material is a conversation, it contains evidence about tone that nobody will ever report directly — read it. Look at what the companion did and what happened next: after a challenge, did they open into it, or did their answers get shorter, flatter, more agreeable? Did being met first let them say the harder thing a turn later? Did a question get answered or sidestepped? Did they correct the companion's read, and was the correction a small adjustment or a flat no?

Two hard constraints on this. Judge by what MOVED them, not by what they liked — someone going quiet after an accurate challenge may have been reached harder than someone who thanked you for a comfortable one, and a note that steers toward comfort would quietly disable the thing that makes this useful. And write it as a note about approach, never about character: "goes abstract when pressed on the family material, comes back if given a turn" is usable; "is avoidant" is a verdict and will do damage every time it is injected into a future session.

Kinds:
- processing_pattern: how they process/react to things emotionally (e.g. "intellectualizes first, feels it a day later")
- recurring_theme: a topic or tension that keeps returning (e.g. "the question of whether ambition and rest can coexist keeps resurfacing")
- creative_pattern: how they approach ideation/development (e.g. "resists structure early, needs to circle an idea loosely before committing")
- guidance_note: what kind of companioning strategy actually works or doesn't (e.g. "direct challenge lands; open 'how does that feel' questions get deflected")

How to word a statement. The person will read these about themselves, and they are carried into every future conversation:
- Refer to the person as "they" / "them" / "their". Never "she", "he", "her", "his", whatever the material suggests.
- Refer to other people by their role in the person's life ("a partner", "a parent", "a manager", "a friend"), never by name. Use a specific role only when the material states the relationship; otherwise "someone close to them". Never guess a relationship.
- Before proposing a new entry, check it is not a rewording of an existing one. If it is the same pattern, reinforce the existing entry instead.

Be conservative. A wrong or premature entry is worse than no entry. Return ONLY entries you'd stake real confidence on.

Return as JSON:
{
  "reinforce_ids": ["<id>", ...],
  "new_entries": [{ "kind": "processing_pattern" | "recurring_theme" | "creative_pattern" | "guidance_note", "statement": "one clear sentence" }]
}
If nothing qualifies, return { "reinforce_ids": [], "new_entries": [] }.`

// Keeps each section within its cap by retiring its weakest entries (least
// reinforced, then longest since last seen). Retires as many as it takes:
// trimming one per call let the portrait drift far past its limit.
async function enforceActiveCap({ supabase, user }: AuthedContext): Promise<void> {
  const { data: active } = await supabase
    .from('portrait_entries')
    .select('id, kind, reinforcement_count, last_reinforced_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
  if (!active) return

  const retire = overCap(active)
  if (retire.length === 0) return
  await supabase.from('portrait_entries').update({ status: 'dormant' }).in('id', retire).eq('user_id', user.id)
}

export function overCap(
  active: Array<{ id: string; kind: string; reinforcement_count: number; last_reinforced_at: string }>,
  cap = ACTIVE_PER_KIND_CAP
): string[] {
  const byKind = new Map<string, typeof active>()
  for (const e of active) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e])
  const retire: string[] = []
  for (const list of byKind.values()) {
    const strongestFirst = [...list].sort(
      (a, b) =>
        b.reinforcement_count - a.reinforcement_count ||
        new Date(b.last_reinforced_at).getTime() - new Date(a.last_reinforced_at).getTime()
    )
    retire.push(...strongestFirst.slice(cap).map((e) => e.id))
  }
  return retire
}

// Proposes 0-2 new portrait entries and/or reinforces existing ones based on
// fresh material, activating new entries immediately — no confirmation gate,
// per user request. Called after check-in log, core-concept save, trajectory
// commit, and write-chat distillation. Never blocks on failure — this is
// enrichment, not core.
export async function distillPortrait(
  auth: AuthedContext,
  source: PortraitSource,
  material: string,
  // The check-in this material is, when it is one: every entry created or
  // reinforced from it is linked back, so the check-in can show its patterns.
  checkInId?: string | null
): Promise<void> {
  if (!material?.trim()) return

  const { supabase, user } = auth

  try {
    const { data: existing } = await supabase
      .from('portrait_entries')
      .select('id, kind, statement')
      .eq('user_id', user.id)
      .eq('status', 'active')

    const existingBlock =
      existing && existing.length > 0
        ? existing.map((e) => `[${e.id}] (${e.kind}) ${e.statement}`).join('\n')
        : '(none yet — this is early material)'

    // Upgraded from the fast model: this is the one place a wrong entry
    // repeats itself into every future conversation, and its own prompt
    // already says a wrong or premature entry is worse than none — the
    // judgement that guards against that (distinguishing what moved someone
    // from what merely pleased them, never writing a verdict about their
    // character) is exactly what the smaller model does less reliably. It
    // runs at most a few times per session, so the cost difference is cents.
    const response = await anthropic.messages.create({
      model: MODELS.deep,
      max_tokens: 500,
      system: DISTILL_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `EXISTING PORTRAIT:\n${existingBlock}\n\nNEW MATERIAL (from ${source}):\n${material.slice(0, 6000)}`,
        },
      ],
    })

    logUsage(user.id, 'lib/portrait:distill', response.model, response.usage, { source })

    const textContent = response.content.find((b) => b.type === 'text')
    if (!textContent || textContent.type !== 'text') return

    const cleaned = textContent.text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as {
      reinforce_ids?: string[]
      new_entries?: Array<{ kind: PortraitKind; statement: string }>
    }

    // Leaving a check-in can finalise it more than once (page hidden, then
    // closed). Entries already linked to this check-in have been counted.
    const alreadyLinked = new Set<string>()
    if (checkInId) {
      const { data: links } = await evidence(supabase).select('entry_id').eq('check_in_id', checkInId)
      for (const l of (links ?? []) as Array<{ entry_id: string }>) alreadyLinked.add(l.entry_id)
    }
    const seenHere: string[] = []

    if (parsed.reinforce_ids?.length) {
      for (const id of new Set(parsed.reinforce_ids)) {
        const target = existing?.find((e) => e.id === id)
        if (!target || alreadyLinked.has(id)) continue
        await supabase.rpc('reinforce_portrait_entry', { p_entry_id: id })
        seenHere.push(id)
      }
    }

    // A second pass over the same check-in must not mint the same insight twice.
    if (parsed.new_entries?.length && !(checkInId && alreadyLinked.size > 0)) {
      const rows = parsed.new_entries.slice(0, 2).map((e) => ({
        user_id: user.id,
        kind: e.kind,
        statement: e.statement,
        source,
        status: 'active' as const,
      }))
      const { data: created } = await supabase.from('portrait_entries').insert(rows).select('id')
      for (const c of created ?? []) seenHere.push(c.id)
      await enforceActiveCap(auth)
    }

    if (checkInId && seenHere.length > 0) {
      const { error: linkError } = await evidence(supabase).upsert(
        seenHere.map((entry_id) => ({ user_id: user.id, entry_id, check_in_id: checkInId })),
        { onConflict: 'entry_id,check_in_id', ignoreDuplicates: true }
      )
      if (linkError) console.error('portrait evidence not recorded:', linkError.message)
    }
  } catch (error) {
    console.error('distillPortrait error:', error)
  }
}
