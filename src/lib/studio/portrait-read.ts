// src/lib/studio/portrait-read.ts — READ ONLY view of the main app's portrait
// (D-051). Copied from the main app's lib/portrait.ts: getActivePortrait and
// formatPortraitForPrompt only. The studio never writes to portrait_entries,
// never distils, never adds an enum value. Own rows only, under RLS.

import type { AuthedContext } from '@/lib/supabase/route'

const DECAY_DAYS = 150

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

// Reads the undecayed active portrait for injection into a conversation.
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

  return (data as PortraitEntry[] | null) || []
}

// Formats the active portrait for a system prompt. Adapts strategy, never voice.
export function formatPortraitForPrompt(entries: PortraitEntry[]): string {
  if (entries.length === 0) return ''

  const lines = entries.map((e) => `- [${e.kind}] ${e.statement}`)
  return `WHO THIS PERSON IS (patterns observed from working with them over time — use these to adapt your STRATEGY: which questions you ask, when to challenge vs. hold, which pattern to name first, and how to deliver it so it actually reaches them. Adapting delivery to the person is the point of knowing them. What these must never do is buy silence: never use them to withhold a hard truth, to flatter, or to tell them only the version they would like to hear):\n${lines.join('\n')}`
}
