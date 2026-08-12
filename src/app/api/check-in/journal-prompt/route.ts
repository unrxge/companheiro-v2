import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { raw_entry, full_conversation } = await request.json()
    const material = (full_conversation?.trim() || raw_entry?.trim()) as string | undefined

    if (!material) {
      return NextResponse.json({ error: 'raw_entry or full_conversation is required' }, { status: 400 })
    }

    const systemPrompt = `You are creating a journaling prompt — a companion invitation for someone to fully immerse themselves in what they've just explored, meant to guide them in navigating it.

You're given the whole exchange: the opening check-in AND, when present, the back-and-forth that followed — including a "Challenge me" moment where they were pushed to dissect what they shared and find its root. Use all of it. The real material is often what surfaced during the challenge, not the opening entry alone — if something truer emerged later in the conversation, build the prompt from that, don't default back to the surface version.

The prompt should:
- Fully encompass what's actually been shared and uncovered across the whole exchange, not just the opening entry
- Be specific to what they've actually expressed, not generic
- Name the real thing underneath — the contradiction, the weight, the tender place the conversation actually arrived at
- Serve as a guide for navigating what they're going through, something they can immerse themselves in
- Invite them to go deeper without softening or explaining
- Be open-ended and something they can sit with offline
- Feel like a companion asking a real question, not a therapy prompt
- Use direct, clear language with no filler

Return ONLY the prompt itself. No preamble, no explanation. Brief — one to three sentences, never more. Every sentence must earn its place.`

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Create a journaling prompt from this check-in:\n\n${material}`,
        },
      ],
    })

    const prompt = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    return NextResponse.json({
      prompt,
    })
  } catch (err) {
    console.error('journal-prompt error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
