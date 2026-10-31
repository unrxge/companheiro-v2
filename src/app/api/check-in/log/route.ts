import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { distillPortrait } from '@/lib/portrait'
import { missingTemperament } from '@/lib/check-in-columns'
import { asTemperament } from '@/lib/design-tokens'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      id,
      finalise,
      raw_entry,
      full_conversation,
      energy,
      inner_weather,
      creative_readiness,
      arc_texture,
      temperament,
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

    const row: Record<string, unknown> = {
      raw_entry,
      full_conversation: full_conversation ?? null,
      energy,
      inner_weather,
      creative_readiness: creative_readiness ?? false,
      arc_texture: arc_texture ?? null,
      check_in_type: check_in_type ?? null,
      dream_content: dream_content ?? null,
      engaged_with_deeper_work: engaged_with_deeper_work ?? false,
      temperament: asTemperament(temperament),
    }

    // The check-in saves itself as the conversation goes: the first call
    // creates the row, every call after updates it in place. Nobody has to
    // remember to press anything at the end of saying something hard.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = (supabase as any).from('check_ins')
    const write = (r: Record<string, unknown>) =>
      (id ? table.update(r).eq('id', id).eq('user_id', user.id) : table.insert({ ...r, user_id: user.id })).select().single()

    let { data, error } = await write(row)
    if (missingTemperament(error)) {
      // Migration 040 not applied yet: save everything else.
      const rest = { ...row }
      delete rest.temperament
      ;({ data, error } = await write(rest))
    }

    if (error) {
      console.error('supabase write error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Distillation is expensive and reads the conversation as a whole, so it
    // runs once the conversation is actually over — not on every autosave.
    if (finalise) {
      const material = full_conversation
        ? `${raw_entry}\n\nFull conversation:\n${full_conversation}`
        : raw_entry
      await distillPortrait({ supabase, user }, 'check_in', material, data?.id ?? id ?? null)
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('check-in log error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
