// POST /api/studio/projects/:id/drafts — a draft with one empty section and its block (9.6)

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, bumpCanvasVersion, fromDbError, isFiniteNumber, isString, nextZ, nowIso, readJson, requireProject,
  snap8, toDraftSummary, withAuth,
} from '@/lib/studio/db'
import { registry } from '@/lib/studio/registry'
import type { AnyBlock, Draft, DraftKind, DraftSection } from '@/lib/studio/types'

type Params = { params: Promise<{ id: string }> }

const KINDS: ReadonlySet<string> = new Set(['essay', 'brief', 'copy', 'lyrics', 'other'])

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson<Record<string, unknown>>(req)
    const title = isString(body.title) && body.title.trim() ? body.title.trim().slice(0, 120) : 'untitled draft'
    const kind: DraftKind = isString(body.kind) && KINDS.has(body.kind) ? (body.kind as DraftKind) : 'essay'
    const x = isFiniteNumber(body.x) ? snap8(body.x) : 0
    const y = isFiniteNumber(body.y) ? snap8(body.y) : 0

    const project = await requireProject(auth, id)
    assertProjectWritable(project)
    const sb = auth.supabase

    const { data: draftRow, error: dErr } = await sb
      .from('studio_drafts')
      .insert({ user_id: auth.user.id, project_id: id, title, kind, posture: 'ask' })
      .select('*')
      .single()
    if (dErr || !draftRow) throw fromDbError(dErr)
    const draft = draftRow as Draft

    try {
      const { data: sectionRow, error: sErr } = await sb
        .from('studio_draft_sections')
        .insert({ user_id: auth.user.id, draft_id: draft.id, position: 0, label: null, content: '', is_locked: false })
        .select('*')
        .single()
      if (sErr || !sectionRow) throw fromDbError(sErr)
      const section = sectionRow as DraftSection

      const spec = registry.draft
      const z = await nextZ(auth, id)
      const now = nowIso()
      const row = {
        id: crypto.randomUUID(),
        user_id: auth.user.id,
        project_id: id,
        type: 'draft',
        x, y, w: spec.defaultW, h: spec.defaultH, z,
        parent_id: null,
        stacked_in: null,
        name: null,
        locked: false,
        hidden: false,
        collapsed: false,
        // while the first session is still composed for them the block flows into its region (D-064)
        placed_by: project.auto_layout ? 'auto' : 'person',
        arrival_state: 'placed',
        arrived_from: null,
        struck_at: null,
        struck_by: null,
        content: { draft_id: draft.id },
        created_at: now,
        deleted_at: null,
      }
      const { data: blockRow, error: bErr } = await sb.from('studio_blocks').insert(row).select('*').single()
      if (bErr || !blockRow) throw fromDbError(bErr)
      const block = blockRow as AnyBlock

      const { data: linked, error: lErr } = await sb
        .from('studio_drafts')
        .update({ block_id: block.id })
        .eq('id', draft.id)
        .select('*')
        .single()
      if (lErr || !linked) throw fromDbError(lErr)

      await bumpCanvasVersion(auth, id)
      const summary = toDraftSummary(linked as Draft, [section])
      return NextResponse.json({ draft: summary, block }, { status: 201 })
    } catch (e) {
      await sb.from('studio_drafts').delete().eq('id', draft.id)
      throw e
    }
  })
}
