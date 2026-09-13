// POST /api/studio/projects/:id/open — rotate the since window (D-032), sweep
// unsorted talk entries (D-054), return the since payload computed afterwards.

import { NextResponse, type NextRequest } from 'next/server'
import { fromDbError, isUuid, notFound, sinceFor, withAuth } from '@/lib/studio/db'
import { sweepUnsorted } from '@/lib/studio/talk/apply'
import type { SincePayload } from '@/lib/studio/types'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    if (!isUuid(id)) throw notFound()
    const { data, error } = await auth.supabase.rpc('studio_open_project', { p_project_id: id })
    if (error) throw fromDbError(error)
    if (!data) throw notFound()
    let since = data as SincePayload

    let swept = 0
    try {
      swept = await sweepUnsorted(auth, id)
    } catch (e) {
      // a failed sweep never blocks opening; sorted_at stays null so the next open retries
      console.error('[studio] sweepUnsorted:', e)
    }
    if (swept > 0) since = (await sinceFor(auth, id)) ?? since

    return NextResponse.json({ since })
  })
}
