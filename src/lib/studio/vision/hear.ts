// Listening, alongside the reply, for what was just settled or opened about
// the project, in the person's own words. Three kinds:
//   - a decision just made;
//   - a question named as still open;
//   - a change to a piece's core concept: what it is now about, what it now
//     holds, the journey it now takes its audience on, when what was said has
//     moved past what the concept says.
// All of it is only ever offered: nothing is kept or changed until they say
// so, and what they turn down is never offered again.
//
// This is what keeps the core concept from freezing at the moment it was
// locked. A decision lands on the vision page and in the concept on the
// writing page; an open question is kept beside the concept's own open
// threads, marked as raised in talk; a change, once accepted, rewrites the
// concept itself.
//
// The same lifecycle as a rule heard in talk (lib/studio/rule-proposals.ts),
// which keeps listening for refusals and must-keeps beside this. Every quote
// is checked word for word in code: a paraphrase means the line is ours, not
// theirs, and is dropped.

import type { AuthedContext } from '@/lib/supabase/route'
import { anthropic } from '@/lib/anthropic'
import { MODELS } from '@/lib/models'
import { logUsage } from '@/lib/usage-log'
import { nowIso } from '@/lib/studio/db'
import { firstText, parseJsonObject } from '@/lib/studio/talk/sort'
import { isVerbatim, normalise } from '@/lib/studio/talk/verbatim'
import { changeVision } from './store'
import { reachOf, type ConceptField, type KeptLine, type PendingChange, type SharedConcept, type VisionState } from './types'

/** Changes waiting at once, the same ceiling a rethink uses (rethink.ts). */
const RETHINK_MAX = 8

/** Lines waiting for an answer at once; the oldest beyond this quietly lapse. */
export const PENDING_MAX = 3
const MIN_WORDS = 5

/** A whole piece, as this step needs to see its core concept. */
export interface PieceForHearing {
  id: string
  title: string
  core_truth: string
  intent: string
  emotional_journey: string
  open_threads: string[]
}

const PART: Record<string, ConceptField> = { core_truth: 'core_truth', conviction: 'intent', journey: 'emotional_journey' }

const SYSTEM = `You read one thing a person just said about a creative project they are directing, beside the core concept of each of its pieces. You return JSON only: no prose, no code fence.

You are looking for three kinds of thing, in their own words.

1. "heard", a decision or an open question:
- a decision: something they have just settled about the project or one of its pieces. "We are cutting the third film." "It goes out as a book, not a series." "Vai ser só a preto e branco."
- an open question: something the project or a piece turns on that they have named as not settled yet. "I still don't know who is telling this." "Ainda não sei se é para os pais ou para os filhos."
"piece" is the title of the piece it is about, exactly as listed under THE PIECES, or "" when it is about the whole project. With only one piece, it is that piece unless they plainly mean the project as a whole.

2. "changes", a change to a piece's core concept. Only when what they just said, read with what came just before it, has moved a piece past what its concept now says, so that the concept as written is no longer true to them. A realisation that builds over the last few exchanges and lands in THE WORDS counts, including when THE WORDS agree to something they worked out together with the companion just before:
- core_truth: the truth the piece rests on.
- conviction: what the piece holds or argues.
- journey: the emotional journey it takes its audience on.
Who the work is for belongs to the concept: the journey is those people's journey, and the conviction often names who it stands with. A change in who it is for is a change to the journey (and to the conviction when they are part of what it stands for).
"to" is the whole part as it would read after the change: keep everything in the current text that still holds, change only what their words changed, and use their words wherever you can, in the same length, register and language as the current text. A journey keeps its one-step-per-line shape ("Label — sentence"). Never offer a change for a passing thought, a doubt, a wish, or anything the current text already says. Something that is a change to a concept goes under changes and not also under heard. At most one change.

Not any of these:
- a rule (something the work refuses, or must always keep): that is listened for elsewhere, leave it out.
- a feeling, a plan for today, an account of what happened.
- a question they are asking YOU.
- something you could infer but they did not say.

Most of what people say holds none of these. Empty lists are the usual and correct answer.

Quote them. Every "quote" must be their exact words, copied character for character from THE WORDS as one contiguous span. A heard "line" keeps their words wherever it can, under eighteen words. "why" is the reason they gave for a decision, in their words, under twenty words, and "" when they gave none. Never supply a reason for them. Never make anything tidier or firmer than they said it.

Skip anything that restates a line under ALREADY KEPT, WAITING FOR THEM, or TURNED DOWN, or an open thread a piece already has.

At most two under heard. Output exactly:
{"heard": [{"kind": "decision" | "open", "piece": "…", "line": "…", "why": "…", "quote": "…"}], "changes": [{"piece": "…", "part": "core_truth" | "conviction" | "journey", "to": "…", "quote": "…", "reach": "piece" | "project"}]}
"reach" says which it reads as: "project" when it is true of the whole project (what all of it is for, everyone it is for, what every piece holds), "piece" when it is about this piece alone or sets it apart from the rest.`

