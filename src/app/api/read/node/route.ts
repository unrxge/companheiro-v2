import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'

// GET ?node_id= — the Reading-room bundle for one root piece node: the same
// shape /api/project-board/piece?id= returns for a `pieces` row (the fields
// read/page.tsx reads), sourced from studio_nodes + studio_projects +
// studio_post_publication_logs instead. Companion to /api/write/node — see
// its header comment for why the pieces-only /api/project-board/piece
// couldn't just be repointed; the same reasoning applies here.
//
// `one_sentence` has no studio_nodes/studio_projects equivalent (see
// /api/write/node) and comes back empty. `arc`/`thematic_territory` live on
// studio_projects (migration 007), not the node. `stage` is derived from
// node.status + project.shelf_stage/short_form_script into the same string
// vocabulary journeyStepFromStage() (src/lib/design-tokens.ts) already
// understands — 'conceptualising'/'writing'/'translating'/'executing'/
// 'posted' — so read/page.tsx needs no extra branching to compute the active
// journey step; it calls journeyStepFromStage(piece.stage) exactly as it
// does for a `pieces` row. `posted_at` reads studio_projects.completed_at,
// set by /api/post-publication/log's node_id branch alongside
// shelf_stage = 'completed'.

interface Reflection {
  id: string
  thread: string | null
  what_it_opened: string | null
  unresolved: string | null
  natural_continuations: string[] | null
  created_at: string
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const { supabase, user } = auth

    const nodeId = request.nextUrl.searchParams.get('node_id')
    if (!nodeId) return NextResponse.json({ success: false, error: 'Missing node_id' }, { status: 400 })

    const { data: node, error: nodeError } = await supabase
      .from('studio_nodes')
      .select('id, project_id, title, core_truth, emotional_journey, body, short_form_script, status, created_at')
      .eq('id', nodeId)
      .eq('user_id', user.id)
      .single()

    if (nodeError || !node) {
      console.error('Node not found:', nodeError)
      return NextResponse.json({ success: false, error: 'Piece not found' }, { status: 404 })
    }

    const [{ data: project, error: projectError }, { data: reflection, error: reflectionError }] = await Promise.all([
      supabase
        .from('studio_projects')
        .select('arc, thematic_territory, shelf_stage, completed_at')
        .eq('id', node.project_id)
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('studio_post_publication_logs')
        .select('id, thread, what_it_opened, unresolved, natural_continuations, created_at')
        .eq('node_id', nodeId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (projectError) console.error('Project query error:', projectError)
    if (reflectionError) console.error('Reflection query error:', reflectionError)

    const stage = project?.shelf_stage === 'completed'
      ? 'posted'
      : node.status === 'done'
        ? 'executing'
        : node.short_form_script
          ? 'translating'
          : node.status === 'drafted'
            ? 'writing'
            : 'conceptualising'

    return NextResponse.json({
      success: true,
      piece: {
        id: node.id,
        project_id: node.project_id,
        title: node.title || '',
        arc: project?.arc || '',
        thematic_territory: project?.thematic_territory || '',
        one_sentence: '',
        core_truth: node.core_truth || '',
        emotional_journey: node.emotional_journey || '',
        substack_draft: node.body || '',
        short_form_script: node.short_form_script || '',
        stage,
        posted_at: project?.completed_at ?? null,
        created_at: node.created_at,
        reflection: (reflection ?? null) as Reflection | null,
      },
    })
  } catch (error) {
    console.error('Read node bundle error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
