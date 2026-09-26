import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'
import { logUsage } from '@/lib/usage-log'

// GET    ?node_id= -> the anchor lines for the piece's project (same scoping as /api/write/sections).
// POST   -> add an anchor line under a piece's root node_id. If no section_id
//           given, AI places it into the best-fitting existing section (a
//           child studio_node).
// DELETE -> remove an anchor line.
//
// Writes to studio_anchor_lines (migration 006): project_id + nullable
// node_id, mirroring anchor_lines' piece_id + nullable section_id.

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const nodeId = request.nextUrl.searchParams.get('node_id')
    if (!nodeId) return NextResponse.json({ error: 'Missing node_id' }, { status: 400 })

    const { supabase, user } = auth
    const { data: root } = await supabase
      .from('studio_nodes')
      .select('project_id')
      .eq('id', nodeId)
      .eq('user_id', user.id)
      .single()
    if (!root) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })

    const { data } = await supabase
      .from('studio_anchor_lines')
      .select('id, node_id, text')
      .eq('project_id', root.project_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })

    return NextResponse.json({
      anchorLines: (data ?? []).map((l) => ({ id: l.id, section_id: l.node_id, text: l.text })),
    })
  } catch (error) {
    console.error('anchor-lines GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { node_id, text, section_id } = await request.json()
    if (!node_id || !text?.trim()) {
      return NextResponse.json({ error: 'Missing node_id/text' }, { status: 400 })
    }

    const { supabase, user } = auth

    const { data: root, error: rootError } = await supabase
      .from('studio_nodes')
      .select('id, project_id')
      .eq('id', node_id)
      .eq('user_id', user.id)
      .single()
    if (rootError || !root) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })

    let resolvedSectionId: string | null = section_id ?? null

    // No explicit section → let the AI place the line into the best section.
    if (!resolvedSectionId) {
      const { data: sections } = await supabase
        .from('studio_nodes')
        .select('id, title, beat, body')
        .eq('parent_id', node_id)
        .eq('user_id', user.id)
        .order('position', { ascending: true })

      if (sections && sections.length > 0) {
        try {
          const response = await anthropic.messages.create({
            model: MODELS.fast,
            max_tokens: 60,
            system: `You place a writer's precious one-liner into whichever section it most belongs. Return ONLY the exact id of the best-fitting section, nothing else. If none fit well, return the id of the section whose intended emotion is closest.`,
            messages: [
              {
                role: 'user',
                content: `Line: "${text.trim()}"

Sections:
${sections
  .map(
    (s) =>
      `id: ${s.id} | ${s.title || 'untitled'} (emotion: ${s.beat || 'n/a'})${
        s.body ? ` | current text: ${s.body.slice(0, 200)}` : ''
      }`
  )
  .join('\n')}

Return the id only.`,
              },
            ],
          })
          logUsage(auth.user.id, 'write/anchor-lines', response.model, response.usage)
          const raw = response.content.find((b) => b.type === 'text')
          const guessed = raw && raw.type === 'text' ? raw.text.trim() : ''
          const match = sections.find((s) => guessed.includes(s.id))
          resolvedSectionId = match ? match.id : null
        } catch (err) {
          // Placement is best-effort — fall back to unassigned.
          console.error('anchor-line placement error:', err)
          resolvedSectionId = null
        }
      }
    }

    const { data, error } = await supabase
      .from('studio_anchor_lines')
      .insert({
        user_id: user.id,
        project_id: root.project_id,
        node_id: resolvedSectionId,
        text: text.trim(),
      })
      .select('id, node_id, text, created_at')
      .single()

    if (error) {
      console.error('anchor-line insert error:', error)
      return NextResponse.json({ error: 'Failed to add anchor line' }, { status: 500 })
    }

    return NextResponse.json({ anchorLine: { id: data.id, section_id: data.node_id, text: data.text } })
  } catch (error) {
    console.error('anchor-lines POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { supabase, user } = auth

    const { error } = await supabase
      .from('studio_anchor_lines')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('anchor-line delete error:', error)
      return NextResponse.json({ error: 'Failed to delete anchor line' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('anchor-lines DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
