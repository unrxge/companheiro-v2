// PATCH /api/studio/assets/:assetId — own_voice / transcript (lane E, section 4).
// Turning own_voice off nulls the transcript (a reference is never listened to);
// a transcript on a non-own-voice asset is a 400 (and a DB check). Returns the
// AssetView: signed urls, never storage paths (D-059).

import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, fromDbError, isString, isUuid, notFound, readJson, signAssets, withAuth } from '@/lib/studio/db'
import type { Asset } from '@/lib/studio/types'

type Params = { params: Promise<{ assetId: string }> }

const MAX_TRANSCRIPT = 20000

export async function PATCH(req: NextRequest, { params }: Params) {
  const { assetId } = await params
  return withAuth(async (auth) => {
    if (!isUuid(assetId)) throw notFound()
    const body = await readJson<Record<string, unknown>>(req)

    const { data: existing, error: readErr } = await auth.supabase
      .from('studio_assets')
      .select('*')
      .eq('id', assetId)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (readErr) throw fromDbError(readErr)
    if (!existing) throw notFound()
    const current = existing as Asset

    if (body.own_voice !== undefined && typeof body.own_voice !== 'boolean') throw badRequest('own_voice must be a boolean')
    if (body.transcript !== undefined && body.transcript !== null && !isString(body.transcript)) {
      throw badRequest('transcript must be text or null')
    }
    if (body.own_voice === undefined && body.transcript === undefined) throw badRequest('nothing to change')

    const own_voice = body.own_voice === undefined ? current.own_voice : (body.own_voice as boolean)
    const patch: Record<string, unknown> = { own_voice }
    if (body.transcript !== undefined) {
      const transcript = body.transcript === null ? null : (body.transcript as string).trim().slice(0, MAX_TRANSCRIPT) || null
      if (transcript && !own_voice) throw badRequest('a transcript needs own_voice')
      patch.transcript = transcript
    }
    if (!own_voice) patch.transcript = null

    const { data, error } = await auth.supabase
      .from('studio_assets')
      .update(patch)
      .eq('id', assetId)
      .eq('user_id', auth.user.id)
      .select('*')
      .maybeSingle()
    if (error) throw fromDbError(error)
    if (!data) throw notFound()

    const [asset] = await signAssets(auth, [data as Asset])
    return NextResponse.json({ asset })
  })
}
