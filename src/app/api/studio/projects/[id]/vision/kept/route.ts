// POST /api/studio/projects/:id/vision/kept — the person's answer about a
// decision or an open question.
//   { action: 'keep', id, text?, why? }     a line heard in talk is kept, with their rewording
//   { action: 'decline', id }               not this: it leaves and is never offered again
//   { action: 'remove', id }                a kept line is taken off the page
//   { action: 'settle', id, text?, why? }   an open question is answered: it becomes a decision
//   { action: 'add', kind, text, why? }     written straight onto the page by hand

import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, conflict, isRecord, isString, nowIso, readJson, requireProject, withAuth } from '@/lib/studio/db'
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
        const fresh: KeptLine = { id: crypto.randomUUID(), kind: body.kind === 'open' ? 'open' : 'decision', text, why: body.kind === 'open' ? '' : why, quote: '', at: nowIso(), state: 'kept' }
        return { ...now, kept: [...now.kept, fresh].slice(-KEPT_MAX) }
      }
      const target = now.kept.find((k) => k.id === body.id)
      if (!target) throw conflict('already answered')
      const others = now.kept.filter((k) => k.id !== target.id)
      if (action === 'keep') {
        if (target.state !== 'pending') throw conflict('already answered')
        return { ...now, kept: [...others, { ...target, text: text || target.text, why: target.kind === 'open' ? '' : (isString(body.why) ? why : target.why), state: 'kept' as const }].slice(-KEPT_MAX) }
      }
      if (action === 'decline') {
        if (target.state !== 'pending') throw conflict('already answered')
        return { ...now, kept: others, declined: [...now.declined, normalise(target.text)].slice(-60) }
      }
      if (action === 'remove') return { ...now, kept: others }
      if (action === 'settle') {
        if (target.kind !== 'open') throw badRequest('only an open question can be settled')
        if (!text) throw badRequest('say what was decided')
        return { ...now, kept: [...others, { ...target, kind: 'decision' as const, text, why, at: nowIso(), state: 'kept' as const }] }
      }
      throw badRequest('unknown action')
    })
    return NextResponse.json({ kept: next.kept })
  })
}
