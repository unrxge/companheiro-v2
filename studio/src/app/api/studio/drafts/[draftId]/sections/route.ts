// PUT /api/studio/drafts/:draftId/sections — ordered replace of every section.
// A section whose server copy is locked must arrive unchanged (409 otherwise).

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, conflict, fromDbError, isRecord, isString, isUuid, notFound, nowIso, readJson,
  requireProject, withAuth,
} from '@/lib/studio/db'
import type { Draft, DraftSection } from '@/lib/studio/types'

type Params = { params: Promise<{ draftId: string }> }

type Incoming = Pick<DraftSection, 'id' | 'position' | 'label' | 'content' | 'is_locked'>

const MAX_SECTIONS = 200

function parseSections(v: unknown): Incoming[] {
  if (!Array.isArray(v)) throw badRequest('sections must be an array')
  if (v.length > MAX_SECTIONS) throw badRequest(`at most ${MAX_SECTIONS} sections`)
  const seen = new Set<string>()
  const out: Incoming[] = []
  for (const raw of v) {
    if (!isRecord(raw)) throw badRequest('each section must be an object')
    if (!isUuid(raw.id)) throw badRequest('section id must be a uuid')
    if (seen.has(raw.id)) throw badRequest('duplicate section id')
    seen.add(raw.id)
    if (raw.label !== null && raw.label !== undefined && !isString(raw.label)) throw badRequest('label must be text or null')
    if (!isString(raw.content)) throw badRequest('content must be text')
    out.push({
      id: raw.id,
      position: typeof raw.position === 'number' && Number.isFinite(raw.position) ? Math.round(raw.position) : out.length,
      label: isString(raw.label) ? raw.label.slice(0, 120) : null,
      content: raw.content,
      is_locked: raw.is_locked === true,
    })
  }
  // ordered replace: sort by the given position, then renumber 0..n-1
  out.sort((a, b) => a.position - b.position)
  return out.map((s, i) => ({ ...s, position: i }))
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { draftId } = await params
  return withAuth(async (auth) => {
    const body = await readJson<Record<string, unknown>>(req)
    const incoming = parseSections(body.sections)
    if (!isUuid(draftId)) throw notFound()

    const { data: draftRow, error: dErr } = await auth.supabase.from('studio_drafts').select('*').eq('id', draftId).maybeSingle()
    if (dErr) throw fromDbError(dErr)
    if (!draftRow) throw notFound()
    const draft = draftRow as Draft
    assertProjectWritable(await requireProject(auth, draft.project_id))

    const { data: currentRows, error: cErr } = await auth.supabase
      .from('studio_draft_sections')
      .select('*')
      .eq('draft_id', draft.id)
    if (cErr) throw fromDbError(cErr)
    const current = (currentRows as DraftSection[] | null) ?? []
    const byId = new Map(incoming.map((s) => [s.id, s]))

    for (const server of current) {
      if (!server.is_locked) continue
      const next = byId.get(server.id)
      if (!next || next.content !== server.content || (next.label ?? null) !== (server.label ?? null) || !next.is_locked) {
        throw conflict('locked section changed')
      }
    }

    const sb = auth.supabase
    if (incoming.length > 0) {
      const rows = incoming.map((s) => ({ ...s, user_id: auth.user.id, draft_id: draft.id }))
      const { error } = await sb.from('studio_draft_sections').upsert(rows, { onConflict: 'id' })
      if (error) throw fromDbError(error)
    }
    const gone = current.filter((s) => !byId.has(s.id)).map((s) => s.id)
    if (gone.length > 0) {
      const { error } = await sb.from('studio_draft_sections').delete().in('id', gone).eq('draft_id', draft.id)
      if (error) throw fromDbError(error)
    }
    // the card's `edited …` line follows the sections, not only the title
    await sb.from('studio_drafts').update({ updated_at: nowIso() }).eq('id', draft.id)

    const { data: after, error: aErr } = await sb
      .from('studio_draft_sections')
      .select('*')
      .eq('draft_id', draft.id)
      .order('position', { ascending: true })
    if (aErr) throw fromDbError(aErr)
    return NextResponse.json({ sections: (after as DraftSection[] | null) ?? [] })
  })
}
