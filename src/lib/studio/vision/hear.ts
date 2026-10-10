// Listening, alongside the reply, for two things said about the project: a
// decision just made, and a question named as still open. Both in the
// person's own words, both only ever offered: nothing is kept until they say
// so, and a line they turn down is never offered again.
//
// The same lifecycle as a rule heard in talk (lib/studio/rule-proposals.ts),
// which keeps listening for refusals and must-keeps beside this. The quote is
// checked word for word in code: a paraphrase means the line is ours, not
// theirs, and is dropped.

import type { AuthedContext } from '@/lib/supabase/route'
import { anthropic } from '@/lib/anthropic'
import { MODELS } from '@/lib/models'
import { logUsage } from '@/lib/usage-log'
import { nowIso } from '@/lib/studio/db'
import { firstText, parseJsonObject } from '@/lib/studio/talk/sort'
import { isVerbatim, normalise } from '@/lib/studio/talk/verbatim'
import { changeVision } from './store'
import type { KeptLine, VisionState } from './types'

/** Lines waiting for an answer at once; the oldest beyond this quietly lapse. */
export const PENDING_MAX = 3
const MIN_WORDS = 5

const SYSTEM = `You read one thing a person just said about a creative project they are directing. You return JSON only: no prose, no code fence.

You are looking for two kinds of thing, in their own words:
- a decision: something they have just settled about the project. "We are cutting the third film." "It goes out as a book, not a series." "Vai ser só a preto e branco."
- an open question: something the project turns on that they have named as not settled yet. "I still don't know who is telling this." "Ainda não sei se é para os pais ou para os filhos."

Neither of these:
- a rule (something the work refuses, or must always keep): that is listened for elsewhere, leave it out.
- a feeling, a doubt in passing, a wish, a plan for today, an account of what happened.
- a question they are asking YOU. Only a question about the project that they say is theirs to settle.
- something you could infer but they did not say.

Most of what people say holds neither. An empty list is the usual and correct answer.

Quote them. "quote" must be their exact words, copied character for character from THE WORDS as one contiguous span. "line" is the decision or the question as one short line that keeps their words wherever it can, under eighteen words. "why" is the reason they gave for a decision, in their words, under twenty words, and "" when they gave none. Never supply a reason for them. Never make it tidier or firmer than they said it.

Skip anything that restates a line under ALREADY KEPT, WAITING FOR THEM, or TURNED DOWN.

At most two. Output exactly:
{"heard": [{"kind": "decision" | "open", "line": "…", "why": "…", "quote": "…"}]}`

/**
 * Reads what they said and holds anything heard as pending on the project.
 * Returns only the new lines. Never throws into the reply: the caller catches.
 */
export async function hearVision(
  auth: AuthedContext,
  args: { projectId: string; text: string; intent: string; vision: VisionState },
): Promise<KeptLine[]> {
  const text = args.text.trim()
  if (text.split(/\s+/).length < MIN_WORDS) return []

  const kept = args.vision.kept.filter((k) => k.state === 'kept').map((k) => k.text)
  const waiting = args.vision.kept.filter((k) => k.state === 'pending').map((k) => k.text)
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '(none)')

  const res = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 500,
    temperature: 0,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        `WHAT THE PROJECT IS FOR: ${args.intent.trim() || '(not written yet)'}`,
        `ALREADY KEPT:\n${list(kept)}`,
        `WAITING FOR THEM:\n${list(waiting)}`,
        `TURNED DOWN:\n${list(args.vision.declined)}`,
        `THE WORDS:\n${text}`,
      ].join('\n\n'),
    }],
  })
  logUsage(auth.user.id, 'studio/vision-hear', res.model, res.usage)

  const raw = parseJsonObject(firstText(res.content as Array<{ type: string; text?: string }>))
  const items = raw && typeof raw === 'object' && Array.isArray((raw as { heard?: unknown }).heard)
    ? (raw as { heard: unknown[] }).heard
    : []

  const known = new Set([...kept, ...waiting, ...args.vision.declined].map(normalise))
  const at = nowIso()
  const fresh: KeptLine[] = []
  for (const item of items.slice(0, 2)) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const line = typeof rec.line === 'string' ? rec.line.replace(/\s+/g, ' ').trim() : ''
    const quote = typeof rec.quote === 'string' ? rec.quote.trim() : ''
    const why = typeof rec.why === 'string' ? rec.why.replace(/\s+/g, ' ').trim() : ''
    if (!line || line.length > 220 || !quote) continue
    if (!isVerbatim(quote, text)) continue
    if (known.has(normalise(line))) continue
    known.add(normalise(line))
    fresh.push({
      id: crypto.randomUUID(),
      kind: rec.kind === 'open' ? 'open' : 'decision',
      text: line,
      // A reason is only theirs when its words are too; otherwise it is left for them to give.
      why: rec.kind !== 'open' && why && why.length <= 200 && isVerbatim(why, text) ? why : '',
      quote,
      at,
      state: 'pending',
    })
  }
  if (fresh.length === 0) return []

  await changeVision(auth, args.projectId, (now) => {
    const pending = [...now.kept.filter((k) => k.state === 'pending'), ...fresh].slice(-PENDING_MAX)
    return { ...now, kept: [...now.kept.filter((k) => k.state === 'kept'), ...pending] }
  })
  return fresh
}
