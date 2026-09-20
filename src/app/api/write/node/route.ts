import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'

// GET ?node_id= — the Write-mode bundle for one root piece node: the same
// shape /api/project-board/piece used to return for a `pieces` row, sourced
// from studio_nodes + studio_tasks instead. This is the node_id-based
// replacement write/page.tsx (and write/translate/page.tsx) use in place of
// /api/project-board/piece, which stays untouched and pieces-only — see
// CLAUDE.md's Phase 3 notes on why that route couldn't just be repointed.
//
// `one_sentence` has no equivalent on the node/thread model (it lived on the
// linked `ideas` row) and comes back empty; every caller already treats it as
// optional display, never a hard requirement. `stage` likewise has no
// studio_nodes equivalent (nothing downstream reads a write-journey stage for
// a node) and is left undefined.

interface Task {
  id: string
  title: string
  type: 'creation' | 'execution'
  status: 'pending' | 'complete'
  is_writing_related: boolean | null
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const { supabase, user } = auth

    const nodeId = request.nextUrl.searchParams.get('node_id')
    if (!nodeId) return NextResponse.json({ success: false, error: 'Missing node_id' }, { status: 400 })

    const [{ data: node, error: nodeError }, { data: tasksData, error: tasksError }] = await Promise.all([
      supabase
        .from('studio_nodes')
        .select(
          'id, project_id, title, intent, emotional_journey, core_truth, substack_goals, short_form_goals, open_threads, body, short_form_script, writing_ethos'
        )
        .eq('id', nodeId)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('studio_tasks')
        .select('id, title, type, status, is_writing_related')
        .eq('node_id', nodeId)
        .eq('user_id', user.id)
        .order('order', { ascending: true }),
    ])

    if (nodeError || !node) {
      console.error('Node not found:', nodeError)
      return NextResponse.json({ success: false, error: 'Piece not found' }, { status: 404 })
    }
    if (tasksError) console.error('Tasks query error:', tasksError)

    // Writing in a piece counts as opening its project (the Project Board sorts
    // by last accessed). Best-effort: never blocks the bundle.
    if (node.project_id) {
      const { error: openError } = await supabase.rpc('studio_open_project', { p_project_id: node.project_id })
      if (openError) console.error('studio_open_project error:', openError)
    }

    return NextResponse.json({
      success: true,
      piece: {
        id: node.id,
        project_id: node.project_id,
        title: node.title || '',
        one_sentence: '',
        conviction_statement: node.intent || '',
        emotional_journey: node.emotional_journey || '',
        core_truth: node.core_truth || '',
        substack_goals: node.substack_goals || '',
        short_form_goals: node.short_form_goals || '',
        open_threads: node.open_threads || [],
        substack_draft: node.body || '',
        short_form_script: node.short_form_script || '',
        writing_ethos: node.writing_ethos || '',
        tasks: (tasksData || []) as Task[],
      },
    })
  } catch (error) {
    console.error('Write node bundle error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
