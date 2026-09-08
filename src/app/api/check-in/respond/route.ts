import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { buildCompanionContext } from '@/lib/companion-context'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { SIGNALS_REVISION_SPEC, hasSignals, parseSignals } from '@/lib/check-in-prompt'
import { modelForCheckIn } from '@/lib/check-in-routing'
import { streamClaudeText } from '@/lib/streaming'
import { withLanguage } from '@/lib/language'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // `energy` is the reading so far, sent by the client purely so routing can
    // see that someone is running on empty. Absent is fine.
    const { response, messages, energy } = await request.json()

    if (!response?.trim()) {
      return NextResponse.json({ error: 'response is required' }, { status: 400 })
    }

    const companionContext = await buildCompanionContext(auth)

    const history: Message[] = Array.isArray(messages)
      ? messages.filter(
          (m: Message) =>
            (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
        )
      : []

    // Escalation tracks what they have actually given, not how many times the
    // companion has spoken. Three considered turns and three shrugs used to
    // advance identically, so the person avoiding reached the wrap-up at the
    // same moment as the person doing the work.
    const substantiveTurns = history.filter(
      (m) => m.role === 'user' && m.content.trim().length >= 120
    ).length
    const depth = Math.min(
      history.filter((m) => m.role === 'assistant').length,
      substantiveTurns + 1
    )

    const discernment = `WHETHER TO EXCAVATE — decide this fresh every turn. They will never ask you to, and there is no button for it: reading it is your job.

Press when the material is asking for it: the same thing has come back more than once; what they are saying now contradicts what they said earlier; the language is doing work to hold them at a distance from it (abstraction, "one just", passive constructions, a joke arriving exactly at the hard part, "it's fine" attached to something that isn't); or they are plainly circling something they can see and will not say. When you press, do all three of these in the same breath — name what is underneath, let the weight of it be felt rather than explained, and leave them somewhere real to go next. Naming without the other two is a diagnosis handed to someone who did not ask for one. "Somewhere to go" is a door held open, not an instruction issued: an observation they can pick up, or a question worth sitting with — never a command to sit with it.

Hold when it is not: they are at the end of their capacity; the disclosure is still fresh and they have not finished putting it down; they have already found the thing themselves and are saying it out loud; or what they brought is simply what it is and there is nothing under it. Holding is not softness and not failure — a challenge delivered to someone who cannot use it is just weight, and it teaches them that this place costs something to visit.

If you are genuinely unsure which it is, that uncertainty is itself the answer: ask, rather than excavate on a guess.`

    const sharedTurnRules = `If they are pushing back on what you reflected — telling you that is not it — take the correction at face value and let it stand. Do not reinterpret the disagreement itself and do not defend the earlier read; ask what would be closer. If their answers have gone short, flat or non-committal, that is information: either they are done, or the thing is too close to touch right now. Offer the exit rather than pressing harder.`

    const responseInstruction =
      depth < 3
        ? `Respond to what they just said. Acknowledge what is shifting, name something specific that is coming into focus, and open one thing up that moves a step further — as an observation or a question, never as an instruction to go and think about it. Do not repeat or rephrase what was already said — carry it forward. ${sharedTurnRules} Keep it brief.`
        : `Respond to what they just said. Before going deeper, look at the full arc: what was originally brought in, and where the conversation has actually gone. If the core has been touched and something real has come into focus, offer that as a landing — a synthesis, no question. If the conversation has drifted into a tangent, don't follow it further; draw back to what matters and close there. Only keep excavating if something at the center is genuinely still unresolved. If you have already offered a landing and they are still here, do not land again — repeated closure reads as being shown the door. Follow what they actually bring. ${sharedTurnRules} Keep it brief.`

    const systemPrompt = `You are Companheiro, a companion in an ongoing check-in conversation.

${COMPANION_TONE}

${companionContext ? companionContext + '\n\n' : ''}${responseInstruction}

${discernment}

What you know about this person should quietly shape how you respond — which question you reach for, which angle you take, what you hold back. Let that knowledge inform the reflection without ever stating it directly.

${SIGNALS_REVISION_SPEC}`

    return streamClaudeText(
      {
        // Routes on the whole session, not just the latest line — by the time
        // someone is two real turns in, this is where the deeper model earns
        // its cost. Short, light exchanges stay on the fast one.
        model: modelForCheckIn({
          text: [...history.map((m) => m.content), response].join('\n'),
          substantiveTurns,
          energy: typeof energy === 'string' ? (energy as 'low' | 'medium' | 'high') : null,
        }),
        max_tokens: 512,
        system: withLanguage(systemPrompt),
        messages: [...history, { role: 'user', content: response }],
      },
      // Only reported when the model actually returned a usable block, so a
      // malformed one leaves the reading from the previous turn standing.
      (fullText) => (hasSignals(fullText) ? { signals: parseSignals(fullText) } : {})
    )
  } catch (err) {
    console.error('check-in respond error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
