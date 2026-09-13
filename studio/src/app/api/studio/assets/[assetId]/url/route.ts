// GET /api/studio/assets/:assetId/url — fresh 60-minute signed urls (lane E, section 4).
// The client calls this when an <img>/<audio> fails after the bundle's urls expired.

import { NextResponse, type NextRequest } from 'next/server'
import { fromDbError, isUuid, notFound, signAssets, withAuth } from '@/lib/studio/db'
import type { Asset } from '@/lib/studio/types'

type Params = { params: Promise<{ assetId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { assetId } = await params
  return withAuth(async (auth) => {
    if (!isUuid(assetId)) throw notFound()
    const { data, error } = await auth.supabase
      .from('studio_assets')
      .select('*')
      .eq('id', assetId)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (error) throw fromDbError(error)
    if (!data) throw notFound()
    const [view] = await signAssets(auth, [data as Asset])
    return NextResponse.json({ url: view.url, thumb_url: view.thumb_url })
  })
}
