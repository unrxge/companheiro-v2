// GET /api/studio/projects — the shelf · POST — create a project (D-061)

import { NextResponse, type NextRequest } from 'next/server'
import {
  badRequest, fromDbError, isRecord, isString, isStringArray, nowIso, readJson, shelfProjects, withAuth,
} from '@/lib/studio/db'
import { nextPosition } from '@/lib/studio/nodes-db'
import type { CreateProjectRequest } from '@/lib/studio/types'
import type { Rule } from '@/lib/studio/node-types'

export async function GET() {
  return withAuth(async (auth) => {
    const projects = await shelfProjects(auth)
    return NextResponse.json({ projects })
  })
}

function parseCreate(body: unknown): CreateProjectRequest {
  if (!isRecord(body)) throw badRequest('body required')
  const title = isString(body.title) ? body.title.trim().slice(0, 120) : ''
  if (!isRecord(body.concept) || !isString(body.concept.body)) throw badRequest('concept.body required')
  const constraints = isStringArray(body.concept.constraints)
    ? body.concept.constraints.map((c) => c.trim()).filter(Boolean)
    : []
  const anchors = isStringArray(body.anchors) ? body.anchors.map((a) => a.trim()).filter(Boolean).slice(0, 12) : []
  const references: CreateProjectRequest['references'] = []
  if (Array.isArray(body.references)) {
    for (const r of body.references) {
      if (!isRecord(r) || !isString(r.url) || !r.url.trim()) continue
      references.push({
        url: r.url.trim(),
        title: isString(r.title) ? r.title.trim() : '',
        note: isString(r.note) ? r.note.trim() : '',
      })
    }
  }
  const compass_seed: CreateProjectRequest['compass_seed'] = []
  if (Array.isArray(body.compass_seed)) {
    for (const c of body.compass_seed) {
      if (!isRecord(c)) continue
      if (c.kind !== 'refusal' && c.kind !== 'non_negotiable') continue
      if (!isString(c.statement) || !c.statement.trim()) continue
      compass_seed.push({ kind: c.kind, statement: c.statement.trim(), quote: isString(c.quote) ? c.quote.trim() : '' })
    }
  }
  return {
    title: title || 'untitled project',
    concept: { body: body.concept.body, constraints },
    anchors,
    references,
    compass_seed,
  }
}

export async function POST(req: NextRequest) {
  return withAuth(async (auth) => {
    const input = parseCreate(await readJson(req))
    const sb = auth.supabase
    const now = nowIso()

    const constraintRules: Rule[] = input.concept.constraints.map((text) => ({
      id: crypto.randomUUID(),
      text,
      created_at: now,
    }))

    const { data: projectRow, error: pErr } = await sb
      .from('studio_projects')
      .insert({
        user_id: auth.user.id,
        title: input.title,
        intent: input.concept.body,
        rules: constraintRules,
        canvas_version: 1,
        composed_at: null,
      })
      .select('id')
      .single()
    if (pErr || !projectRow) throw fromDbError(pErr)
    const projectId = (projectRow as { id: string }).id

    try {
      // history of the concept as written, kept for drift/recalibration reading later
      const { error: rErr } = await sb.from('studio_concept_revisions').insert({
        user_id: auth.user.id,
        project_id: projectId,
        body: input.concept.body,
        constraints: input.concept.constraints,
        origin: 'creation',
      })
      if (rErr) throw fromDbError(rErr)

      // the root piece the board/shelf actually read
      const position = await nextPosition(auth, projectId, null)
      const { error: nErr } = await sb.from('studio_nodes').insert({
        user_id: auth.user.id,
        project_id: projectId,
        parent_id: null,
        position,
        title: input.title,
        intent: input.concept.body,
        beat: '',
        stands_whole: true,
        rules: constraintRules,
        body: '',
        status: 'open',
      })
      if (nErr) throw fromDbError(nErr)

      if (input.compass_seed.length > 0) {
        const seeds = input.compass_seed.map((c) => ({
          user_id: auth.user.id,
          project_id: projectId,
          kind: c.kind,
          statement: c.statement,
          proposed_statement: c.statement,
          status: 'pending',
          evidence: c.quote ? [{ quote: c.quote, at: now }] : [],
        }))
        const { error: cErr } = await sb.from('studio_compass_entries').insert(seeds)
        if (cErr) throw fromDbError(cErr)
      }
    } catch (e) {
      // never leave a half-made project on the shelf
      await sb.from('studio_projects').delete().eq('id', projectId)
      throw e
    }

    return NextResponse.json({ bundle: { project: { id: projectId } } }, { status: 201 })
  })
}
