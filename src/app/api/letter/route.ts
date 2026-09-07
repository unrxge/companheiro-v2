import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { withLanguage } from '@/lib/language'
import { getActivePortrait, formatPortraitForPrompt } from '@/lib/portrait'

/**
 * The Sunday letter. Opt-in. One per week, generated lazily the first time it
 * is asked for on or after that week's Sunday. Draws equally on work,
 * captures and check-ins — never a stats dashboard, a short note in the
 * companion's voice.
 */

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** The Monday that starts the week whose Sunday is the most recent one (today if Sunday). */
function currentLetterWeek(now: Date): { weekStart: Date; weekEnd: Date; sunday: Date } {
  const sunday = new Date(now)
  sunday.setHours(0, 0, 0, 0)
  sunday.setDate(sunday.getDate() - sunday.getDay()) // back to Sunday (0)
  const weekStart = new Date(sunday)
  weekStart.setDate(sunday.getDate() - 6)
  const weekEnd = new Date(sunday)
  weekEnd.setHours(23, 59, 59, 999)
  return { weekStart, weekEnd, sunday }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ letter: null }, { status: 401 })
    const { supabase, user } = auth

    const { data: settings } = await supabase.from('user_settings').select('sunday_letter').eq('user_id', user.id).maybeSingle()
    if (!settings?.sunday_letter) return NextResponse.json({ letter: null, optedIn: false })

    const tz = Number(request.nextUrl.searchParams.get('tz_offset') ?? '0') // minutes, from the client
    const now = new Date(Date.now() - tz * 60_000)
    const { weekStart, weekEnd } = currentLetterWeek(now)
    const weekKey = toDateOnly(weekStart)

    const { data: existing } = await supabase
      .from('letters')
      .select('id, week_start, body, created_at, read_at')
      .eq('user_id', user.id)
      .eq('week_start', weekKey)
      .maybeSingle()
    if (existing) return NextResponse.json({ letter: existing, optedIn: true })

    const generate = request.nextUrl.searchParams.get('generate') === '1'
    if (!generate) return NextResponse.json({ letter: null, optedIn: true, weekStart: weekKey })

    // Gather the week.
    const startIso = weekStart.toISOString()
    const endIso = weekEnd.toISOString()
    const [{ data: checkIns }, { data: captures }, { data: sections }, { data: pieces }, { data: reflections }, portrait] = await Promise.all([
      supabase.from('check_ins').select('created_at, energy, inner_weather, arc_texture, raw_entry').eq('user_id', user.id).gte('created_at', startIso).lte('created_at', endIso).order('created_at'),
      supabase.from('captures').select('created_at, raw_input, arc, thematic_territory').eq('user_id', user.id).gte('created_at', startIso).lte('created_at', endIso).order('created_at'),
      supabase.from('piece_sections').select('piece_id, content, updated_at').eq('user_id', user.id).gte('updated_at', startIso).lte('updated_at', endIso),
      supabase.from('pieces').select('id, title, stage, arc, posted_at').eq('user_id', user.id).neq('stage', 'queued'),
      supabase.from('post_publication_logs').select('thread, unresolved, created_at').eq('user_id', user.id).gte('created_at', startIso).lte('created_at', endIso),
      getActivePortrait(auth),
    ])

    const pieceTitle = new Map((pieces || []).map((p) => [p.id, p.title]))
    const wordsByPiece = new Map<string, number>()
    for (const s of sections || []) {
      const n = (s.content || '').trim().split(/\s+/).filter(Boolean).length
      wordsByPiece.set(s.piece_id, (wordsByPiece.get(s.piece_id) ?? 0) + n)
    }
    const workLines = [...wordsByPiece.entries()].map(([id, n]) => `- "${pieceTitle.get(id) ?? 'untitled'}": about ${n} words touched`)
    const posted = (pieces || []).filter((p) => p.posted_at && p.posted_at >= startIso && p.posted_at <= endIso).map((p) => `- posted "${p.title}"`)

    const material = [
      workLines.length || posted.length ? `WORK THIS WEEK:\n${[...workLines, ...posted].join('\n')}` : 'WORK THIS WEEK: nothing written.',
      captures?.length ? `CAPTURES (${captures.length}):\n${captures.map((c) => `- ${c.raw_input.slice(0, 140)} [${c.arc ?? ''}]`).join('\n')}` : 'CAPTURES: none.',
      checkIns?.length ? `CHECK-INS (${checkIns.length}):\n${checkIns.map((c) => `- ${c.energy} energy, "${c.inner_weather}", ${c.arc_texture}: ${c.raw_entry.slice(0, 160)}`).join('\n')}` : 'CHECK-INS: none this week.',
      reflections?.length ? `REFLECTIONS AFTER PUBLISHING:\n${reflections.map((r) => `- thread "${r.thread}"; unresolved: ${r.unresolved}`).join('\n')}` : '',
      formatPortraitForPrompt(portrait),
    ]
      .filter(Boolean)
      .join('\n\n')

    const system = `You are Companheiro, writing a short Sunday letter to the person you accompany.

${COMPANION_TONE}

Rules for the letter:
- 120 to 220 words. Three short paragraphs at most. No greeting line, no sign-off, no bullet points, no numbers dressed up as insight.
- Draw on work, captures and check-ins with equal weight. If one of them is empty, do not remark on the absence; say what is there.
- Name one thing you noticed across the week. Name the piece or capture that seems most alive. End with a single question for the week ahead.
- Never summarise the list back. Write as someone who was there.`

    const res = await anthropic.messages.create({
      model: MODELS.deep,
      max_tokens: 500,
      system: withLanguage(system),
      messages: [{ role: 'user', content: `Here is the week (${weekKey} to ${toDateOnly(weekEnd)}):\n\n${material}\n\nWrite the letter.` }],
    })
    const body = res.content.find((b) => b.type === 'text')?.text?.trim() ?? ''
    if (!body) return NextResponse.json({ letter: null, optedIn: true, error: 'empty' }, { status: 500 })

    const { data: saved, error } = await supabase
      .from('letters')
      .upsert({ user_id: user.id, week_start: weekKey, body }, { onConflict: 'user_id,week_start' })
      .select('id, week_start, body, created_at, read_at')
      .single()
    if (error) {
      console.error('letter save error:', error)
      return NextResponse.json({ letter: { id: null, week_start: weekKey, body, created_at: new Date().toISOString(), read_at: null }, optedIn: true })
    }
    return NextResponse.json({ letter: saved, optedIn: true })
  } catch (error) {
    console.error('letter GET error:', error)
    return NextResponse.json({ letter: null }, { status: 500 })
  }
}

/** PATCH — mark a letter read. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false }, { status: 401 })
    const { id } = await request.json()
    if (!id) return NextResponse.json({ success: false }, { status: 400 })
    await auth.supabase.from('letters').update({ read_at: new Date().toISOString() }).eq('id', id).eq('user_id', auth.user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('letter PATCH error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
