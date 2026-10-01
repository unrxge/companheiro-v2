// POST /api/check-in/carry — { project_id, text } → { ok }
//
// The person tapped "send it there": their words from a check-in are left on
// that project as a card, waiting. Nothing is added to the project until they
// open it and answer the card there (/api/studio/projects/:id/carried), where
// approving makes it a thread. The waiting cards live in the project's
// settings, so no schema change was needed.

import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import type { CarriedThought } from '@/lib/studio/types'

const MAX_WAITING = 12

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const projectId = typeof body.project_id === 'string' ? body.project_id : ''
    const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 2000) : ''
    if (!projectId || !text) return NextResponse.json({ ok: false, error: 'Nothing to send' }, { status: 400 })

    const { supabase, user } = auth
    const { data: project } = await supabase
      .from('studio_projects')
      .select('id, settings')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!project) return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 })

    const settings = (project.settings ?? {}) as Record<string, unknown> & { carried?: CarriedThought[] }
    const waiting = Array.isArray(settings.carried) ? settings.carried : []
    // The same words sent twice wait once.
    if (!waiting.some((c) => c.text === text)) {
      const next = [...waiting, { id: crypto.randomUUID(), text, at: new Date().toISOString() }].slice(-MAX_WAITING)
      const { error } = await supabase
        .from('studio_projects')
        .update({ settings: { ...settings, carried: next } })
        .eq('id', projectId)
        .eq('user_id', user.id)
      if (error) {
        console.error('check-in/carry update error:', error)
        return NextResponse.json({ ok: false, error: 'Could not send it' }, { status: 500 })
      }
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('check-in/carry error:', error)
    return NextResponse.json({ ok: false, error: 'Could not send it' }, { status: 500 })
  }
}
