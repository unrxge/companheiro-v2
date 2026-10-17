// GET /api/examples/voice-memo?go=1 — owner only. Makes the creative
// director example's voice memo with the app's own speech voice (the same
// OpenAI model read-aloud uses) and hands it over as a file to download, so
// it can be finished and kept in public/examples (scripts/make-example-media.py).
// The key never leaves the server. Anyone but the owner gets 404.
//
// A tool for making one file once; it can be removed when the file is in.

import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/ops/admin'
import { logUsage } from '@/lib/usage-log'

const MODEL = process.env.TTS_MODEL?.trim() || 'gpt-4o-mini-tts'

/** What the creative director says into the phone. Kept word for word as the recording's transcript. */
const DIRECTOR_MEMO =
  'Okay. Note to self, walking back from the workshop, before I lose it. The last frame of the film. It is not the line over black. ' +
  'It is typed over the case, in her hallway. Come back different. Full stop. Then nothing. No logo for a full second. ' +
  'And, ask Mira whether the old repair books have destinations written in them. Because if they do, that is the whole Ledger. That is the whole thing. Okay. Train.'

const DELIVERY =
  'A creative director walking quickly along a busy street, phone held close, recording a quick note to self before the thought is gone. ' +
  'Thinking aloud: slightly out of breath, natural pauses, a little urgency on the idea, warm and unperformed. Not a voiceover, not polished.'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth || req.nextUrl.searchParams.get('go') !== '1') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return NextResponse.json({ error: 'OPENAI_API_KEY is not set in this deployment' }, { status: 503 })
  const voice = req.nextUrl.searchParams.get('voice')?.trim() || 'coral'

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, voice, input: DIRECTOR_MEMO, instructions: DELIVERY, response_format: 'wav' }),
  })
  if (!res.ok || !res.body) {
    const body = (await res.text().catch(() => '')).slice(0, 300)
    return NextResponse.json({ error: `OpenAI answered ${res.status}: ${body}` }, { status: 502 })
  }
  logUsage(auth.user.id, 'example:voice-memo', MODEL, { input_tokens: DIRECTOR_MEMO.length, output_tokens: 0 }, { chars: DIRECTOR_MEMO.length })
  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Disposition': `attachment; filename="aldermoor-voice-memo-${voice}.wav"`,
      'Cache-Control': 'no-store',
    },
  })
}
