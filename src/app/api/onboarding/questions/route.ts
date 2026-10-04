import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { aiGate, pickModel } from '@/lib/billing/fair-use'
import { MODELS } from '@/lib/models'
import { withLanguage } from '@/lib/language'
import { logUsage } from '@/lib/usage-log'
import { MAX_THEMES, PRACTICES } from '@/lib/tour'

// The tour's Idea slide asks a new person real questions from the themes they
// have just named, three for each, written in one call as the tour opens. A
// theme is never dropped into a ready-made sentence: someone who names
// something heavy has to be met where they are.

const SYSTEM = `You are Companheiro, writing the very first questions a new person will be asked. They have just named the themes their creative work keeps returning to. For each theme, write three questions that each open a door into making something.

Each question:
- Is one sentence, ends with a question mark, and usually begins with What, When, Where or Which (rarely Why: it invites justification, not felt truth).
- Positions the person as the only authority on the answer. It surfaces something they already carry. Reading it, they should feel "yes, that's it", then "I've never actually sat with that".
- Finds one specific, unexpected corner of the theme. Never the obvious centre, never a definition, never a question that would work for any theme with the noun swapped.
- Does not repeat the theme's own name or label. The theme is the ground the question stands on, not a word inside it.
- Is bright in energy: it reaches for what is alive, possible and theirs to make. Bright never means glib.
- Is written for someone who lives inside this theme, not someone studying it. If a theme names pain, illness, trauma, loss or anything clinical, ask from lived experience with care and dignity: what it taught their attention, what they protect, what they can now see that others miss. Never ask them to relive harm, never treat the theme as a topic, never prescribe, diagnose or console.
- Uses plain words. No therapy language, no jargon, no exclamation marks, no em dashes.

The three questions for one theme must enter it from three different corners and use three different shapes. Let what they make (if given) decide the kind of thing a question could become, without naming their profession.

Return only JSON, no code fence: [{"theme": "<the theme exactly as given>", "questions": ["...", "...", "..."]}] with one entry per theme, in the order given.`

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ questions: null }, { status: 401 })
    const gated = await aiGate(auth)
    if (gated) return gated
    const body = (await request.json()) as { themes?: unknown; practices?: unknown; other?: unknown }
    const themes = (Array.isArray(body.themes) ? body.themes : []).map((t) => String(t).trim().slice(0, 60)).filter((t) => t.length >= 2).slice(0, MAX_THEMES)
    if (themes.length === 0) return NextResponse.json({ questions: null }, { status: 400 })
    const makes = [
      ...(Array.isArray(body.practices) ? body.practices : []).map((k) => PRACTICES.find((p) => p.key === k)?.label).filter(Boolean),
      typeof body.other === 'string' ? body.other.trim().slice(0, 80) : '',
    ].filter(Boolean)

    const res = await anthropic.messages.create({
      model: pickModel(auth, MODELS.deep),
      max_tokens: 900,
      system: withLanguage(SYSTEM),
      messages: [{ role: 'user', content: `Themes:\n${themes.map((t) => `- ${t}`).join('\n')}${makes.length ? `\n\nWhat they make: ${makes.join(', ')}` : ''}` }],
    })
    logUsage(auth.user.id, 'onboarding:questions', res.model, res.usage)
    const text = res.content.find((b) => b.type === 'text')?.text ?? ''
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()) as { theme?: unknown; questions?: unknown }[]
    const questions: Record<string, string[]> = {}
    themes.forEach((theme, i) => {
      const qs = (Array.isArray(parsed?.[i]?.questions) ? (parsed[i].questions as unknown[]) : []).map((q) => String(q).trim()).filter((q) => q.length > 10).slice(0, 3)
      if (qs.length) questions[theme] = qs
    })
    return NextResponse.json({ questions })
  } catch (error) {
    console.error('onboarding questions error:', error)
    return NextResponse.json({ questions: null }, { status: 500 })
  }
}
