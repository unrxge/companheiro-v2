import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { aiGate, pickModel } from '@/lib/billing/fair-use'
import { buildCompanionContext } from '@/lib/companion-context'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { SIGNALS_SPEC, JOURNAL_CUE_SPEC, CHECK_IN_READING, parseSignals, parseJournalCue } from '@/lib/check-in-prompt'
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
    const gated = await aiGate(auth)
    if (gated) return gated

    const { transcript, local_hour } = await request.json()
    const localHour =
      typeof local_hour === 'number' && local_hour >= 0 && local_hour <= 23 ? local_hour : new Date().getHours()

    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
    }

    const companionContext = await buildCompanionContext(auth)

    const systemPrompt = `You are Companheiro, a companion for a creative person's inner life.

${COMPANION_TONE}

${companionContext ? companionContext + '\n\n' : ''}This is the first thing they hear back after telling you something.

${CHECK_IN_READING}

THEIR STATE shapes the reply as much as their reason for coming:
- If saying it cost them something, or they are at the end of their capacity: meet that first, specifically and in your own words. Do not interpret them on this turn. An interpretation delivered to someone mid-disclosure lands as exposure, not insight, and that includes a kind one: telling them what their fear really means, or that they have it backwards, is still interpreting. If they need support, this is where the reply takes the room it needs, and what fills that room is recognition of what they are carrying and what it took to say it. No reframe, no "here is what I notice", no verdict on whether their fear is justified, and no answer to a decision they are agonising over. Those may come later, once they have been met and if they want them. End by handing the next move back to them.
- If they are circling, minimising, or justifying: name the specific move — the sentence, the word, the thing left out — not their character. This is where you do not let it slide.
- If they have genuinely done the work, or are simply alright: go straight to what was good and why it mattered. Do not manufacture a shadow underneath a good day.
- Otherwise: name one specific thing you notice in what they said — not a summary, not a restatement.

If it connects to something you already know about them, let that shape your attention without showing. Leave space. Do not over-explain.

${SIGNALS_SPEC}

${JOURNAL_CUE_SPEC}`

    const inferredType = inferCheckInType(transcript, localHour)

    return streamClaudeText(auth.user.id, 
      'check-in/process',
      {
        // First turn has no reading yet, so this routes on the entry itself:
        // delicate material or a long, dense one earns the deeper model.
        model: pickModel(auth, modelForCheckIn({ currentText: transcript })),
        max_tokens: 900,
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
