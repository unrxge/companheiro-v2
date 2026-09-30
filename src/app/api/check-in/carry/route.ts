// POST /api/check-in/carry — { project_id, text } → { ok, fragment_id }
//
// The person tapped "add it there": their words from a check-in become a
// fragment on that project, unplaced, for them to put where it belongs from
// the writing page. The same words are listened to for a rule they may have
// set in passing; any is offered back in the piece's conversation, never
// kept on its own.

import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import type { Rule } from '@/lib/studio/node-types'
import { proposeRules } from '@/lib/studio/rule-proposals'

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const projectId = typeof body.project_id === 'string' ? body.project_id : ''
    const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, 2000) : ''
    if (!projectId || !text) return NextResponse.json({ ok: false, error: 'Nothing to add' }, { status: 400 })

    const { supabase, user } = auth
    const [{ data: project }, { data: roots }] = await Promise.all([
      supabase.from('studio_projects').select('id, intent, rules, settings').eq('id', projectId).eq('user_id', user.id).maybeSingle(),
      supabase.from('studio_nodes').select('id, intent, rules').eq('project_id', projectId).eq('user_id', user.id).is('parent_id', null).order('position'),
    ])
    if (!project) return NextResponse.json({ ok: false, error: 'Project not found' }, { status: 404 })

    const { data: fragment, error } = await supabase
      .from('studio_anchor_lines')
      .insert({ user_id: user.id, project_id: projectId, node_id: null, text })
      .select('id')
      .single()
    if (error || !fragment) {
      console.error('check-in/carry insert error:', error)
      return NextResponse.json({ ok: false, error: 'Could not add it' }, { status: 500 })
    }

    // A project of one piece talks on the piece's page; anything larger talks on the board.
    const settings = (project.settings ?? {}) as { board?: boolean }
    const lone = (roots ?? []).length === 1 && !settings.board ? roots![0] : null
    const live = (raw: unknown) => (Array.isArray(raw) ? (raw as Rule[]).filter((r) => r && !r.retired_at).map((r) => r.text) : [])
    try {
      await proposeRules(auth, {
        projectId,
        nodeId: lone?.id ?? null,
        text,
        intent: lone?.intent || project.intent || '',
        rulesInForce: [...live(project.rules), ...live(lone?.rules)],
        messageId: null,
        source: 'check-in',
      })
    } catch (e) {
      console.error('check-in/carry proposals failed (non-fatal):', e)
    }

    return NextResponse.json({ ok: true, fragment_id: fragment.id })
  } catch (error) {
    console.error('check-in/carry error:', error)
    return NextResponse.json({ ok: false, error: 'Could not add it' }, { status: 500 })
  }
}
