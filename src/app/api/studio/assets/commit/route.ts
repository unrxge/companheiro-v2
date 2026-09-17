// POST /api/studio/assets/commit — records what the client measured after the PUT
// (lane E, section 4): image width/height, audio duration + 24-sample envelope,
// own_voice and the live transcript. A transcript without own_voice is a 400 here
// and a check constraint in the DB (D-059). Returns the AssetView (signed urls).

import { NextResponse, type NextRequest } from 'next/server'
import {
  badRequest, fromDbError, isFiniteNumber, isString, isUuid, notFound, readJson, signAssets, withAuth,
} from '@/lib/studio/db'
import type { Asset } from '@/lib/studio/types'

const ENVELOPE_BARS = 24
const MAX_TRANSCRIPT = 20000

export async function POST(req: NextRequest) {
  return withAuth(async (auth) => {
    const body = await readJson<Record<string, unknown>>(req)
    const asset_id = body.asset_id
    if (!isUuid(asset_id)) throw badRequest('asset_id must be a uuid')

    const { data: existing, error: readErr } = await auth.supabase
      .from('studio_assets')
      .select('*')
      .eq('id', asset_id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (readErr) throw fromDbError(readErr)
    if (!existing) throw notFound()
    const current = existing as Asset

    const patch: Record<string, unknown> = {}

    if (body.width !== undefined) {
      if (!isFiniteNumber(body.width) || body.width <= 0) throw badRequest('width must be a positive number')
      patch.width = Math.round(body.width)
    }
    if (body.height !== undefined) {
      if (!isFiniteNumber(body.height) || body.height <= 0) throw badRequest('height must be a positive number')
      patch.height = Math.round(body.height)
    }
    if (body.duration_s !== undefined) {
      if (!isFiniteNumber(body.duration_s) || body.duration_s < 0) throw badRequest('duration_s must be a number')
      patch.duration_s = Math.round(body.duration_s * 100) / 100
    }
    if (body.envelope !== undefined) {
      const env = body.envelope
      if (!Array.isArray(env) || env.length !== ENVELOPE_BARS || !env.every((n) => isFiniteNumber(n))) {
        throw badRequest(`envelope must be ${ENVELOPE_BARS} numbers`)
      }
      patch.envelope = (env as number[]).map((n) => Math.min(1, Math.max(0, Math.round(n * 1000) / 1000)))
    }

    const own_voice = body.own_voice === undefined ? current.own_voice : body.own_voice
    if (typeof own_voice !== 'boolean') throw badRequest('own_voice must be a boolean')
    if (body.own_voice !== undefined) patch.own_voice = own_voice

    if (body.transcript !== undefined) {
      if (body.transcript !== null && !isString(body.transcript)) throw badRequest('transcript must be text or null')
      const transcript = body.transcript === null ? null : body.transcript.trim().slice(0, MAX_TRANSCRIPT) || null
      if (transcript && !own_voice) throw badRequest('a transcript needs own_voice')
      patch.transcript = transcript
    }
    if (!own_voice) patch.transcript = null

    let row: Asset = current
    if (Object.keys(patch).length > 0) {
      const { data, error } = await auth.supabase
        .from('studio_assets')
        .update(patch)
        .eq('id', asset_id)
        .eq('user_id', auth.user.id)
        .select('*')
        .maybeSingle()
      if (error) throw fromDbError(error)
      if (!data) throw notFound()
      row = data as Asset
    }

    const [asset] = await signAssets(auth, [row])
    return NextResponse.json({ asset })
  })
}
