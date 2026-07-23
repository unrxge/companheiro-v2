import { anthropic } from './anthropic'
import { MODELS } from './models'
import type { AuthedContext } from './supabase/route'

const ACTIVE_ENTRY_CAP = 15
const DECAY_DAYS = 150

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
}

// Reads the confirmed, undecayed portrait for injection into a conversation.
// Everything here was explicitly confirmed by the user — never silent.
export async function getActivePortrait(
  { supabase, user }: AuthedContext
): Promise<PortraitEntry[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - DECAY_DAYS)

  const { data } = await supabase
    .from('portrait_entries')
    .select('id, kind, statement, status, reinforcement_count, last_reinforced_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .gte('last_reinforced_at', cutoff.toISOString())
    .order('reinforcement_count', { ascending: false })

  return data || []
}

// Formats the active portrait for a system prompt. Adapts strategy, never voice.
export function formatPortraitForPrompt(entries: PortraitEntry[]): string {
  if (entries.length === 0) return ''

  const lines = entries.map((e) => `- [${e.kind}] ${e.statement}`)
  return `WHO THIS PERSON IS (confirmed patterns from working with them over time — use these to adapt your STRATEGY: which questions you ask, when to challenge vs. hold, which pattern to name first. Never use these to soften the companion voice or avoid a hard truth):\n${lines.join('\n')}`
}

const DISTILL_SYSTEM_PROMPT = `You are a quiet observer distilling what a piece of material reveals about a specific person — how they process things, what keeps recurring, how they approach ideas, and what kind of guidance actually reaches them.

You are given the person's EXISTING confirmed portrait (things already established about them) and NEW material from a session. Your job:

1. Decide if this material reinforces an existing entry (list its id in reinforce_ids) — genuinely the same pattern showing up again, not just a loose theme.
2. Decide if this material reveals something genuinely NEW and significant enough to remember — not every session reveals something. Most sessions should produce nothing new. Only propose an entry if it's a real, specific, reusable insight — never a generic restatement of what they said.

For "guidance_note" entries specifically: capture BOTH what kind of framing/question/challenge lands AND what gets deflected or resisted — never only the flattering half. A guidance note that only says what pleases them is worthless and dangerous.

Kinds:
- processing_pattern: how they process/react to things emotionally (e.g. "intellectualizes first, feels it a day later")
- recurring_theme: a topic or tension that keeps returning (e.g. "the question of whether ambition and rest can coexist keeps resurfacing")
- creative_pattern: how they approach ideation/development (e.g. "resists structure early, needs to circle an idea loosely before committing")
- guidance_note: what kind of companioning strategy actually works or doesn't (e.g. "direct challenge lands; open 'how does that feel' questions get deflected")

Be conservative. A wrong or premature entry is worse than no entry. Return ONLY entries you'd stake real confidence on.

Return as JSON:
{
  "reinforce_ids": ["<id>", ...],
  "new_entries": [{ "kind": "processing_pattern" | "recurring_theme" | "creative_pattern" | "guidance_note", "statement": "one clear sentence" }]
}
If nothing qualifies, return { "reinforce_ids": [], "new_entries": [] }.`

// Proposes 0-2 new portrait entries and/or reinforces existing ones based on
// fresh material. Called after check-in log, core-concept save, and
// trajectory commit. Never blocks on failure — this is enrichment, not core.
export async function distillPortrait(
  auth: AuthedContext,
  source: PortraitSource,
  material: string
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

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 500,
      system: DISTILL_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `EXISTING PORTRAIT:\n${existingBlock}\n\nNEW MATERIAL (from ${source}):\n${material.slice(0, 6000)}`,
        },
      ],
    })

    const textContent = response.content.find((b) => b.type === 'text')
    if (!textContent || textContent.type !== 'text') return

    const cleaned = textContent.text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as {
      reinforce_ids?: string[]
      new_entries?: Array<{ kind: PortraitKind; statement: string }>
    }

    if (parsed.reinforce_ids?.length) {
      for (const id of parsed.reinforce_ids) {
        const target = existing?.find((e) => e.id === id)
        if (!target) continue
        await supabase.rpc('reinforce_portrait_entry', { p_entry_id: id })
      }
    }

    if (parsed.new_entries?.length) {
      const rows = parsed.new_entries.slice(0, 2).map((e) => ({
        user_id: user.id,
        kind: e.kind,
        statement: e.statement,
        source,
        status: 'pending' as const,
      }))
      await supabase.from('portrait_entries').insert(rows)
    }
  } catch (error) {
    console.error('distillPortrait error:', error)
  }
}

// Promotes a pending entry to active, enforcing the cap by retiring the
// weakest existing active entry if needed — keeps this a small living
// portrait, not a growing dossier.
export async function confirmPortraitEntry(
  { supabase, user }: AuthedContext,
  entryId: string
): Promise<void> {
  await supabase
    .from('portrait_entries')
    .update({ status: 'active', last_reinforced_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('user_id', user.id)

  const { data: active } = await supabase
    .from('portrait_entries')
    .select('id, reinforcement_count, last_reinforced_at')
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (active && active.length > ACTIVE_ENTRY_CAP) {
    const weakest = [...active].sort((a, b) => {
      if (a.reinforcement_count !== b.reinforcement_count) {
        return a.reinforcement_count - b.reinforcement_count
      }
      return new Date(a.last_reinforced_at).getTime() - new Date(b.last_reinforced_at).getTime()
    })[0]

    if (weakest) {
      await supabase
        .from('portrait_entries')
        .update({ status: 'dormant' })
        .eq('id', weakest.id)
        .eq('user_id', user.id)
    }
  }
}
