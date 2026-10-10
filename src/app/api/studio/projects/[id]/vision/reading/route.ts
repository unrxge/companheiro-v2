// POST /api/studio/projects/:id/vision/reading — read the canvas now.
//   { }                          a fresh reading: the vision as it stands, and where it does not hold together
//   { dismiss: gapId }           "that is not a gap": it leaves, and a later reading does not raise it again
//
// Asked for, never automatic: nothing reads the canvas until the person says
// to, and what comes back is dated so a later change shows.

import { NextResponse, type NextRequest } from 'next/server'
import { aiGate } from '@/lib/billing/fair-use'
import { isRecord, isString, readJson, requireProject, withAuth } from '@/lib/studio/db'
import { assertFeature, assertProjectIdWorkable } from '@/lib/studio/plan-access'
import { normalise } from '@/lib/studio/talk/verbatim'
import { readCanvas } from '@/lib/studio/vision/read'
import { changeVision, loadCanvas, visionOf } from '@/lib/studio/vision/store'

export const maxDuration = 120

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req).catch(() => null)
    const project = await requireProject(auth, id)
    await assertProjectIdWorkable(auth, project.id)
    await assertFeature(auth, 'visionTalk')

    if (isRecord(body) && isString(body.dismiss)) {
      const gapId = body.dismiss
      const next = await changeVision(auth, project.id, (now) => {
        const gap = now.reading?.gaps.find((g) => g.id === gapId)
        if (!now.reading || !gap) return now
        return {
          ...now,
          reading: { ...now.reading, gaps: now.reading.gaps.filter((g) => g.id !== gapId) },
          gaps_dismissed: [...now.gaps_dismissed, normalise(gap.text)].slice(-60),
        }
      })
      return NextResponse.json({ reading: next.reading, stale: false })
    }

    const gated = await aiGate(auth)
    if (gated) return gated
    const canvas = await loadCanvas(auth, project)
    const reading = await readCanvas(auth, canvas, visionOf(project.settings))
    await changeVision(auth, project.id, (now) => ({ ...now, reading }))
    return NextResponse.json({ reading, stale: false })
  })
}
