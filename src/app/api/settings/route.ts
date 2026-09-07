import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'

interface Settings {
  dictation_lang: string | null
  sunday_letter: boolean
  onboarded_at: string | null
}

const EMPTY: Settings = { dictation_lang: null, sunday_letter: false, onboarded_at: null }

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ settings: EMPTY }, { status: 401 })
    const { supabase, user } = auth
    const { data } = await supabase
      .from('user_settings')
      .select('dictation_lang, sunday_letter, onboarded_at')
      .eq('user_id', user.id)
      .maybeSingle()
    return NextResponse.json({ settings: { ...EMPTY, ...(data ?? {}) }, email: user.email ?? null })
  } catch (error) {
    console.error('settings GET error:', error)
    return NextResponse.json({ settings: EMPTY }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false }, { status: 401 })
    const { supabase, user } = auth
    const body: Partial<Settings> = await request.json()

    const patch: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() }
    if ('dictation_lang' in body) patch.dictation_lang = body.dictation_lang || null
    if (typeof body.sunday_letter === 'boolean') patch.sunday_letter = body.sunday_letter
    if ('onboarded_at' in body) patch.onboarded_at = body.onboarded_at

    const { error } = await supabase.from('user_settings').upsert(patch, { onConflict: 'user_id' })
    if (error) {
      console.error('settings upsert error:', error)
      return NextResponse.json({ success: false }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('settings PUT error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
