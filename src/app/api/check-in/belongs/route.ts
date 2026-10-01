// POST /api/check-in/belongs — { words } → { match: { project_id, title, quote } | null }
//
// Reads only what the person said in this check-in (never the companion's
// replies) against the work they are actively making, and finds the one
// thing, if any, that is plainly about one of those projects. It only ever
// becomes an offer ("send it there?"); nothing is moved without their tap.
// Captures are never read here (see memory: collector-standalone).

import { NextResponse, type NextRequest } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { aiGate } from '@/lib/billing/fair-use'
import { MODELS } from '@/lib/models'
import { requireUser } from '@/lib/supabase/route'
import { logUsage } from '@/lib/usage-log'
import { firstText, parseJsonObject } from '@/lib/studio/talk/sort'
import { isVerbatim } from '@/lib/studio/talk/verbatim'

const SYSTEM = `You read what a person said in a private check-in about their day and how they are, alongside a short list of creative projects they are actively making. You return JSON only: no prose, no code fence.

Decide whether any part of what they said is plainly about one of those projects: they name it, or they talk directly about its subject, an image or line for it, or a decision about it. A mood, a hard day, a vague wish to make things, or something that only shares a word with a project does NOT count. When in doubt, it does not belong. Returning null is the usual and correct answer.

If one part does belong, copy it exactly: "quote" is their own words, character for character, one contiguous span of one to three sentences, only the part about that project. Never paraphrase, never join two places.

Output exactly one of:
{"project_id": "<id from the list>", "quote": "…"}
{"project_id": null}`

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth) return NextResponse.json({ match: null }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const words = typeof body.words === 'string' ? body.words.trim().slice(0, 6000) : ''
    if (words.split(/\s+/).length < 6) return NextResponse.json({ match: null })

    const { data: projects } = await auth.supabase
      .from('studio_projects')
      .select('id, title, intent')
      .eq('user_id', auth.user.id)
      .eq('shelf_stage', 'active')
      .order('updated_at', { ascending: false })
      .limit(8)
    if (!projects || projects.length === 0) return NextResponse.json({ match: null })

    const gated = await aiGate(auth)
    if (gated) return NextResponse.json({ match: null })

    const list = projects
      .map((p) => `- id ${p.id}: "${p.title}"${p.intent ? ` — ${String(p.intent).slice(0, 240)}` : ''}`)
      .join('\n')
    const res = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 300,
      temperature: 0,
      system: SYSTEM,
      messages: [{ role: 'user', content: `THEIR PROJECTS:\n${list}\n\nWHAT THEY SAID:\n${words}` }],
    })
    logUsage(auth.user.id, 'check-in/belongs', res.model, res.usage)

    const raw = parseJsonObject(firstText(res.content as Array<{ type: string; text?: string }>)) as
      | { project_id?: unknown; quote?: unknown }
      | null
    const project = projects.find((p) => p.id === raw?.project_id)
    const quote = typeof raw?.quote === 'string' ? raw.quote.trim() : ''
    if (!project || !quote || !isVerbatim(quote, words)) return NextResponse.json({ match: null })
    return NextResponse.json({ match: { project_id: project.id, title: project.title, quote } })
  } catch (error) {
    console.error('check-in/belongs error:', error)
    return NextResponse.json({ match: null })
  }
}
