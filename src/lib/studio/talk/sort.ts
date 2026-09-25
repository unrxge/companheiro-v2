// studio/src/lib/studio/talk/sort.ts — the silent sorter (8.2, 8.3, D-057, D-066).
// MODELS.fast, 700 tokens, temperature 0, JSON only. Runs concurrently with the
// reply; the route awaits it in buildMeta with a 12 s ceiling. A model failure
// THROWS (so the entry keeps sorted_at null and the sweep retries); a garbage
// reply parses to an empty sort (the model answered; nothing to keep).

import type { AuthedContext } from '@/lib/supabase/route'
import { anthropic } from '@/lib/anthropic'
import { MODELS } from '@/lib/models'
import { logUsage } from '@/lib/usage-log'
import type { TalkSort } from '@/lib/studio/types'
import { DIRECTION_SORT_SYSTEM, SORT_SYSTEM } from '@/lib/studio/talk/prompts'
import { validateSort } from '@/lib/studio/talk/apply'
import type { TalkContext } from '@/lib/studio/talk/context'

export const SORT_MAX_TOKENS = 700

export const EMPTY_SORT: TalkSort = Object.freeze({
  update: null,
  commitments: [],
  compass: [],
  decisions: [],
  done_commitment_ids: [],
}) as TalkSort

/** Tolerant JSON: strips code fences and anything around the outermost object. */
export function parseJsonObject(raw: string): unknown {
  let s = raw.trim()
  if (s.startsWith('```')) s = s.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a === -1 || b === -1 || b <= a) return null
  try {
    return JSON.parse(s.slice(a, b + 1))
  } catch {
    return null
  }
}

/** Text of the first text block of a non-streamed message. */
export function firstText(content: Array<{ type: string; text?: string }>): string {
  for (const c of content) if (c.type === 'text' && typeof c.text === 'string') return c.text
  return ''
}

async function runSort(userId: string, route: string, system: string, ctx: TalkContext, text: string): Promise<unknown> {
  const res = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: SORT_MAX_TOKENS,
    temperature: 0,
    system,
    messages: [
      {
        role: 'user',
        content: `${ctx.sortText}\n\nTHE ENTRY (sort only this; quote only from this):\n${text}`,
      },
    ],
  })
  logUsage(userId, route, res.model, res.usage)
  return parseJsonObject(firstText(res.content as Array<{ type: string; text?: string }>))
}

/** Sort one talk entry. `auth` attributes the cost; `_personId` is part of the contract for symmetry with apply. The sort itself writes nothing. */
export async function sortTalk(auth: AuthedContext, ctx: TalkContext, text: string, _personId: string): Promise<TalkSort> {
  const raw = await runSort(auth.user.id, 'studio/talk/sort', SORT_SYSTEM, ctx, text)
  return validateSort(raw, text, ctx)
}

/** Direction talk may only propose drift / refusal (≤ 2); everything else is emptied. */
export async function sortDirection(auth: AuthedContext, ctx: TalkContext, text: string, _personId: string): Promise<TalkSort> {
  const raw = await runSort(auth.user.id, 'studio/talk/sort-direction', DIRECTION_SORT_SYSTEM, ctx, text)
  const sorted = validateSort(raw, text, ctx)
  return {
    update: null,
    commitments: [],
    compass: sorted.compass.filter((p) => p.kind === 'drift' || p.kind === 'refusal').slice(0, 2),
    decisions: [],
    done_commitment_ids: [],
  }
}
