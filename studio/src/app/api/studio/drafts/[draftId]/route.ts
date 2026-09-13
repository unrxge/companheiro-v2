// GET /api/studio/drafts/:draftId — draft + sections + the project's anchor lines
// PATCH — title / posture / kind · DELETE — the draft and (soft) its block

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, bumpCanvasVersion, fromDbError, isRecord, isString, isUuid, noContent, notFound,
  nowIso, readJson, requireProject, withAuth,
} from '@/lib/studio/db'
import type { Draft, DraftKind, DraftSection, Posture } from '@/lib/studio/types'
import type { AuthedContext } from '@/lib/supabase/route'

type Params = { params: Promise<{ draftId: string }> }

const KINDS: ReadonlySet<string> = new Set(['essay', 'brief', 'copy', 'lyrics', 'other'])
const POSTURES: ReadonlySet<string> = new Set(['suggest', 'ask', 'locked'])

async function loadDraft(auth: AuthedContext, draftId: string): Promise<Draft> {
  if (!isUuid(draftId)) throw notFound()
  const { data, error } = await auth.supabase.from('studio_drafts').select('*').eq('id', draftId).maybeSingle()
  if (error) throw fromDbError(error)
  if (!data) throw notFound()
  return data as Draft
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { draftId } = await params
  return withAuth(async (auth) => {
    const draft = await loadDraft(auth, draftId)
    const [sectionsRes, anchorsRes] = await Promise.all([
      auth.supabase
        .from('studio_draft_sections')
        .select('*')
        .eq('draft_id', draft.id)
        .order('position', { ascending: true }),
      auth.supabase
        .from('studio_blocks')
        .select('content, created_at')
        .eq('project_id', draft.project_id)
        .eq('type', 'anchor')
        .is('deleted_at', null)
        .is('struck_at', null)
        .order('created_at', { ascending: true }),
    ])
    if (sectionsRes.error) throw fromDbError(sectionsRes.error)
    if (anchorsRes.error) throw fromDbError(anchorsRes.error)
    const anchors = ((anchorsRes.data as Array<{ content: unknown }> | null) ?? [])
      .map((r) => (isRecord(r.content) && isString(r.content.text) ? r.content.text.trim() : ''))
      .filter(Boolean)
    return NextResponse.json({ draft, sections: (sectionsRes.data as DraftSection[] | null) ?? [], anchors })
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { draftId } = await params
  return withAuth(async (auth) => {
    const body = await readJson<Record<string, unknown>>(req)
    const patch: Record<string, unknown> = {}
    if (body.title !== undefined) {
      if (!isString(body.title) || !body.title.trim()) throw badRequest('title must be text')
      patch.title = body.title.trim().slice(0, 120)
    }
    if (body.posture !== undefined) {
      if (!isString(body.posture) || !POSTURES.has(body.posture)) throw badRequest('posture must be suggest, ask or locked')
      patch.posture = body.posture as Posture
    }
    if (body.kind !== undefined) {
      if (!isString(body.kind) || !KINDS.has(body.kind)) throw badRequest('unknown kind')
      patch.kind = body.kind as DraftKind
    }
    if (Object.keys(patch).length === 0) throw badRequest('nothing to change')

    const draft = await loadDraft(auth, draftId)
    assertProjectWritable(await requireProject(auth, draft.project_id))

    const { data, error } = await auth.supabase
      .from('studio_drafts')
      .update(patch)
      .eq('id', draft.id)
      .select('*')
      .single()
    if (error || !data) throw fromDbError(error)
    return NextResponse.json({ draft: data as Draft })
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { draftId } = await params
  return withAuth(async (auth) => {
    const draft = await loadDraft(auth, draftId)
    assertProjectWritable(await requireProject(auth, draft.project_id))

    if (draft.block_id) {
      const { error } = await auth.supabase
        .from('studio_blocks')
        .update({ deleted_at: nowIso() })
        .eq('id', draft.block_id)
        .is('deleted_at', null)
      if (error) throw fromDbError(error)
    }
    const { error } = await auth.supabase.from('studio_drafts').delete().eq('id', draft.id)
    if (error) throw fromDbError(error)
    await bumpCanvasVersion(auth, draft.project_id)
    return noContent()
  })
}
