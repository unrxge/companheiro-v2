import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { aiGate } from '@/lib/billing/fair-use'
import { logUsage } from '@/lib/usage-log'
import { recordOpsEvent } from '@/lib/ops/ai-calls'
import { deliveryFor, parseVoiceContext, registerFor, trimForSpeech } from '@/lib/voice-delivery'

// The companion's speaking voice. Anthropic has no speech model, so this is
// the one route that calls OpenAI; without OPENAI_API_KEY it answers 503 and
// the page says the voice is unavailable.
const MODEL = process.env.TTS_MODEL?.trim() || 'gpt-4o-mini-tts'
const VOICE = process.env.TTS_VOICE?.trim() || 'onyx'

// The longest real replies run to about 300 words. The cap keeps one press
// under about four cents and cuts at a sentence end (lib/voice-delivery.ts).
const MAX_CHARS = 2500

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const gated = await aiGate(auth)
    if (gated) return gated

    const key = process.env.OPENAI_API_KEY?.trim()
    if (!key) {
      // Recorded so the cause can be read from /admin: the person only ever
      // sees "the voice is unavailable".
      await recordOpsEvent('ai_error', 'read-aloud', 'OPENAI_API_KEY is not set in this deployment')
      return NextResponse.json({ error: 'Voice is not set up' }, { status: 503 })
    }

    const { text, context } = await request.json()
    const input = typeof text === 'string' ? trimForSpeech(text, MAX_CHARS) : ''
    const voice = parseVoiceContext(context)
    if (!input) return NextResponse.json({ error: 'text is required' }, { status: 400 })

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, voice: VOICE, input, instructions: deliveryFor(voice, input), response_format: 'mp3' }),
    })
    if (!res.ok || !res.body) {
      const body = (await res.text().catch(() => '')).slice(0, 300)
      console.error('read-aloud: speech request failed', res.status, body)
      // OpenAI's own explanation (wrong permission, no credit, unknown voice).
      // It never contains the key in full.
      await recordOpsEvent('ai_error', 'read-aloud', `OpenAI answered ${res.status}: ${body}`, { status: res.status })
      return NextResponse.json({ error: 'Voice failed' }, { status: 502 })
    }

    // Speech is priced by length, so the meter is fed characters (see the
    // 'tts' row in lib/billing/fair-use.ts).
    logUsage(auth.user.id, 'read-aloud', MODEL, { input_tokens: input.length, output_tokens: 0 }, { chars: input.length, register: registerFor(voice) })

    return new Response(res.body, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    console.error('read-aloud error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
