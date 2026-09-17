// GET /api/studio/projects/:id/compass — every entry (all statuses) + every catch; the drawer groups them.

import { NextResponse, type NextRequest } from 'next/server'
import { fromDbError, normaliseCompass, requireProject, withAuth } from '@/lib/studio/db'
import type { Catch, CompassEntry } from '@/lib/studio/types'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    await requireProject(auth, id)
    const [entriesRes, catchesRes] = await Promise.all([
      auth.supabase
        .from('studio_compass_entries')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
      auth.supabase
        .from('studio_catches')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
    ])
    if (entriesRes.error) throw fromDbError(entriesRes.error)
    if (catchesRes.error) throw fromDbError(catchesRes.error)
    return NextResponse.json({
      entries: ((entriesRes.data as CompassEntry[] | null) ?? []).map(normaliseCompass),
      catches: (catchesRes.data as Catch[] | null) ?? [],
    })
  })
}
