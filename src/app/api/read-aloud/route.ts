import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { aiGate } from '@/lib/billing/fair-use'
import { logUsage } from '@/lib/usage-log'

// The companion's speaking voice. Anthropic has no speech model, so this is
// the one route that calls OpenAI; without OPENAI_API_KEY it answers 503 and
// the page says the voice is unavailable.
const MODEL = process.env.TTS_MODEL?.trim() || 'gpt-4o-mini-tts'
const VOICE = process.env.TTS_VOICE?.trim() || 'ash'

// A check-in reply is a few sentences. The cap keeps one press from ever
// costing more than about a cent.
const MAX_CHARS = 1500

const DELIVERY = `A warm, low, unhurried man's voice. You are a close companion speaking quietly to someone who has just told you something personal. Calm and steady, with natural pauses. Never bright, never performative, never like an announcer or an assistant. Speak in the language the text is written in.`

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const gated = await aiGate(auth)
    if (gated) return gated

    const key = process.env.OPENAI_API_KEY?.trim()
    if (!key) return NextResponse.json({ error: 'Voice is not set up' }, { status: 503 })

    const { text } = await request.json()
    const input = typeof text === 'string' ? text.trim().slice(0, MAX_CHARS) : ''
    if (!input) return NextResponse.json({ error: 'text is required' }, { status: 400 })

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, voice: VOICE, input, instructions: DELIVERY, response_format: 'mp3' }),
    })
    if (!res.ok || !res.body) {
      console.error('read-aloud: speech request failed', res.status, (await res.text().catch(() => '')).slice(0, 300))
      return NextResponse.json({ error: 'Voice failed' }, { status: 502 })
    }

    // Speech is priced by length, so the meter is fed characters (see the
    // 'tts' row in lib/billing/fair-use.ts).
    logUsage(auth.user.id, 'read-aloud', MODEL, { input_tokens: input.length, output_tokens: 0 }, { chars: input.length })

    return new Response(res.body, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store' },
    })
  } catch (err) {
    console.error('read-aloud error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
