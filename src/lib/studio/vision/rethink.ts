// Bringing a conversation into the core concept. Server only.
//
// A concept made from a short brief is drawn from very little: what someone
// could say about an idea in a few quick answers. Talking it through in the
// vision room is where it gets clearer, and the clarity rarely arrives in one
// sentence; it builds over an exchange, often ending in "yes, that's it". So
// listening to one message at a time (hear.ts) is not enough. Asked for on
// purpose, this reads the whole conversation against each piece's concept and
// proposes the concept as it now stands, one part at a time.
//
// It only proposes. Each part comes back as a change waiting for the person's
// answer (settings.vision.pending_changes), shown as it reads now and as it
// would read after, to be reworded, accepted or turned down. Every proposal
// must rest on something the person said in this conversation, quoted word for
// word and checked here; a realisation the companion had alone does not count.

import type { AuthedContext } from '@/lib/supabase/route'
import { anthropic } from '@/lib/anthropic'
import { pickModel } from '@/lib/billing/fair-use'
import { MODELS } from '@/lib/models'
import { logUsage } from '@/lib/usage-log'
import { nowIso } from '@/lib/studio/db'
import { parseJsonObject } from '@/lib/studio/talk/sort'
import { isVerbatim, normalise } from '@/lib/studio/talk/verbatim'
import { changeVision } from './store'
import type { PieceForHearing } from './hear'
import type { OfferedField, PendingChange, VisionState } from './types'

const PART: Record<string, OfferedField> = { core_truth: 'core_truth', conviction: 'intent', journey: 'emotional_journey', open_threads: 'open_threads' }
/** Waiting at once after a rethink: every part of a couple of pieces. */
export const RETHINK_MAX = 8

const SYSTEM = `You read a conversation someone had about one of their creative projects, beside the core concept of each of its pieces. The concepts were written early, often from a few quick answers. The conversation is where the idea got clearer. Your job is to say what each concept should now say, so the concept catches up with where the conversation got to.

For each piece the conversation actually changed, give the parts that no longer hold, rewritten:
- core_truth: the truth the piece rests on. One or two sentences.
- conviction: what the piece holds or argues. A short paragraph at most.
- journey: the emotional journey it takes its audience on, one step per line, "Label — sentence", three to six steps.
Who the work is for is part of the concept, as it was when the concept was drawn: the journey is the journey of those people, what they feel and go through, and the conviction often names who it stands with. When the conversation changes or sharpens who it is for, rewrite the journey for those people and, where they are part of what the piece stands for, the conviction.

- open_threads: the questions the piece has not settled, one per line, as the full list after the conversation: drop the ones the conversation answered, keep the ones still open, add the ones it raised. An empty list is allowed.

How to rewrite:
- Keep everything in the current text that the conversation left standing. Change only what moved.
- Use their words wherever you can, and their language and register. It is their concept, not yours: no flourish, nothing they did not mean.
- A realisation counts when the person arrived at it or agreed to it in their own words. Something only the companion said, which they did not take up, does not count.
- A part the conversation did not move is left out. A piece the conversation did not touch is left out. If nothing moved, return an empty list: that is a correct answer.

For every part you return, "quote" is the person's own words from the conversation that carry the change, copied character for character as one contiguous span from one of their messages, and "reason" is one plain sentence saying what in the conversation moved it.

"piece" is the title exactly as listed under THE PIECES.

Output JSON only, no prose, no code fence:
{"changes": [{"piece": "…", "part": "core_truth" | "conviction" | "journey" | "open_threads", "to": "…", "reason": "…", "quote": "…"}]}`

export interface RethinkResult {
  changes: PendingChange[]
  /** Nothing in the conversation moved any concept. */
  nothing: boolean
}

export async function rethinkConcept(
  auth: AuthedContext,
  args: {
    projectId: string
    intent: string
    pieces: PieceForHearing[]
    conversation: Array<{ role: 'person' | 'companion'; text: string }>
    vision: VisionState
  },
): Promise<RethinkResult> {
  const theirs = args.conversation.filter((m) => m.role === 'person').map((m) => m.text)
  if (theirs.length === 0 || args.pieces.length === 0) return { changes: [], nothing: true }

  const pieces = args.pieces.map((p) => [
    `- “${p.title}”`,
    `    core_truth: ${p.core_truth.trim() || '(not written)'}`,
    `    conviction: ${p.intent.trim() || '(not written)'}`,
    `    journey:\n${p.emotional_journey.trim() ? p.emotional_journey.trim().split('\n').map((l) => `      ${l.trim()}`).join('\n') : '      (not written)'}`,
    `    open_threads:\n${p.open_threads.length ? p.open_threads.map((t) => `      ${t}`).join('\n') : '      (none)'}`,
  ].join('\n')).join('\n')
  const transcript = args.conversation
    .map((m) => `${m.role === 'person' ? 'THEM' : 'COMPANION'}: ${m.text}`)
    .join('\n\n')
    .slice(-60_000)

  const model = pickModel(auth, MODELS.vision)
  const stream = anthropic.messages.stream({
    model,
    // Thinking is always on with the strongest model and counts here too.
    max_tokens: 12000,
    ...(model === MODELS.vision ? { output_config: { effort: 'medium' as const } } : {}),
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        `WHAT THE WHOLE PROJECT IS FOR: ${args.intent.trim() || '(not written yet)'}`,
        `THE PIECES, WITH THEIR CORE CONCEPTS AS THEY STAND:\n${pieces}`,
        `THE CONVERSATION:\n\n${transcript}`,
      ].join('\n\n'),
    }],
  })
  const res = await stream.finalMessage()
  logUsage(auth.user.id, 'studio/vision-rethink', res.model, res.usage)

  const raw = parseJsonObject(res.content.map((b) => (b.type === 'text' ? b.text : '')).join(''))
  const items = raw && typeof raw === 'object' && Array.isArray((raw as { changes?: unknown }).changes)
    ? (raw as { changes: unknown[] }).changes
    : []
  const declined = new Set(args.vision.declined)
  const at = nowIso()
  const out: PendingChange[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    const field = typeof c.part === 'string' ? PART[c.part] : undefined
    const name = typeof c.piece === 'string' ? normalise(c.piece) : ''
    const piece = args.pieces.find((p) => normalise(p.title) === name) ?? (args.pieces.length === 1 ? args.pieces[0] : undefined)
    const to = typeof c.to === 'string' ? c.to.trim() : ''
    const quote = typeof c.quote === 'string' ? c.quote.trim() : ''
    const reason = typeof c.reason === 'string' ? c.reason.replace(/\s+/g, ' ').trim().slice(0, 300) : ''
    if (!field || !piece || to.length > 4000 || (!to && field !== 'open_threads')) continue
    // Their words or nothing: a change only the companion arrived at is not theirs.
    if (!quote || !theirs.some((t) => isVerbatim(quote, t))) continue
    const now = field === 'open_threads' ? piece.open_threads.join('\n') : (piece[field] ?? '')
    if (normalise(now) === normalise(to) || declined.has(normalise(to))) continue
    const key = `${piece.id}:${field}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: crypto.randomUUID(), node_id: piece.id, field, to, reason, quote, at })
  }
  if (out.length === 0) return { changes: [], nothing: true }

  // What this replaces: an older offer for the same part of the same piece.
  await changeVision(auth, args.projectId, (now) => ({
    ...now,
    pending_changes: [
      ...now.pending_changes.filter((p) => !out.some((o) => o.node_id === p.node_id && o.field === p.field)),
      ...out,
    ].slice(-RETHINK_MAX),
  }))
  return { changes: out, nothing: false }
}
