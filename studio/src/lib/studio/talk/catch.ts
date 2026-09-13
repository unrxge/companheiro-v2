// studio/src/lib/studio/talk/catch.ts — the catch (8.6, D-056). The sort only
// flags candidates; MODELS.deep confirms and writes the sentence in the companion
// voice. One catch per (refusal, entry); never a second for the same refusal within
// 30 days while one is unmarked or marked right; at most ONE catch per talk.

import type { AuthedContext } from '@/lib/supabase/route'
import { anthropic } from '@/lib/anthropic'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { withLanguage } from '@/lib/language'
import { MODELS } from '@/lib/models'
import { logUsage } from '@/lib/usage-log'
import type { Catch, CompassEntry, Project, TalkSort } from '@/lib/studio/types'
import { fromDbError, isRecord, isString, nowIso } from '@/lib/studio/db'
import { CATCH_SYSTEM } from '@/lib/studio/talk/prompts'
import { firstText, parseJsonObject } from '@/lib/studio/talk/sort'
import { shortDateLower } from '@/lib/studio/since'
import type { TalkContext } from '@/lib/studio/talk/context'

export const CATCH_MAX_TOKENS = 300
export const CATCH_WINDOW_DAYS = 30

type CatchScope = Pick<TalkContext, 'active'>

interface Candidate {
  refusal: CompassEntry
  decision: string
}

function candidates(sort: TalkSort, ctx: CatchScope): Candidate[] {
  const out: Candidate[] = []
  const seen = new Set<string>()
  for (const d of sort.decisions) {
    if (!d.collides_with || seen.has(d.collides_with)) continue
    const refusal = ctx.active.find((e) => e.id === d.collides_with && (e.kind === 'refusal' || e.kind === 'non_negotiable'))
    if (!refusal) continue
    seen.add(refusal.id)
    out.push({ refusal, decision: d.text })
  }
  // strongest refusal first
  return out.sort((a, b) => b.refusal.reinforcement_count - a.refusal.reinforcement_count)
}

async function recentlyCaught(auth: AuthedContext, refusalId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - CATCH_WINDOW_DAYS * 86400000).toISOString()
  const { data, error } = await auth.supabase
    .from('studio_catches')
    .select('id, mark')
    .eq('refusal_entry_id', refusalId)
    .gt('created_at', since)
    .or('mark.is.null,mark.eq.right')
    .limit(1)
  if (error) throw fromDbError(error)
  return ((data as Array<{ id: string }> | null) ?? []).length > 0
}

function catchPrompt(c: Candidate, now: Date): string {
  const said = c.refusal.evidence[0]?.at ?? c.refusal.created_at
  const kind = c.refusal.kind === 'refusal' ? 'What they refused' : 'What the project must keep'
  const lines = [
    `${kind} (${shortDateLower(said, now)}): “${c.refusal.statement}”`,
  ]
  const quotes = c.refusal.evidence.map((e) => e.quote).filter((q) => q && q !== c.refusal.statement).slice(0, 3)
  if (quotes.length) lines.push(`In their words then: ${quotes.map((q) => `“${q}”`).join(' · ')}`)
  lines.push('', `What they said today, as a decision: “${c.decision}”`)
  return lines.join('\n')
}

/** MODELS.deep decides and writes; returns null on a non-collision or a model failure. */
async function confirmCatch(c: Candidate, now: Date): Promise<string | null> {
  try {
    const res = await anthropic.messages.create({
      model: MODELS.deep,
      max_tokens: CATCH_MAX_TOKENS,
      system: withLanguage([COMPANION_TONE, CATCH_SYSTEM].join('\n\n')),
      messages: [{ role: 'user', content: catchPrompt(c, now) }],
    })
    logUsage('studio/talk/catch', res.model, res.usage)
    const parsed = parseJsonObject(firstText(res.content as Array<{ type: string; text?: string }>))
    if (!isRecord(parsed) || parsed.collides !== true) return null
    const sentence = isString(parsed.sentence) ? parsed.sentence.trim() : ''
    return sentence.length > 0 ? sentence : null
  } catch (e) {
    console.error('[studio] catch check failed:', e)
    return null
  }
}

export async function maybeCatch(
  auth: AuthedContext,
  project: Project,
  personEntryId: string,
  sort: TalkSort,
  ctx: CatchScope,
  now: Date = new Date()
): Promise<Catch | null> {
  const list = candidates(sort, ctx)
  if (list.length === 0) return null

  for (const c of list) {
    if (await recentlyCaught(auth, c.refusal.id, now)) continue
    const sentence = await confirmCatch(c, now)
    if (!sentence) continue

    const { data: caught, error } = await auth.supabase
      .from('studio_catches')
      .insert({
        user_id: auth.user.id,
        project_id: project.id,
        refusal_entry_id: c.refusal.id,
        person_entry_id: personEntryId,
        decision_text: c.decision,
        sentence,
      })
      .select('*')
      .single()
    if (error) {
      // unique (refusal, entry): already caught for this very entry → nothing more to say
      if (error.code === '23505') return null
      throw fromDbError(error)
    }
    const row = caught as Catch

    const { data: spoken, error: spokenErr } = await auth.supabase
      .from('studio_talk_entries')
      .insert({
        user_id: auth.user.id,
        project_id: project.id,
        kind: 'talk',
        role: 'companion',
        text: sentence,
        reply_to: personEntryId,
        catch_id: row.id,
        created_at: nowIso(),
      })
      .select('id')
      .single()
    if (spokenErr) throw fromDbError(spokenErr)
    const spokenId = (spoken as { id: string }).id

    const { error: linkErr } = await auth.supabase.from('studio_catches').update({ spoken_entry_id: spokenId }).eq('id', row.id)
    if (linkErr) throw fromDbError(linkErr)

    return { ...row, spoken_entry_id: spokenId }
  }
  return null
}
