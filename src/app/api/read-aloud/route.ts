import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import type { AuthedContext } from '@/lib/supabase/route'
import { aiGate } from '@/lib/billing/fair-use'
import { logUsage } from '@/lib/usage-log'
import { recordOpsEvent } from '@/lib/ops/ai-calls'
import { deliveryFor, nthCompanionReply, parseVoiceContext, registerFor, trimForSpeech, type VoiceContext } from '@/lib/voice-delivery'

// The companion's speaking voice. Anthropic has no speech model, so this is
// the one route that calls OpenAI; without OPENAI_API_KEY it answers 503 and
// the page says the voice is unavailable.
const MODEL = process.env.TTS_MODEL?.trim() || 'gpt-4o-mini-tts'
const VOICE = process.env.TTS_VOICE?.trim() || 'onyx'

// Speech is generated at about the speed it is spoken, and the longest
// replies run past a minute.
export const maxDuration = 120

// The longest real replies run to about 300 words. The cap keeps one press
// under about four cents and cuts at a sentence end (lib/voice-delivery.ts).
const MAX_CHARS = 2500

// Asks for the speech and hands the audio on as it arrives, so the browser
// can begin playing the first sentence while the rest is still being made.
async function speak(auth: AuthedContext, text: string, voice: VoiceContext, how: 'stream' | 'whole'): Promise<Response> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    // Recorded so the cause can be read from /admin: the person only ever
    // sees "the voice is unavailable".
    await recordOpsEvent('ai_error', 'read-aloud', 'OPENAI_API_KEY is not set in this deployment')
    return NextResponse.json({ error: 'Voice is not set up' }, { status: 503 })
  }

  const input = trimForSpeech(text, MAX_CHARS)
  if (!input) return NextResponse.json({ error: 'text is required' }, { status: 400 })

  const started = Date.now()
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
  // 'tts' row in lib/billing/fair-use.ts). `first_audio_ms` is how long the
  // person waited before there was anything to play.
  logUsage(auth.user.id, 'read-aloud', MODEL, { input_tokens: input.length, output_tokens: 0 }, {
    chars: input.length,
    register: registerFor(voice),
    how,
    first_audio_ms: Date.now() - started,
  })

  return new Response(res.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, no-store', 'X-Accel-Buffering': 'no' },
  })
}

// GET is what an <audio> element can play while it is still arriving. The
// words never go in the address: the check-in is named and the server reads
// the reply from the person's own row.
//   /api/read-aloud?c=<check-in id>&i=<which companion reply, from 0>&n=<its length>&hour=<0-23>
export async function GET(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const gated = await aiGate(auth)
    if (gated) return gated

    const q = new URL(request.url).searchParams
    const id = q.get('c') ?? ''
    const index = Number(q.get('i'))
    if (!/^[0-9a-f-]{36}$/i.test(id) || !Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 })
    }

    const { data } = await auth.supabase
      .from('check_ins')
      .select('full_conversation, energy, arc_texture')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    const row = data as { full_conversation: string | null; energy: string | null; arc_texture: string | null } | null
    const reply = nthCompanionReply(row?.full_conversation, index)
    // The row is saved a moment after each reply. If it is not there yet, or
    // holds an older version, the page falls back to sending the words itself.
    const expected = Number(q.get('n'))
    if (!reply || (Number.isFinite(expected) && expected > 0 && reply.length !== expected)) {
      return NextResponse.json({ error: 'Reply not saved yet' }, { status: 409 })
    }

    const voice = parseVoiceContext({ energy: row?.energy, movement: row?.arc_texture, hour: Number(q.get('hour')) })
    return await speak(auth, reply, voice, 'stream')
  } catch (err) {
    console.error('read-aloud error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// The fallback: the page sends the words and waits for the whole recording.
export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const gated = await aiGate(auth)
    if (gated) return gated

    const { text, context } = await request.json()
    return await speak(auth, typeof text === 'string' ? text : '', parseVoiceContext(context), 'whole')
  } catch (err) {
    console.error('read-aloud error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
