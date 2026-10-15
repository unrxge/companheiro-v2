// POST /api/studio/projects/:id/vision/kept — the person's answer about a
// decision or an open question.
//   { action: 'keep', id, text?, why? }        a line heard in talk is kept, with their rewording
//   { action: 'decline', id }                  not this: it leaves and is never offered again
//   { action: 'remove', id }                   a kept line is taken off the page
//   { action: 'settle', id, text, why? }       a project-wide open question is answered: it becomes a decision
//   { action: 'add', kind, text, why?, node_id? }  written straight onto the page by hand
//
// An open question raised here, in talk or by hand, stays here, tied to the
// piece it is about (or to the whole project). It is kept apart from the
// open threads the core concept was locked with, so either page can show
// which is which; the concept's own threads change through ../../concept.

import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, conflict, isRecord, isString, isUuid, nowIso, readJson, requireProject, withAuth } from '@/lib/studio/db'
import { assertFeature, assertProjectIdWorkable } from '@/lib/studio/plan-access'
import { normalise } from '@/lib/studio/talk/verbatim'
import { changeVision } from '@/lib/studio/vision/store'
import type { KeptLine } from '@/lib/studio/vision/types'

type Params = { params: Promise<{ id: string }> }

const KEPT_MAX = 80
const line = (v: unknown, max: number) => (isString(v) ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body) || !isString(body.action)) throw badRequest('action required')
    const action = body.action
    const project = await requireProject(auth, id)
    await assertProjectIdWorkable(auth, project.id)
    await assertFeature(auth, 'visionTalk')

    const text = line(body.text, 220)
    const why = line(body.why, 200)

    const next = await changeVision(auth, project.id, (now) => {
      if (action === 'add') {
        if (!text) throw badRequest('it needs words')
        const fresh: KeptLine = {
          id: crypto.randomUUID(), kind: body.kind === 'open' ? 'open' : 'decision',
          node_id: isUuid(body.node_id) ? body.node_id : null,
          text, why: body.kind === 'open' ? '' : why, quote: '', at: nowIso(), state: 'kept',
        }
        return { ...now, kept: [...now.kept, fresh].slice(-KEPT_MAX) }
      }
      const found = now.kept.find((k) => k.id === body.id)
      if (!found) throw conflict('already answered')
      const others = now.kept.filter((k) => k.id !== found.id)
      if (action === 'keep') {
        if (found.state !== 'pending') throw conflict('already answered')
        return { ...now, kept: [...others, { ...found, text: text || found.text, why: found.kind === 'open' ? '' : (isString(body.why) ? why : found.why), state: 'kept' as const }].slice(-KEPT_MAX) }
      }
      if (action === 'decline') {
        if (found.state !== 'pending') throw conflict('already answered')
        return { ...now, kept: others, declined: [...now.declined, normalise(found.text)].slice(-60) }
      }
      if (action === 'remove') return { ...now, kept: others }
      if (action === 'settle') {
        if (found.kind !== 'open') throw badRequest('only an open question can be settled')
        if (!text) throw badRequest('say what was decided')
        return { ...now, kept: [...others, { ...found, kind: 'decision' as const, text, why, at: nowIso(), state: 'kept' as const }] }
      }
      throw badRequest('unknown action')
    })
    return NextResponse.json({ kept: next.kept, changes: next.changes })
  })
}
