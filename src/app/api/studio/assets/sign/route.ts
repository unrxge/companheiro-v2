// POST /api/studio/assets/sign — a signed upload url for one media file (lane E, section 4).
// Creates the storage path '<user>/<project>/<asset>.<ext>' (+ '<asset>_t.webp' for an
// image thumb), signs both, and inserts the studio_assets row with the client-truthful
// byte count (the bucket's 25 MB limit is the real cap). Storage paths are returned
// here ONLY so the client can PUT to them; they never come back in an AssetView (D-059).

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, fromDbError, isFiniteNumber, isString, isUuid, MEDIA_BUCKET, readJson,
  requireProject, withAuth,
} from '@/lib/studio/db'
import type { SignUploadResponse } from '@/lib/studio/types'

/** Mirrors the bucket's allowed_mime_types (migration 001). */
const IMAGE_MIMES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
const AUDIO_MIMES: ReadonlySet<string> = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'])
const MAX_BYTES = 26214400
const EXT_RE = /^[a-z0-9]{1,8}$/

export async function POST(req: NextRequest) {
  return withAuth(async (auth) => {
    const body = await readJson<Record<string, unknown>>(req)

    const project_id = body.project_id
    if (!isUuid(project_id)) throw badRequest('project_id must be a uuid')
    const kind = body.kind
    if (kind !== 'image' && kind !== 'audio') throw badRequest('kind must be image or audio')
    const mime = isString(body.mime) ? body.mime.toLowerCase().split(';')[0].trim() : ''
    if (!(kind === 'image' ? IMAGE_MIMES : AUDIO_MIMES).has(mime)) throw badRequest('that file type is not accepted')
    const bytes = body.bytes
    if (!isFiniteNumber(bytes) || bytes <= 0 || bytes > MAX_BYTES) throw badRequest('the file must be between 1 byte and 25 mb')
    const ext = isString(body.ext) ? body.ext.toLowerCase() : ''
    if (!EXT_RE.test(ext)) throw badRequest('ext must be a short alphanumeric extension')
    const wantThumb = body.thumb === true && kind === 'image'

    const project = await requireProject(auth, project_id)
    assertProjectWritable(project)

    const asset_id = crypto.randomUUID()
    const folder = `${auth.user.id}/${project.id}`
    const path = `${folder}/${asset_id}.${ext}`
    const thumb_path = wantThumb ? `${folder}/${asset_id}_t.webp` : null

    const storage = auth.supabase.storage.from(MEDIA_BUCKET)
    const signed = await storage.createSignedUploadUrl(path)
    if (signed.error || !signed.data) {
      console.error('[studio] sign upload:', signed.error)
      throw new Error('could not sign the upload')
    }
    let thumb_token: string | null = null
    if (thumb_path) {
      const t = await storage.createSignedUploadUrl(thumb_path)
      if (t.error || !t.data) {
        console.error('[studio] sign thumb upload:', t.error)
        throw new Error('could not sign the thumb upload')
      }
      thumb_token = t.data.token
    }

    const { error } = await auth.supabase.from('studio_assets').insert({
      id: asset_id,
      user_id: auth.user.id,
      project_id: project.id,
      kind,
      storage_path: path,
      thumb_path,
      mime,
      bytes: Math.round(bytes),
    })
    if (error) throw fromDbError(error)

    const out: SignUploadResponse = { asset_id, path, token: signed.data.token, thumb_path, thumb_token }
    return NextResponse.json(out, { status: 201 })
  })
}
