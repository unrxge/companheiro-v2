// Reading the canvas: where it does not hold together and, for a project of
// several pieces, what the pieces say taken together. Made only when the
// person asks for it, never on a timer and never on opening the room, and kept
// with its date so a later change to the canvas shows as a change.
//
// The statement about the pieces together is held to being new. Everything
// each piece and the project already say is on the page in the person's own
// words, so a statement that rewords it is dropped (together.ts); it is asked
// for once more, told which phrases it borrowed, and dropped if it still does.

import type { AuthedContext } from '@/lib/supabase/route'
import { anthropic } from '@/lib/anthropic'
import { pickModel } from '@/lib/billing/fair-use'
import { MODELS } from '@/lib/models'
import { logUsage } from '@/lib/usage-log'
import { nowIso } from '@/lib/studio/db'
import { parseJsonObject } from '@/lib/studio/talk/sort'
import { normalise } from '@/lib/studio/talk/verbatim'
import { borrowedRuns, isNewToThePage } from './together'
import { READING_SYSTEM } from './prompts'
import { keptText, type Canvas } from './store'
import type { Gap, Reading, VisionState } from './types'

const MAX_GAPS = 5

/** Everything the page already says in the person's words, which the statement must not repeat. */
function alreadySaid(canvas: Canvas, intent: string): string[] {
  return [
    intent,
    ...canvas.roots.flatMap((r) => [r.core_truth ?? '', r.intent ?? '', r.emotional_journey ?? '', r.beat ?? '', ...(r.open_threads ?? [])]),
  ].filter((x) => x.trim())
}

export async function readCanvas(auth: AuthedContext, canvas: Canvas, vision: VisionState, intent = ''): Promise<Reading> {
  const dismissed = vision.gaps_dismissed.length ? vision.gaps_dismissed.map((g) => `- ${g}`).join('\n') : '(none)'
  // Sonnet, not the strongest model: this is a reading of what is written, not
  // a conversation, and the person asked for it to be the Sonnet. Past the
  // soft cap the fast model stands in, as everywhere.
  const model = pickModel(auth, MODELS.deep)
  const several = canvas.roots.length >= 2
  const existing = alreadySaid(canvas, intent)
  const base = `THE CANVAS\n\n${canvas.text}\n\n${keptText(vision)}\n\nNOT A GAP, THEY SAID:\n${dismissed}`

  const ask = async (extra: string) => {
    const stream = anthropic.messages.stream({
      model,
      max_tokens: 4000,
      system: READING_SYSTEM,
      messages: [{ role: 'user', content: extra ? `${base}\n\n${extra}` : base }],
    })
    const res = await stream.finalMessage()
    logUsage(auth.user.id, 'studio/vision-reading', res.model, res.usage)
    const raw = parseJsonObject(res.content.map((b) => (b.type === 'text' ? b.text : '')).join(''))
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  }

  let rec = await ask('')
  // Only a project of several pieces has anything to say about them together.
  let statement = several && typeof rec.statement === 'string' ? rec.statement.trim().slice(0, 1200) : ''
  if (statement && !isNewToThePage(statement, existing)) {
    const borrowed = borrowedRuns(statement, existing)
    const again = await ask(
      `YOUR LAST STATEMENT REWORDED WHAT THE PAGE ALREADY SAYS (it used: ${borrowed.map((b) => `“${b}”`).join(', ')}). Write it again, saying only what shows when the pieces are held side by side and none of them says alone. If there is no such thing, return "".`,
    )
    const second = typeof again.statement === 'string' ? again.statement.trim().slice(0, 1200) : ''
    statement = second && isNewToThePage(second, existing) ? second : ''
    rec = { ...rec, gaps: rec.gaps ?? again.gaps }
  }

  const refused = new Set(vision.gaps_dismissed.map(normalise))
  const gaps: Gap[] = []
  for (const g of Array.isArray(rec.gaps) ? rec.gaps : []) {
    if (!g || typeof g !== 'object') continue
    const item = g as Record<string, unknown>
    const line = typeof item.text === 'string' ? item.text.replace(/\s+/g, ' ').trim() : ''
    if (!line || line.length > 400 || refused.has(normalise(line))) continue
    const where = (Array.isArray(item.where) ? item.where : []).filter((w): w is string => typeof w === 'string' && !!w.trim()).map((w) => w.trim()).slice(0, 6)
    gaps.push({ id: crypto.randomUUID(), text: line, where })
    if (gaps.length >= MAX_GAPS) break
  }
  return { at: nowIso(), statement, gaps, signature: canvas.signature }
}
