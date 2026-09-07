import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { withLanguage } from '@/lib/language'
import { streamClaudeText } from '@/lib/streaming'
import { customKey, type CustomSlot } from '@/lib/territories'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

/**
 * GET — has this person been through onboarding? True if user_settings says
 * so, or if they already have territories or work (existing accounts).
 */
export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ onboarded: true }, { status: 401 })
    const { supabase, user } = auth
    const [{ data: settings }, { count: territoryRows }, { count: pieceCount }, { count: captureCount }] = await Promise.all([
      supabase.from('user_settings').select('onboarded_at').eq('user_id', user.id).maybeSingle(),
      supabase.from('user_territory_config').select('user_id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('pieces').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('captures').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ])
    const onboarded = !!settings?.onboarded_at || (territoryRows ?? 0) > 0 || (pieceCount ?? 0) > 0 || (captureCount ?? 0) > 0
    return NextResponse.json({ onboarded })
  } catch (error) {
    console.error('onboarding GET error:', error)
    return NextResponse.json({ onboarded: true }, { status: 500 })
  }
}

const OPENING = `You are Companheiro, meeting someone for the first time. Over three short turns you will find the four territories their life keeps circling — the themes their thinking, feeling and making return to — so that this app can be built around their world, not a generic one.

Turn structure:
- Turn 1: ask one question. Something like: what does your life keep circling back to, even when you try to think about something else? Keep it to two sentences at most.
- Turn 2: reflect one thing you noticed in what they said, then ask one question that opens a second or third territory: what they make or want to make, what they are working through, what they refuse to give up.
- Turn 3: name, in your own words, the four territories you now see. Say them as short evocative labels (two to five words each), one per line, prefixed with "· ". Then one sentence inviting them to change any of the labels. Nothing else after that.

Never list more than four. Never use the word "territory" before turn 3. No preamble.`

/** POST /api/onboarding — streams the companion's next turn. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { messages } = (await request.json()) as { messages: Message[] }
    const history: Message[] = Array.isArray(messages) && messages.length > 0 ? messages : [{ role: 'user', content: 'Hello.' }]
    const userTurns = history.filter((m) => m.role === 'user').length
    const turn = Math.min(3, Math.max(1, userTurns))
    const system = `${OPENING}\n\n${COMPANION_TONE}\n\nYou are now on turn ${turn} of 3.`
    return streamClaudeText(
      { model: MODELS.deep, max_tokens: 400, system: withLanguage(system), messages: history },
      (full) => ({ turn, labels: turn === 3 ? extractLabels(full) : [] })
    )
  } catch (error) {
    console.error('onboarding POST error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function extractLabels(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[·•\-*]\s+/.test(l))
    .map((l) => l.replace(/^[·•\-*]\s+/, '').replace(/[.:]$/, '').trim())
    .filter((l) => l.length >= 2 && l.length <= 60)
    .slice(0, 4)
}

/**
 * PUT /api/onboarding — commit the chosen labels as custom territories,
 * enrich each with a range map + facet seeds, and mark onboarding done.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false }, { status: 401 })
    const { supabase, user } = auth
    const { labels } = (await request.json()) as { labels: string[] }
    const clean = (Array.isArray(labels) ? labels : []).map((l) => String(l).trim()).filter((l) => l.length >= 2).slice(0, 8)
    if (clean.length === 0) return NextResponse.json({ success: false, error: 'No territories' }, { status: 400 })

    const enriched: CustomSlot[] = await Promise.all(
      clean.map(async (label) => {
        const base: CustomSlot = { type: 'custom', key: customKey(label), label }
        try {
          const res = await anthropic.messages.create({
            model: MODELS.fast,
            max_tokens: 900,
            system: MAP_SYSTEM,
            messages: [{ role: 'user', content: `Generate a range map and facet seeds for the territory: "${label}"` }],
          })
          const text = res.content.find((b) => b.type === 'text')?.text ?? ''
          const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim())
          if (typeof parsed.rangeMap === 'string' && Array.isArray(parsed.facetSeeds)) {
            return { ...base, rangeMap: parsed.rangeMap, facetSeeds: parsed.facetSeeds.slice(0, 15) }
          }
        } catch (err) {
          console.error('onboarding map error:', err)
        }
        return base
      })
    )

    const now = new Date().toISOString()
    const [{ error: tErr }, { error: sErr }] = await Promise.all([
      supabase.from('user_territory_config').upsert({ user_id: user.id, slots: enriched, updated_at: now }, { onConflict: 'user_id' }),
      supabase.from('user_settings').upsert({ user_id: user.id, onboarded_at: now, updated_at: now }, { onConflict: 'user_id' }),
    ])
    if (tErr || sErr) {
      console.error('onboarding commit error:', tErr, sErr)
      return NextResponse.json({ success: false }, { status: 500 })
    }
    return NextResponse.json({ success: true, slots: enriched })
  } catch (error) {
    console.error('onboarding PUT error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

const MAP_SYSTEM = `You are writing a creative territory definition for an Idea Lab — a tool that helps writers find unexpected, expansive entry points into a theme.

Given a theme label, produce:
RANGE MAP — flowing text: one or two sentences naming the territory at its fullest span; then "Contains:" with at least 8 specific things it holds; then "Its lighter end:" (where possibility lives); then "Its heavier end:" (what is real and unresolved).
FACET SEEDS — exactly 12 tight phrases in the style "the [specific thing] — [the angle]", covering both ends, never restating the theme name.

Return only valid JSON: { "rangeMap": "...", "facetSeeds": ["...", ...] }`
