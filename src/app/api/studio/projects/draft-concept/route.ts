// POST /api/studio/projects/draft-concept — lane H (10.2, D-066). MODELS.deep,
// 1200 tokens, JSON only. The model drafts a definition from the person's own
// words; the code checks every verbatim claim and derives references itself.
// Nothing is persisted here: the person edits the draft, then `make the project`.

import { aiGate, pickModel } from '@/lib/billing/fair-use'
import { NextResponse, type NextRequest } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { MODELS } from '@/lib/models'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { withLanguage } from '@/lib/language'
import { logUsage } from '@/lib/usage-log'
import { HttpError, badRequest, isRecord, isString, readJson, withAuth } from '@/lib/studio/db'
import { FOUR_QUESTIONS, parseModelJson, sourceText, validateDraft } from '@/lib/studio/concept'
import type { DraftConceptRequest, DraftConceptResponse } from '@/lib/studio/types'

export const maxDuration = 60

const MAX_INPUT = 12000

function parseRequest(body: unknown): DraftConceptRequest {
  if (!isRecord(body)) throw badRequest('body required')
  if (body.mode === 'brief') {
    if (!isString(body.brief) || !body.brief.trim()) throw badRequest('brief required')
    return { mode: 'brief', brief: body.brief.trim().slice(0, MAX_INPUT) }
  }
  if (body.mode === 'questions') {
    const a = body.answers
    if (!Array.isArray(a) || a.length !== 4 || !a.every(isString)) throw badRequest('four answers required')
    const answers = a.map((s) => s.trim().slice(0, MAX_INPUT / 4)) as [string, string, string, string]
    if (!answers.some(Boolean)) throw badRequest('four answers required')
    return { mode: 'questions', answers }
  }
  throw badRequest('mode must be brief or questions')
}

const TASK = `You are reading what a person wrote about a creative project they are starting, and drafting the concept card that will sit at the top of their canvas. This is a definition, not a plan, and it is theirs: it restates what THEY said, in their own register and words, so they recognise it and can edit it before anything exists.

Return ONLY a JSON object, no prose, no code fence, with exactly these keys:
{
  "title": string,             // at most 6 words, all lowercase, a name for the thing — not a slogan
  "body": string,              // 2 to 5 sentences that restate what they said the project IS; their register, their words where possible; no advice, no steps, no praise
  "constraints": string[],     // one line each, only what they actually stated as a limit, a rule, a scope or a refusal; empty if none
  "anchor_candidates": string[], // at most 3 short phrases copied EXACTLY as they wrote them (same words, same order) that sounded like they matter to them; empty if none
  "compass_seed": [            // only when they stated something they will not do, or something the work must keep, whatever happens
    { "kind": "refusal" | "non_negotiable", "statement": string, "quote": string }
  ]
}

Rules:
- "quote" must be an exact span of their text; "statement" is that same thing in a plain sentence in their terms.
- "refusal" = something they will not do in it. "non_negotiable" = something it must keep. Nothing else goes in the compass.
- Never invent facts, goals, audiences, deadlines or references they did not state. If they said little, the body is short.
- No counts, no judgement of the work, no therapeutic language, no encouragement.
- Keep their language and spelling.`

function userMessage(req: DraftConceptRequest): string {
  if (req.mode === 'brief') return `What they wrote:\n\n${req.brief}`
  const answers = req.answers ?? ['', '', '', '']
  return FOUR_QUESTIONS.map((q, i) => `${i + 1}. ${q}\n${answers[i] || '(no answer)'}`).join('\n\n')
}

export async function POST(req: NextRequest) {
  return withAuth(async (auth) => {
    const gated = await aiGate(auth)
    if (gated) return gated
    const request = parseRequest(await readJson(req))
    const source = sourceText(request.mode, request.brief, request.answers)
    if (!source) throw badRequest('nothing to read')

    const response = await anthropic.messages.create({
      model: pickModel(auth, MODELS.deep),
      max_tokens: 1200,
      system: withLanguage(`${COMPANION_TONE}\n\n${TASK}`),
      messages: [{ role: 'user', content: userMessage(request) }],
    })
    logUsage(auth.user.id, 'studio/draft-concept', response.model, response.usage, { mode: request.mode })

    const text = response.content
      .filter((b): b is Extract<(typeof response.content)[number], { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
    const parsed = parseModelJson(text)
    if (parsed === null) throw new HttpError(500, 'the draft did not come back as expected')

    const draft: DraftConceptResponse = validateDraft(parsed, source)
    return NextResponse.json(draft)
  })
}
