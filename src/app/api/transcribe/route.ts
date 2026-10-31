import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { aiGate } from '@/lib/billing/fair-use'
import { logUsage } from '@/lib/usage-log'
import { recordOpsEvent } from '@/lib/ops/ai-calls'

// Dictation, the way Handy / Superwhisper do it: the browser records a stretch
// of speech and this hands the whole clip to a real transcription model, which
// returns it already punctuated. Nothing is heard word by word in the page, so
// nothing re-renders while the person speaks (lib/use-dictation.ts).
const MODEL = process.env.TRANSCRIBE_MODEL?.trim() || 'gpt-4o-transcribe'

export const maxDuration = 60

// Vercel refuses bodies over 4.5 MB; the hook cuts long recordings well under it.
const MAX_BYTES = 4_400_000

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const gated = await aiGate(auth)
    if (gated) return gated

    const key = process.env.OPENAI_API_KEY?.trim()
    if (!key) {
      await recordOpsEvent('ai_error', 'transcribe', 'OPENAI_API_KEY is not set in this deployment')
      return NextResponse.json({ error: 'Dictation is not set up' }, { status: 503 })
    }

    const form = await request.formData()
    const audio = form.get('audio')
    if (!(audio instanceof Blob) || audio.size === 0) return NextResponse.json({ error: 'audio is required' }, { status: 400 })
    if (audio.size > MAX_BYTES) return NextResponse.json({ error: 'Too long' }, { status: 413 })
    const lang = String(form.get('lang') ?? '').slice(0, 2).toLowerCase()
    const context = String(form.get('context') ?? '').slice(-400)
    const seconds = Math.max(1, Math.round(Number(form.get('seconds')) || 1))

    const type = audio.type || 'audio/webm'
    const ext = type.includes('mp4') || type.includes('aac') ? 'mp4' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'webm'
    const out = new FormData()
    out.append('file', new File([audio], `speech.${ext}`, { type }))
    out.append('model', MODEL)
    out.append('response_format', 'json')
    if (/^[a-z]{2}$/.test(lang)) out.append('language', lang)
    // The words just before help it carry on in the same voice and spelling.
    if (context.trim()) out.append('prompt', context)

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: out,
    })
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 300)
      console.error('transcribe failed', res.status, body)
      await recordOpsEvent('ai_error', 'transcribe', `OpenAI answered ${res.status}: ${body}`, { status: res.status })
      return NextResponse.json({ error: 'Transcription failed' }, { status: 502 })
    }
    const data = (await res.json()) as { text?: string }
    logUsage(auth.user.id, 'transcribe', MODEL, { input_tokens: seconds, output_tokens: 0 }, { seconds })
    return NextResponse.json({ text: (data.text ?? '').trim() })
  } catch (err) {
    console.error('transcribe error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
