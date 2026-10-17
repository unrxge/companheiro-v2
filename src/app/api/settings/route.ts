import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { analyticsChoiceOf } from '@/lib/usage-analytics'
import { examplesShown } from '@/lib/examples/shown'

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
    // Usage analytics: on unless switched off, and whether they have been told it exists (lib/usage-analytics.ts).
    // The example projects on the Project Board (lib/examples): on for new accounts until put away.
    return NextResponse.json({
      settings: { ...EMPTY, ...(data ?? {}) }, email: user.email ?? null, usage_analytics: analyticsChoiceOf(user.user_metadata),
      examples: { on: examplesShown(user.user_metadata, user.created_at) },
    })
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
    const body: Partial<Settings> & { usage_analytics?: boolean; usage_analytics_told?: boolean; examples?: boolean } = await request.json()

    // Whether the example projects are on the Project Board: kept on the account, like the analytics choice.
    if (typeof body.examples === 'boolean') {
      const { error } = await supabase.auth.updateUser({ data: { examples: { on: body.examples, changed_at: new Date().toISOString() } } })
      if (error) {
        console.error('settings examples error:', error)
        return NextResponse.json({ success: false }, { status: 500 })
      }
      if (Object.keys(body).length === 1) return NextResponse.json({ success: true })
    }

    // The usage analytics choice lives on the account itself, beside the record
    // of which Terms they agreed to. Choosing either way also means they have
    // been told; `usage_analytics_told` alone records that they saw the notice
    // and left it on.
    const choice = analyticsChoiceOf(user.user_metadata)
    if (typeof body.usage_analytics === 'boolean' || (body.usage_analytics_told === true && !choice.told)) {
      const now = new Date().toISOString()
      const kept = (user.user_metadata?.usage_analytics ?? {}) as Record<string, unknown>
      const next = typeof body.usage_analytics === 'boolean'
        ? { ...kept, on: body.usage_analytics, told_at: kept.told_at ?? now, changed_at: now }
        : { ...kept, on: choice.on, told_at: now }
      const { error } = await supabase.auth.updateUser({ data: { usage_analytics: next } })
      if (error) {
        console.error('settings usage analytics error:', error)
        return NextResponse.json({ success: false }, { status: 500 })
      }
      if (!('dictation_lang' in body) && typeof body.sunday_letter !== 'boolean' && !('onboarded_at' in body)) {
        return NextResponse.json({ success: true })
      }
    }

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
