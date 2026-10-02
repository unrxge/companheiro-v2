import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { requireProject } from '@/lib/studio/db'
import { assertWorkable } from '@/lib/studio/plan-access'
import { pieceOf, readPiece, restorePiece, type RevisionPart } from '@/lib/studio/revisions'

// Document history for a piece. GET ?node_id= lists its revisions (any node in
// the piece works); GET ?revision_id= returns one with its words; POST
// { revision_id } restores it.

// PostgREST's "relation does not exist" — migration 027 not applied yet.
const missingTable = (e: { code?: string } | null) => e?.code === '42P01' || e?.code === 'PGRST205'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { supabase, user } = auth
    const params = request.nextUrl.searchParams

    const revisionId = params.get('revision_id')
    if (revisionId) {
      const { data, error } = await supabase
        .from('studio_piece_revisions')
        .select('id, piece_id, created_at, reason, word_count, parts')
        .eq('id', revisionId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (missingTable(error)) return NextResponse.json({ unavailable: true })
      if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ revision: data })
    }

    const nodeId = params.get('node_id')
    if (!nodeId) return NextResponse.json({ error: 'Missing node_id' }, { status: 400 })
    const pieceId = await pieceOf(auth, nodeId)
    if (!pieceId) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })

    const [{ data, error }, current] = await Promise.all([
      supabase
        .from('studio_piece_revisions')
        .select('id, created_at, reason, word_count')
        .eq('piece_id', pieceId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(150),
      readPiece(auth, pieceId),
    ])
    if (missingTable(error)) return NextResponse.json({ unavailable: true })
    if (error) throw error
    return NextResponse.json({ piece_id: pieceId, revisions: data ?? [], current: current?.parts ?? [] })
  } catch (error) {
    console.error('history GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { supabase, user } = auth
    const { revision_id } = await request.json()
    if (!revision_id) return NextResponse.json({ error: 'Missing revision_id' }, { status: 400 })

    const { data: rev, error } = await supabase
      .from('studio_piece_revisions')
      .select('id, piece_id, parts')
      .eq('id', revision_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (missingTable(error)) return NextResponse.json({ unavailable: true }, { status: 409 })
    if (error || !rev) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const current = await readPiece(auth, rev.piece_id)
    if (!current) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })
    try {
      await assertWorkable(auth, await requireProject(auth, current.projectId))
    } catch {
      return NextResponse.json({ error: 'This project is read-only right now.' }, { status: 409 })
    }

    const parts = (Array.isArray(rev.parts) ? rev.parts : []) as RevisionPart[]
    if (parts.length === 0) return NextResponse.json({ error: 'That version is empty' }, { status: 400 })
    await restorePiece(auth, rev.piece_id, parts)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('history restore error:', error)
    return NextResponse.json({ error: 'Could not restore that version.' }, { status: 500 })
  }
}
