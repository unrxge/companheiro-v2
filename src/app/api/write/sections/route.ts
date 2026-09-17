import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { bodyPatch, loadWriteSections, resyncNodeBody } from '@/lib/studio/write-nodes'

// GET  ?node_id=  -> { sections, anchorLines, writing_ethos }
// POST            -> create a section (a child studio_node under node_id)
// PATCH           -> update a section (content/label/intended_emotion/is_locked/position)
// DELETE          -> delete a section
//
// `node_id` is always the ROOT piece node. A "section" is one of its children
// (parent_id = node_id), ordered by position — see lib/studio/write-nodes.ts.

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const nodeId = request.nextUrl.searchParams.get('node_id')
    if (!nodeId) return NextResponse.json({ error: 'Missing node_id' }, { status: 400 })

    const { supabase, user } = auth

    const [sections, { data: root }] = await Promise.all([
      loadWriteSections(auth, nodeId),
      supabase
        .from('studio_nodes')
        .select('project_id, writing_ethos')
        .eq('id', nodeId)
        .eq('user_id', user.id)
        .single(),
    ])

    // Scoped by project_id, same as the old piece_id scoping — narrower
    // per-piece scoping isn't possible with studio_anchor_lines' shape when a
    // project holds more than one root piece; see the Phase 3 report.
    type AnchorRow = { id: string; node_id: string | null; text: string; created_at: string }
    const anchorLines: AnchorRow[] = root
      ? ((
          await supabase
            .from('studio_anchor_lines')
            .select('id, node_id, text, created_at')
            .eq('project_id', root.project_id)
            .eq('user_id', user.id)
            .order('created_at', { ascending: true })
        ).data as AnchorRow[] | null) || []
      : []

    return NextResponse.json({
      sections,
      anchorLines: anchorLines.map((l) => ({
        id: l.id,
        section_id: l.node_id,
        text: l.text,
      })),
      writing_ethos: root?.writing_ethos ?? null,
    })
  } catch (error) {
    console.error('sections GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { node_id, label, intended_emotion, content, position } = await request.json()
    if (!node_id) return NextResponse.json({ error: 'Missing node_id' }, { status: 400 })

    const { supabase, user } = auth

    const { data: root, error: rootError } = await supabase
      .from('studio_nodes')
      .select('id, project_id')
      .eq('id', node_id)
      .eq('user_id', user.id)
      .single()
    if (rootError || !root) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })

    // Default new section to the end if no position given
    let nextPosition = position
    if (nextPosition === undefined || nextPosition === null) {
      const { data: last } = await supabase
        .from('studio_nodes')
        .select('position')
        .eq('parent_id', node_id)
        .eq('user_id', user.id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()
      nextPosition = last ? last.position + 1 : 0
    }

    const { data, error } = await supabase
      .from('studio_nodes')
      .insert({
        user_id: user.id,
        project_id: root.project_id,
        parent_id: node_id,
        position: nextPosition,
        title: label ?? '',
        beat: intended_emotion ?? '',
        ...bodyPatch(content ?? ''),
      })
      .select('id, position, title, beat, body, is_locked')
      .single()

    if (error) {
      console.error('section insert error:', error)
      return NextResponse.json({ error: 'Failed to create section' }, { status: 500 })
    }

    if (content?.trim()) await resyncNodeBody(auth, node_id)

    return NextResponse.json({
      section: { id: data.id, position: data.position, label: data.title || null, intended_emotion: data.beat || null, content: data.body || '', is_locked: data.is_locked },
    })
  } catch (error) {
    console.error('sections POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { id, node_id } = body
    if (!id || !node_id) return NextResponse.json({ error: 'Missing id/node_id' }, { status: 400 })

    const { supabase, user } = auth

    const update: Record<string, string | boolean | number | null> = {}
    if (body.content !== undefined) Object.assign(update, bodyPatch(body.content))
    if (body.label !== undefined) update.title = body.label
    if (body.intended_emotion !== undefined) update.beat = body.intended_emotion
    if (body.is_locked !== undefined) update.is_locked = body.is_locked
    if (body.position !== undefined) update.position = body.position

    const { error } = await supabase
      .from('studio_nodes')
      .update(update)
      .eq('id', id)
      .eq('parent_id', node_id)
      .eq('user_id', user.id)

    if (error) {
      console.error('section update error:', error)
      return NextResponse.json({ error: 'Failed to update section' }, { status: 500 })
    }

    if (body.content !== undefined) await resyncNodeBody(auth, node_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('sections PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, node_id } = await request.json()
    if (!id || !node_id) return NextResponse.json({ error: 'Missing id/node_id' }, { status: 400 })

    const { supabase, user } = auth

    const { error } = await supabase
      .from('studio_nodes')
      .delete()
      .eq('id', id)
      .eq('parent_id', node_id)
      .eq('user_id', user.id)

    if (error) {
      console.error('section delete error:', error)
      return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 })
    }

    await resyncNodeBody(auth, node_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('sections DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
