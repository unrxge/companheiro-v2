import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { buildCompanionContext } from '@/lib/companion-context'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { SIGNALS_SPEC, JOURNAL_CUE_SPEC, parseSignals, parseJournalCue } from '@/lib/check-in-prompt'
import { modelForCheckIn } from '@/lib/check-in-routing'
import { streamClaudeText } from '@/lib/streaming'
import { withLanguage } from '@/lib/language'

// `localHour` is the person's own clock (sent by the client). The server runs
// in UTC on Vercel, so its hour would be wrong for almost everyone.
function inferCheckInType(transcript: string, localHour: number): 'morning' | 'after_work' | 'evening' | 'moment' {
  const hour = localHour
  const lower = transcript.toLowerCase()

  // Sleep words only mean "morning" if the clock doesn't contradict them.
  // "I have this dream of leaving my job", typed at 11pm, is not a morning
  // check-in — the word used to win outright, before any hour was consulted.
  const sleepWords = lower.includes('dream') || lower.includes('woke') || lower.includes('slept')
  if (hour < 11 || (sleepWords && hour < 14)) {
    return 'morning'
  }
  if (lower.includes('just finished work') || lower.includes('leaving the office') || (hour >= 16 && hour < 18)) {
    return 'after_work'
  }
  if (hour >= 20 || lower.includes('tonight') || lower.includes('end of the day')) {
    return 'evening'
  }
  return 'moment'
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { transcript, local_hour } = await request.json()
    const localHour =
      typeof local_hour === 'number' && local_hour >= 0 && local_hour <= 23 ? local_hour : new Date().getHours()

    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
    }

    const companionContext = await buildCompanionContext(auth)

    const systemPrompt = `You are Companheiro, a companion for a creative person's inner life.

${COMPANION_TONE}

${companionContext ? companionContext + '\n\n' : ''}When responding to a check-in, keep it to 2–3 sentences.

They have just disclosed something, and this is the first thing they hear back. Read what state they are actually in — depleted, ashamed, avoiding, steady, genuinely alright — and let that decide the shape of the reply:

- If saying it cost them something, or they are at the end of their capacity: meet that first, specifically and in your own words. Do not interpret them on this turn. A question that hands control back is enough. An interpretation delivered to someone mid-disclosure lands as exposure, not insight.
- If they are circling, minimising, or justifying: name the specific move — the sentence, the word, the thing left out — not their character. This is where you do not let it slide.
- If they have genuinely done the work, or are simply alright: say so, and let that be the whole reply. Do not manufacture a shadow underneath a good week. "Nothing underneath this one" is a real and correct thing to reflect back.
- Otherwise: name one specific thing you notice underneath what they said — not a summary, not a restatement — and close with a single open question that invites curiosity rather than demands an answer.

If what they wrote is too thin to read honestly, ask rather than invent. If it connects to something you already know about them, let that show naturally. Leave space. Do not over-explain.

${SIGNALS_SPEC}

${JOURNAL_CUE_SPEC}`

    const inferredType = inferCheckInType(transcript, localHour)

    return streamClaudeText(
      'check-in/process',
      {
        // First turn has no reading yet, so this routes on the entry itself:
        // delicate material or a long, dense one earns the deeper model.
        model: modelForCheckIn({ currentText: transcript }),
        max_tokens: 512,
        system: withLanguage(systemPrompt),
        messages: [
          {
            role: 'user',
            content: `Here is my check-in: "${transcript}"`,
          },
        ],
      },
      (fullText) => ({
        signals: parseSignals(fullText),
        inferredType,
        journalCue: parseJournalCue(fullText),
      })
    )
  } catch (err) {
    console.error('check-in process error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
