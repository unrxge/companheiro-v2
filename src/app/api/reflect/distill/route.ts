import { NextRequest, NextResponse } from 'next/server'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { requireUser } from '@/lib/supabase/route'
import { aiGate, pickModel } from '@/lib/billing/fair-use'
import { MODELS } from '@/lib/models'
import { anthropic } from '@/lib/anthropic'
import { logUsage } from '@/lib/usage-log'
import { withLanguage } from '@/lib/language'
import { LOG_SYSTEM, LOG_TOOL, LOG_TOOL_NAME, cleanHeard, logFromHeard, parseLog, transcriptOf } from '@/lib/reflection'

interface Message { role: 'user' | 'assistant'; content: string }

/**
 * Writes up what was said as the reflection log, in the person's own words
 * (lib/reflection.ts). If the write-up fails for any reason, the log is built
 * straight from what was heard each turn, so finishing never depends on this.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const messages: Message[] = Array.isArray(body?.messages)
      ? body.messages
          .filter((m: Message) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
          .map((m: Message) => ({ role: m.role, content: m.content.slice(0, 6000) }))
          .slice(-40)
      : []
    const fallback = logFromHeard(cleanHeard(body?.heard))
    const skipped: number[] = Array.isArray(body?.skipped) ? body.skipped.filter((n: unknown) => Number.isInteger(n)) : []
    if (!messages.some((m) => m.role === 'user')) return NextResponse.json({ log: fallback, written: false })

    const gated = await aiGate(auth)
    if (gated) return NextResponse.json({ log: fallback, written: false })

    try {
      const note = skipped.length ? `\n\n(They chose to skip: ${skipped.join(', ')}. Leave those empty.)` : ''
      const content: MessageParam = { role: 'user', content: `${transcriptOf(messages)}${note}` }
      const response = await anthropic.messages.create({
        model: pickModel(auth, MODELS.deep),
        max_tokens: 900,
        system: withLanguage(LOG_SYSTEM),
        tools: [LOG_TOOL],
        tool_choice: { type: 'tool', name: LOG_TOOL_NAME },
        messages: [content],
      })
      logUsage(auth.user.id, 'reflect/distill', response.model, response.usage)
      const call = response.content.find((block) => block.type === 'tool_use')
      const log = parseLog(call && call.type === 'tool_use' ? call.input : null)
      if (log) return NextResponse.json({ log, written: true })
    } catch (err) {
      console.error('reflect distill failed, using what was heard:', err)
    }
    return NextResponse.json({ log: fallback, written: false })
  } catch (error) {
    console.error('reflect distill error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
