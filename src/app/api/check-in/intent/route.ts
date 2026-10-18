// POST /api/check-in/intent — { words, last_reply? } → { mode, notes, projects }
//
// Reads one message said into the check-in and says what it is for: checking
// in, leaving a note on a project, or both (lib/check-in-intent.ts). Asked
// before the companion writes anything back, so a note never gets a
// reflection it did not ask for. Fast model, a small prompt, one forced tool
// call. Anything that goes wrong reads as a check-in, which is what the page
// did before this existed.

import { NextResponse, type NextRequest } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { aiGate } from '@/lib/billing/fair-use'
import { MODELS } from '@/lib/models'
import { requireUser } from '@/lib/supabase/route'
import { logUsage } from '@/lib/usage-log'
import { CHECK_IN_ONLY, INTENT_SYSTEM, INTENT_TOOL, intentUserMessage, parseIntent, type IntentProject } from '@/lib/check-in-intent'

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth) return NextResponse.json({ ...CHECK_IN_ONLY, projects: [] }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const words = typeof body.words === 'string' ? body.words.trim().slice(0, 4000) : ''
    const lastReply = typeof body.last_reply === 'string' ? body.last_reply.trim() : null

    const { data } = await auth.supabase
      .from('studio_projects')
      .select('id, title, intent')
      .eq('user_id', auth.user.id)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(20)
    const projects = ((data ?? []) as IntentProject[]).map((p) => ({ id: p.id, title: p.title ?? '', intent: p.intent ?? null }))
    // Nothing to leave a note on: it can only be a check-in, and no call is made.
    if (!words || projects.length === 0) return NextResponse.json({ ...CHECK_IN_ONLY, projects: [] })

    const gated = await aiGate(auth)
    if (gated) return NextResponse.json({ ...CHECK_IN_ONLY, projects: [] })

    const res = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 700,
      temperature: 0,
      system: INTENT_SYSTEM,
      tools: [INTENT_TOOL],
      tool_choice: { type: 'tool', name: INTENT_TOOL.name },
      messages: [{ role: 'user', content: intentUserMessage(words, projects, lastReply) }],
    })
    const call = res.content.find((b) => b.type === 'tool_use')
    const intent = parseIntent(call && call.type === 'tool_use' ? call.input : null, projects.map((p) => p.id))
    logUsage(auth.user.id, 'check-in/intent', res.model, res.usage, { mode: intent.mode, notes: intent.notes.length })

    // The titles go back so the page can name the project and offer the others.
    return NextResponse.json({ ...intent, projects: projects.map(({ id, title }) => ({ id, title })) })
  } catch (error) {
    console.error('check-in/intent error:', error)
    return NextResponse.json({ ...CHECK_IN_ONLY, projects: [] })
  }
}
