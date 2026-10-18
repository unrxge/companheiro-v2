import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { aiGate, pickModel } from '@/lib/billing/fair-use'
import { buildCompanionContext } from '@/lib/companion-context'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { MODELS } from '@/lib/models'
import { withLanguage } from '@/lib/language'
import { logUsage } from '@/lib/usage-log'

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const gated = await aiGate(auth)
    if (gated) return gated

    const { raw_entry, full_conversation, check_in_id } = await request.json()
    const material = (full_conversation?.trim() || raw_entry?.trim()) as string | undefined

    if (!material) {
      return NextResponse.json({ error: 'raw_entry or full_conversation is required' }, { status: 400 })
    }

    // Worth the tokens here specifically: this generates a question, and the
    // portrait is where what-kind-of-question-actually-reaches-them lives.
    // It is also a once-per-check-in call the person opts into, not a
    // per-turn cost. Excludes this same check-in from context — it's already
    // in `material` above, no need to read it back a second time.
    const companionContext = await buildCompanionContext(auth, {
      excludeCheckInId: typeof check_in_id === 'string' ? check_in_id : null,
    })

    const systemPrompt = `You are Companheiro, creating a journaling prompt — a companion invitation for someone to fully immerse themselves in what they've just explored, meant to guide them in navigating it.

${COMPANION_TONE}

${companionContext ? companionContext + '\n\n' : ''}

You're given the whole exchange: the opening check-in AND, when present, the back-and-forth that followed. Use all of it. The real material is often what surfaced later in the conversation, not the opening entry alone — if something truer emerged as it went on, build the prompt from that, don't default back to the surface version.

The prompt should:
- Come from what's actually been shared and uncovered across the whole exchange, not just the opening entry: draw on all of it, then ask about its single truest place
- Be specific to what they've actually expressed, not generic
- Name the real thing underneath — the contradiction, the weight, the tender place the conversation actually arrived at
- Serve as a guide for navigating what they're going through, something they can immerse themselves in
- Invite them to go deeper without cushioning or over-explaining — an invitation they can refuse, not a verdict on them
- Be open-ended and something they can sit with offline
- Feel like a companion asking a real question, not a therapy prompt
- Use direct, clear language with no filler

Return ONLY the prompt itself. No preamble, no explanation. Write exactly ONE question, in one or two short sentences, at most 35 words in all. Never join two questions with "and", "or" or a dash, and never add a second question after the first. Choose the single most alive place the conversation reached and ask about that alone: the prompt does not have to cover everything, and a narrow question is easier to begin writing from than a wide one. It is read by someone who is going to sit down alone and write, so it must feel light enough to start.`

    const response = await anthropic.messages.create({
      // The deeper model: the fast one wrote 80-word, several-clause prompts
      // that were daunting to sit down to (median 80 words over ten real
      // check-ins, against 31 here).
      model: pickModel(auth, MODELS.deep),
      max_tokens: 300,
      system: withLanguage(systemPrompt),
      messages: [
        {
          role: 'user',
          content: `Create a journaling prompt from this check-in:\n\n${material}`,
        },
      ],
    })

    logUsage(auth.user.id, 'check-in/journal-prompt', response.model, response.usage)

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
