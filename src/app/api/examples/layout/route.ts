// POST /api/examples/layout { project_id, layout } — where things were dragged
// on an example's canvas. Everyone's arrangement stays in their own browser
// (lib/examples/layout.ts); this keeps it only for the owner (ADMIN_USER_IDS),
// in the auth user's metadata (`example_layout`), so the arrangement the owner
// leaves can be read back (scripts/example-layout.mjs) and written into the
// example as the one every new account starts from. Anyone else gets 204 and
// nothing is kept.

import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { adminIds } from '@/lib/ops/admin'
import { exampleOfId } from '@/lib/examples'

const MAX_SPOTS = 120

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth || !adminIds().includes(auth.user.id)) return new NextResponse(null, { status: 204 })
    const body = (await request.json().catch(() => ({}))) as { project_id?: unknown; layout?: unknown }
    const projectId = typeof body.project_id === 'string' ? body.project_id : ''
    if (!exampleOfId(projectId) || projectId.includes('--')) return NextResponse.json({ error: 'not an example' }, { status: 400 })

    let spots: Record<string, [number, number] | null> | null = null
    if (body.layout && typeof body.layout === 'object') {
      spots = {}
      for (const [id, at] of Object.entries(body.layout as Record<string, unknown>).slice(0, MAX_SPOTS)) {
        if (!id.startsWith(`${projectId}--`)) continue
        const a = at as { x?: unknown; y?: unknown } | null
        spots[id] = a && Number.isFinite(a.x) && Number.isFinite(a.y) ? [Math.round(a.x as number), Math.round(a.y as number)] : null
      }
    }
    const kept = { ...((auth.user.user_metadata?.example_layout ?? {}) as Record<string, unknown>) }
    if (spots) kept[projectId] = spots
    else delete kept[projectId]
    const { error } = await auth.supabase.auth.updateUser({ data: { example_layout: kept } })
    if (error) {
      console.error('example layout error:', error)
      return NextResponse.json({ success: false }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('example layout error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
