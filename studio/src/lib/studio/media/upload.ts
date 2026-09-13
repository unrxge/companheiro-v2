// studio/src/lib/studio/media/upload.ts — sign → PUT → commit (lane E, section 4)
// plus the two store adapters the media renderers share: putting an AssetView
// into `store.assets` and writing a block's content through the dirty pipe.
//
// Privacy is structural here (D-059): nothing in this module knows about models;
// the only things that leave the browser are the bytes (to storage, via a signed
// url) and the measurements (to /assets/commit). Storage paths appear once, as
// the PUT target, and are never kept.

import { api } from '@/lib/studio/api-client'
import { createClient } from '@/lib/supabase/client'
import { createEmptyPatch, type CanvasStore } from '@/lib/studio/store'
import type { AnyBlock, AssetView, BlockContentMap, BlockType, CommitAssetRequest } from '@/lib/studio/types'
import { resizeImage, extForMime } from '@/lib/studio/media/resize'
import { analyseAudio } from '@/lib/studio/media/waveform'
import { audioFileKind } from '@/lib/studio/media/recorder'

export const MEDIA_BUCKET = 'studio-media'

export class UploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadError'
  }
}

async function put(path: string, token: string, blob: Blob, contentType: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.storage.from(MEDIA_BUCKET).uploadToSignedUrl(path, token, blob, { contentType, upsert: false })
  if (error) throw new UploadError(error.message || 'the upload did not go through')
}

// ── store adapters ─────────────────────────────────────────────────────────

/** Replace/insert one asset in `store.assets` (a new Map, per the store's identity rules). */
export function putAsset(store: CanvasStore, asset: AssetView): void {
  store.set((s) => {
    const next = new Map(s.assets)
    next.set(asset.id, asset)
    s.assets = next
  })
}

/** Fresh signed urls for one asset (after a 60-minute expiry); returns the updated view or null. */
export async function refreshAssetUrls(store: CanvasStore, assetId: string): Promise<AssetView | null> {
  const current = store.get().assets.get(assetId)
  if (!current) return null
  try {
    const { url, thumb_url } = await api.assets.url(assetId)
    const next: AssetView = { ...current, url, thumb_url }
    putAsset(store, next)
    return next
  } catch {
    return null
  }
}

const FALLBACK_FLUSH_MS = 1500
const pendingFlush = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * Write a block's content through the dirty pipe (applyPatch marks it dirty and
 * notifies the block's listeners). Autosave (lane B) flushes dirty rows on its
 * own schedule; until it is wired, the interim flusher only wakes on an action,
 * so a guarded fallback sends any media row still sitting in `dirty` after
 * 1.5 s — a no-op once autosave has taken it (full-row upsert, idempotent).
 */
export function commitBlockContent<T extends BlockType>(
  store: CanvasStore,
  block: Extract<AnyBlock, { type: T }>,
  content: BlockContentMap[T],
  extra: Partial<Pick<AnyBlock, 'w' | 'h' | 'placed_by'>> = {}
): void {
  const live = store.get().blocks.get(block.id) ?? block
  const now = new Date().toISOString()
  const row = { ...live, ...extra, content, updated_at: now } as AnyBlock
  store.applyPatch({ ...createEmptyPatch(), upserts: new Map([[row.id, row]]) })

  const projectId = row.project_id
  const key = row.id
  const existing = pendingFlush.get(key)
  if (existing) clearTimeout(existing)
  pendingFlush.set(
    key,
    setTimeout(() => {
      pendingFlush.delete(key)
      const still = store.dirty.upserts.get(key)
      if (!still) return
      store.dirty.upserts.delete(key)
      const { updated_at: _u, ...clientRow } = still
      void api.blocks
        .batch(projectId, { upserts: [clientRow as AnyBlock], deletes: [], restores: [] })
        .catch(() => {
          // put it back for the next flush; the save word is autosave's to set
          if (!store.dirty.upserts.has(key)) store.dirty.upserts.set(key, still)
        })
    }, FALLBACK_FLUSH_MS)
  )
}

// ── uploads ────────────────────────────────────────────────────────────────

export interface UploadedImage {
  asset: AssetView
  aspect: number
}

/** Resize in the browser, sign, PUT main + thumb, commit the dimensions, add to the store. */
export async function uploadImage(store: CanvasStore, projectId: string, file: Blob): Promise<UploadedImage> {
  const resized = await resizeImage(file)
  const signed = await api.assets.sign({
    project_id: projectId,
    kind: 'image',
    mime: resized.mime,
    bytes: resized.blob.size,
    ext: resized.ext,
    thumb: true,
  })
  await put(signed.path, signed.token, resized.blob, resized.mime)
  if (signed.thumb_path && signed.thumb_token) {
    await put(signed.thumb_path, signed.thumb_token, resized.thumb, resized.thumb.type || 'image/webp')
  }
  const { asset } = await api.assets.commit({ asset_id: signed.asset_id, width: resized.width, height: resized.height })
  putAsset(store, asset)
  return { asset, aspect: resized.aspect }
}

export interface AudioUploadInput {
  blob: Blob
  mime: string
  ext: string
  duration_s: number
  envelope: number[]
  own_voice: boolean
  transcript: string | null
}

/** Sign, PUT, commit duration/envelope/own_voice/transcript, add to the store. */
export async function uploadAudio(store: CanvasStore, projectId: string, input: AudioUploadInput): Promise<AssetView> {
  const signed = await api.assets.sign({
    project_id: projectId,
    kind: 'audio',
    mime: input.mime,
    bytes: input.blob.size,
    ext: input.ext,
  })
  await put(signed.path, signed.token, input.blob, input.mime)
  const req: CommitAssetRequest = {
    asset_id: signed.asset_id,
    duration_s: input.duration_s,
    envelope: input.envelope,
    own_voice: input.own_voice,
    transcript: input.own_voice ? input.transcript : null,
  }
  const { asset } = await api.assets.commit(req)
  putAsset(store, asset)
  return asset
}

/** A picked audio file is always a reference: not listened to, no transcript. */
export async function uploadAudioFile(store: CanvasStore, projectId: string, file: Blob): Promise<AssetView> {
  const kind = audioFileKind(file)
  if (!kind) throw new UploadError('that audio format is not accepted')
  const { envelope, duration_s } = await analyseAudio(file)
  return uploadAudio(store, projectId, {
    blob: file,
    mime: kind.mime,
    ext: kind.ext || extForMime(kind.mime),
    duration_s,
    envelope,
    own_voice: false,
    transcript: null,
  })
}

/** Accepted picker filter for images. */
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif'
/** Accepted picker filter for a reference audio file. */
export const AUDIO_ACCEPT = 'audio/webm,audio/mp4,audio/x-m4a,audio/mpeg,audio/wav,audio/ogg'

/** Open a native file picker; resolves with the files (empty when dismissed). */
export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve([])
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.multiple = multiple
    input.style.position = 'fixed'
    input.style.left = '-9999px'
    input.setAttribute('data-no-drag', '')
    let settled = false
    // Older Safari has no `cancel` event: clean up when focus returns without a change.
    const onFocus = () => {
      window.removeEventListener('focus', onFocus)
      setTimeout(() => done([]), 600)
    }
    const done = (files: File[]) => {
      if (settled) return
      settled = true
      window.removeEventListener('focus', onFocus)
      input.remove()
      resolve(files)
    }
    input.onchange = () => done(Array.from(input.files ?? []))
    input.oncancel = () => done([])
    document.body.appendChild(input)
    window.addEventListener('focus', onFocus)
    input.click()
  })
}
