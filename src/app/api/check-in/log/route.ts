import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { distillPortrait } from '@/lib/portrait'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      raw_entry,
      full_conversation,
      energy,
      inner_weather,
      creative_readiness,
      arc_texture,
      check_in_type,
      dream_content,
      engaged_with_deeper_work,
    } = body

    if (!raw_entry || !energy || !inner_weather) {
      return NextResponse.json(
        { error: 'raw_entry, energy, and inner_weather are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('check_ins')
      .insert({
        user_id: user.id,
        raw_entry,
        full_conversation: full_conversation ?? null,
        energy,
        inner_weather,
        creative_readiness: creative_readiness ?? false,
        arc_texture: arc_texture ?? null,
        check_in_type: check_in_type ?? null,
        dream_content: dream_content ?? null,
        engaged_with_deeper_work: engaged_with_deeper_work ?? false,
      })
      .select()
      .single()

    if (error) {
      console.error('supabase insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Distill what this check-in reveals about how they process things.
    // Never blocks the response on failure.
    const material = full_conversation
      ? `${raw_entry}\n\nFull conversation:\n${full_conversation}`
      : raw_entry
    await distillPortrait({ supabase, user }, 'check_in', material)

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('check-in log error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
