// GET /api/studio/projects — the shelf · POST — create a project (D-061)

import { NextResponse, type NextRequest } from 'next/server'
import type { AuthedContext } from '@/lib/supabase/route'
import {
  badRequest, fromDbError, isRecord, isString, isStringArray, loadBundle, nowIso, readJson, shelfProjects, withAuth,
} from '@/lib/studio/db'
import { registry } from '@/lib/studio/registry'
import { composeNew } from '@/lib/studio/layout/compose'
import type { AnyBlock, BlockType, CreateProjectRequest } from '@/lib/studio/types'

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

function blockSeed(auth: AuthedContext, projectId: string, type: BlockType, content: Record<string, unknown>, z: number, now: string): AnyBlock {
  const s = registry[type]
  return {
    id: crypto.randomUUID(),
    user_id: auth.user.id,
    project_id: projectId,
    type,
    x: 0, y: 0, w: s.defaultW, h: s.defaultH, z,
    parent_id: null,
    stacked_in: null,
    name: null,
    locked: false,
    hidden: false,
    collapsed: false,
    placed_by: 'auto',
    arrival_state: 'placed',
    arrived_from: null,
    struck_at: null,
    struck_by: null,
    content,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  } as AnyBlock
}

export async function POST(req: NextRequest) {
  return withAuth(async (auth) => {
    const input = parseCreate(await readJson(req))
    const sb = auth.supabase

    const { data: projectRow, error: pErr } = await sb
      .from('studio_projects')
      .insert({ user_id: auth.user.id, title: input.title, canvas_version: 1, composed_at: null })
      .select('id')
      .single()
    if (pErr || !projectRow) throw fromDbError(pErr)
    const projectId = (projectRow as { id: string }).id

    try {
      const { error: rErr } = await sb.from('studio_concept_revisions').insert({
        user_id: auth.user.id,
        project_id: projectId,
        body: input.concept.body,
        constraints: input.concept.constraints,
        origin: 'creation',
      })
      if (rErr) throw fromDbError(rErr)

      // the three permanent blocks + anchors + references, z in insertion order
      const now = nowIso()
      let z = 0
      const concept = blockSeed(auth, projectId, 'concept', {}, ++z, now)
      const since = blockSeed(auth, projectId, 'since', {}, ++z, now)
      const compass = blockSeed(auth, projectId, 'compass', {}, ++z, now)
      const anchors = input.anchors.map((text) => blockSeed(auth, projectId, 'anchor', { text, source_block_id: null }, ++z, now))
      const references = input.references.map((r) =>
        blockSeed(auth, projectId, 'reference', { url: r.url, title: r.title, note: r.note }, ++z, now)
      )
      const all = [concept, since, compass, ...anchors, ...references]
      const byId = new Map(all.map((b) => [b.id, b]))
      for (const p of composeNew({ concept, since, compass, anchors, references })) {
        const b = byId.get(p.id)
        if (!b) continue
        b.x = p.x; b.y = p.y; b.w = p.w; b.h = p.h
      }
      const rows = all.map(({ updated_at: _u, ...row }) => row)
      const { error: bErr } = await sb.from('studio_blocks').insert(rows)
      if (bErr) throw fromDbError(bErr)

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

    const bundle = await loadBundle(auth, projectId)
    if (!bundle) throw fromDbError(null)
    return NextResponse.json({ bundle }, { status: 201 })
  })
}