function piecesText(pieces: PieceForHearing[]): string {
  if (pieces.length === 0) return '(no pieces yet)'
  return pieces.map((p) => [
    `- “${p.title}”`,
    `    core_truth: ${p.core_truth.trim() || '(not written)'}`,
    `    conviction: ${p.intent.trim() || '(not written)'}`,
    `    journey:\n${p.emotional_journey.trim() ? p.emotional_journey.trim().split('\n').map((l) => `      ${l.trim()}`).join('\n') : '      (not written)'}`,
    `    open threads: ${p.open_threads.length ? p.open_threads.join(' | ') : '(none)'}`,
  ].join('\n')).join('\n')
}

export interface Heard {
  lines: KeptLine[]
  changes: PendingChange[]
}

/**
 * Reads what they said and holds anything heard as pending on the project.
 * Returns only what is new. Never throws into the reply: the caller catches.
 */
export async function hearVision(
  auth: AuthedContext,
  args: {
    projectId: string; text: string; intent: string; vision: VisionState; pieces: PieceForHearing[]
    /** The project's own concept, to tell a part still shared with it from a piece's own. */
    shared?: SharedConcept
    /** The exchanges just before this one, oldest first: a realisation often builds over several. */
    before?: Array<{ role: 'person' | 'companion'; text: string }>
  },
): Promise<Heard> {
  const text = args.text.trim()
  if (text.split(/\s+/).length < MIN_WORDS) return { lines: [], changes: [] }

  const kept = args.vision.kept.filter((k) => k.state === 'kept').map((k) => k.text)
  const waiting = [
    ...args.vision.kept.filter((k) => k.state === 'pending').map((k) => k.text),
    ...args.vision.pending_changes.map((c) => c.to),
  ]
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '(none)')

  const res = await anthropic.messages.create({
    // Rewriting a part of someone's core concept from what they said needs
    // judgement the fast model does not reliably have.
    model: MODELS.deep,
    max_tokens: 900,
    temperature: 0,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: [
        `WHAT THE WHOLE PROJECT IS FOR: ${args.intent.trim() || '(not written yet)'}`,
        `THE PIECES, WITH THEIR CORE CONCEPTS:\n${piecesText(args.pieces)}`,
        `ALREADY KEPT:\n${list(kept)}`,
        `WAITING FOR THEM:\n${list(waiting)}`,
        `TURNED DOWN:\n${list(args.vision.declined)}`,
        args.before?.length
          ? `JUST BEFORE, FOR CONTEXT (what THE WORDS answer or agree to; quote only from THE WORDS or from what THEY said here):\n${args.before.map((m) => `${m.role === 'person' ? 'THEM' : 'COMPANION'}: ${m.text.slice(0, 1500)}`).join('\n\n')}`
          : '',
        `THE WORDS:\n${text}`,
      ].filter(Boolean).join('\n\n'),
    }],
  })
  logUsage(auth.user.id, 'studio/vision-hear', res.model, res.usage)

  const raw = parseJsonObject(firstText(res.content as Array<{ type: string; text?: string }>))
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const pieceId = (name: unknown): string | null => {
    const n = typeof name === 'string' ? normalise(name) : ''
    if (!n) return null
    return args.pieces.find((p) => normalise(p.title) === n)?.id ?? null
  }
  const onlyPiece = args.pieces.length === 1 ? args.pieces[0].id : null
  // Their own words: this message, and what they said just before it.
  const theirs = [text, ...(args.before ?? []).filter((m) => m.role === 'person').map((m) => m.text)]
  const said = (span: string) => theirs.some((t) => isVerbatim(span, t))

  const openAlready = args.pieces.flatMap((p) => p.open_threads)
  const known = new Set([...kept, ...waiting, ...openAlready, ...args.vision.declined].map(normalise))
  const at = nowIso()

  const lines: KeptLine[] = []
  for (const item of (Array.isArray(rec.heard) ? rec.heard : []).slice(0, 2)) {
    if (!item || typeof item !== 'object') continue
    const h = item as Record<string, unknown>
    const line = typeof h.line === 'string' ? h.line.replace(/\s+/g, ' ').trim() : ''
    const quote = typeof h.quote === 'string' ? h.quote.trim() : ''
    const why = typeof h.why === 'string' ? h.why.replace(/\s+/g, ' ').trim() : ''
    if (!line || line.length > 220 || !quote) continue
    if (!isVerbatim(quote, text)) continue
    if (known.has(normalise(line))) continue
    known.add(normalise(line))
    const named = typeof h.piece === 'string' && h.piece.trim() ? pieceId(h.piece) : null
    lines.push({
      id: crypto.randomUUID(),
      kind: h.kind === 'open' ? 'open' : 'decision',
      node_id: named ?? (typeof h.piece === 'string' && h.piece.trim() ? onlyPiece : null),
      text: line,
      // A reason is only theirs when its words are too; otherwise it is left for them to give.
      why: h.kind !== 'open' && why && why.length <= 200 && isVerbatim(why, text) ? why : '',
      quote,
      at,
      state: 'pending',
    })
  }

  const changes: PendingChange[] = []
  for (const item of (Array.isArray(rec.changes) ? rec.changes : []).slice(0, 1)) {
    if (!item || typeof item !== 'object') continue
    const c = item as Record<string, unknown>
    const field = typeof c.part === 'string' ? PART[c.part] : undefined
    const node = pieceId(c.piece) ?? onlyPiece
    const to = typeof c.to === 'string' ? c.to.trim() : ''
    const quote = typeof c.quote === 'string' ? c.quote.trim() : ''
    if (!field || !node || !to || to.length > 4000 || !quote || !said(quote)) continue
    const piece = args.pieces.find((p) => p.id === node)
    const now = (piece?.[field] ?? '').trim()
    if (normalise(now) === normalise(to) || known.has(normalise(to))) continue
    const reach = reachOf(c.reach, args.shared ?? null, field, now)
    changes.push({ id: crypto.randomUUID(), node_id: node, field, to, quote, at, ...(reach ? { reach } : {}) })
  }

  if (lines.length === 0 && changes.length === 0) return { lines, changes }

  await changeVision(auth, args.projectId, (now) => {
    const pending = [...now.kept.filter((k) => k.state === 'pending'), ...lines].slice(-PENDING_MAX)
    return {
      ...now,
      kept: [...now.kept.filter((k) => k.state === 'kept'), ...pending],
      pending_changes: [...now.pending_changes.filter((p) => !changes.some((c) => c.node_id === p.node_id && c.field === p.field)), ...changes].slice(-RETHINK_MAX),
    }
  })
  return { lines, changes }
}
