import { NextRequest, NextResponse } from 'next/server'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { requireUser } from '@/lib/supabase/route'
import { aiGate, pickModel } from '@/lib/billing/fair-use'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { MODELS } from '@/lib/models'
import { META_DELIMITER } from '@/lib/streaming'
import { anthropic } from '@/lib/anthropic'
import { logUsage } from '@/lib/usage-log'
import { withLanguage } from '@/lib/language'
import { cacheLastMessage } from '@/lib/prompt-cache'
import {
  allowedThemes, cleanHeard, parseReflectTurn, personFirst, reflectStableBlock, reflectTool, reflectVolatileBlock, REFLECT_TOOL_NAME,
} from '@/lib/reflection'

interface Message { role: 'user' | 'assistant'; content: string }

const ints = (v: unknown): number[] => (Array.isArray(v) ? v.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 4) : [])

/**
 * One turn of looking back on a finished piece (lib/reflection.ts). The model
 * says what it heard, per theme, through a forced tool call; code decides
 * which theme comes next and whether an unanswered one is pressed once more.
 * The reply goes back the way the other short conversations do (words, then a
 * meta frame): a line this short is all there at once.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const gated = await aiGate(auth)
    if (gated) return gated

    const body = await request.json()
    const nodeId = typeof body?.node_id === 'string' ? body.node_id : ''
    const messages: Message[] = Array.isArray(body?.messages)
      ? body.messages
          .filter((m: Message) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
          .map((m: Message) => ({ role: m.role, content: m.content.slice(0, 6000) }))
          .slice(-40)
      : []
    if (!nodeId || !messages.some((m) => m.role === 'user')) {
      return NextResponse.json({ error: 'Missing node_id or words' }, { status: 400 })
    }

    const prevHeard = cleanHeard(body.heard)
    const phase = Number.isInteger(body.phase) && body.phase >= 0 && body.phase <= 4 ? (body.phase as number) : 0
    const followedUp = ints(body.followedUp)
    const skipped = ints(body.skipped)
    const progress = { phase, followedUp, skipped }

    const { supabase, user } = auth
    const { data: piece } = await supabase
      .from('studio_nodes')
      .select('title, core_truth, intent')
      .eq('id', nodeId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!piece) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })

    const turns = personFirst(messages)
    const claudeMessages: MessageParam[] = [
      ...cacheLastMessage(turns.slice(0, -1) as MessageParam[]),
      turns[turns.length - 1] as MessageParam,
    ]

    const tool = reflectTool(allowedThemes(prevHeard, progress))
    const response = await anthropic.messages.create({
      model: pickModel(auth, MODELS.deep),
      max_tokens: 700,
      system: [
        { type: 'text', text: withLanguage(reflectStableBlock(COMPANION_TONE)), cache_control: { type: 'ephemeral', ttl: '1h' } },
        { type: 'text', text: reflectVolatileBlock({ heard: prevHeard, progress, piece }) },
      ],
      tools: [tool],
      tool_choice: { type: 'tool', name: REFLECT_TOOL_NAME },
      messages: claudeMessages,
    })
    logUsage(user.id, 'reflect/turn', response.model, response.usage, { phase })

    const call = response.content.find((block) => block.type === 'tool_use')
    const turn = parseReflectTurn(call && call.type === 'tool_use' ? call.input : null, progress)
    if (!turn) {
      console.error('Reflect turn came back with nothing to say:', response.stop_reason)
      return NextResponse.json({ error: 'No answer' }, { status: 502 })
    }

    const meta = {
      phase: turn.theme,
      done: turn.done,
      heard: turn.heard,
      followedUp: turn.followUp ? [...followedUp, phase] : followedUp,
    }
    return new Response(turn.say + META_DELIMITER + JSON.stringify(meta), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
    })
  } catch (error) {
    console.error('reflect turn error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
