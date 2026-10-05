'use client'

// The images, recordings and task lists on one project's canvas, and every
// way of changing them. Loaded beside the tree, not inside it, so a canvas
// whose database has not had migration 028 yet simply offers threads alone.
// Edits land on screen first; a refused write reads the canvas again.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  BoardItem, BoardItemContent, CreateItemRequest, ItemsPayload, PatchItemRequest, ProjectTask,
} from '@/lib/studio/board-items'
import type { AssetView, SignUploadResponse } from '@/lib/studio/types'

const MEDIA_BUCKET = 'studio-media'
/** The bucket's own ceiling (migration 030). */
const MAX_BYTES = 52428800
const ENVELOPE_BARS = 24

const AUDIO_EXT: Record<string, string> = {
  'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/ogg': 'ogg', 'audio/aac': 'aac', 'audio/flac': 'flac',
}

/** What went wrong, in words fit to show. */
export class ItemError extends Error {}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/studio${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  if (!res.ok) {
    const parsed = await res.json().catch(() => ({}))
    // A refusal the server put into words (a plan limit, a wrong file type) is shown as it is.
    throw new ItemError(res.status < 500 && typeof parsed?.error === 'string' ? parsed.error : 'That did not save. Try again.')
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

const mimeOf = (file: Blob) => file.type.toLowerCase().split(';')[0].trim()

function imageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

/** How long it runs, and its loudness in 24 slices for the little waveform. Drawn from the file itself; nothing is listened to. */
async function audioShape(file: Blob): Promise<{ duration_s: number; envelope: number[] } | null> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return null
    const ctx = new Ctx()
    try {
      const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
      const data = buffer.getChannelData(0)
      const slice = Math.max(1, Math.floor(data.length / ENVELOPE_BARS))
      const peaks = Array.from({ length: ENVELOPE_BARS }, (_, i) => {
        let peak = 0
        // A sample every so often is plenty for a 24-bar sketch.
        const step = Math.max(1, Math.floor(slice / 400))
        for (let j = i * slice; j < Math.min(data.length, (i + 1) * slice); j += step) peak = Math.max(peak, Math.abs(data[j]))
        return peak
      })
      const top = Math.max(...peaks, 0.0001)
      return { duration_s: buffer.duration, envelope: peaks.map((p) => Math.round((p / top) * 1000) / 1000) }
    } finally {
      void ctx.close()
    }
  } catch {
    return null
  }
}

export function useBoardItems(projectId: string, enabled: boolean) {
  const [ready, setReady] = useState(false)
  const [items, setItems] = useState<BoardItem[]>([])
  const [assets, setAssets] = useState<Record<string, AssetView>>({})
  const [tasks, setTasks] = useState<ProjectTask[]>([])
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await call<ItemsPayload>('GET', `/projects/${projectId}/items`)
      if (!alive.current) return
      setReady(res.ready)
      setItems(res.items)
      setAssets(Object.fromEntries(res.assets.map((a) => [a.id, a])))
      setTasks(res.tasks)
    } catch {
      // The canvas stands without them.
    }
  }, [projectId])

  useEffect(() => { if (enabled) void load() }, [enabled, load])

  /**
   * Sign, send, measure, record what was measured. The file never passes
   * through our own server.
   *
   * A photograph is prepared first (image-intake.ts): whatever the camera
   * produced — RAW, TIFF, HEIC, a 60 MB JPEG — is decoded and written out
   * web-sized. So what is signed for and stored is always something a browser
   * can show, and the size is settled on the way in rather than refused.
   */
  const upload = useCallback(async (kind: 'image' | 'audio', file: Blob, ownVoice: boolean, knownSeconds?: number): Promise<AssetView> => {
    let body = file
    let mime = mimeOf(file)
    let ext: string | undefined
    let prepared: { width: number; height: number } | null = null

    if (kind === 'image') {
      const { intakeImage, ImageIntakeError } = await import('@/lib/studio/image-intake')
      try {
        const made = await intakeImage(file)
        body = made.file
        mime = made.mime
        ext = made.ext
        prepared = made.width && made.height ? { width: made.width, height: made.height } : null
      } catch (e) {
        throw e instanceof ImageIntakeError ? new ItemError(e.message) : e
      }
    } else {
      ext = AUDIO_EXT[mime]
      if (!ext) throw new ItemError('That is not a sound file this can play. Try an MP3, M4A, WAV, OGG, FLAC or WebM.')
    }

    if (!ext) throw new ItemError('That file could not be prepared. Try again.')
    if (body.size <= 0) throw new ItemError('That file is empty.')
    if (body.size > MAX_BYTES) {
      throw new ItemError(kind === 'audio'
        ? 'That recording is over 50 MB. A shorter one, or an MP3 of it, will go in.'
        : 'That photograph is too large to store, even reduced.')
    }
    const signed = await call<SignUploadResponse>('POST', '/assets/sign', { project_id: projectId, kind, mime, bytes: body.size, ext })
    // Fetched only when a file is actually being added: the storage client is
    // too heavy to ship with every canvas for something most visits never do.
    const { createClient } = await import('@/lib/supabase/client')
    const sent = await createClient().storage.from(MEDIA_BUCKET).uploadToSignedUrl(signed.path, signed.token, body, { contentType: mime })
    if (sent.error) throw new ItemError('The file did not upload. Try again.')
    const measured = kind === 'image'
      ? prepared ?? await imageSize(body)
      : (await audioShape(body)) ?? (knownSeconds ? { duration_s: knownSeconds } : null)
    const res = await call<{ asset: AssetView }>('POST', '/assets/commit', { asset_id: signed.asset_id, own_voice: ownVoice, ...(measured ?? {}) })
    return res.asset
  }, [projectId])

  const create = useCallback(async (req: CreateItemRequest, asset?: AssetView): Promise<BoardItem> => {
    const res = await call<{ item: BoardItem }>('POST', `/projects/${projectId}/items`, req)
    if (alive.current) {
      if (asset) setAssets((prev) => ({ ...prev, [asset.id]: asset }))
      setItems((prev) => [...prev, res.item])
    }
    return res.item
  }, [projectId])

  const patch = useCallback(async (id: string, change: PatchItemRequest) => {
    setItems((prev) => prev.map((it) => (it.id === id
      ? { ...it, ...change, content: change.content ? { ...it.content, ...change.content } : it.content }
      : it)))
    try {
      await call<{ item: BoardItem }>('PATCH', `/items/${id}`, change)
    } catch {
      await load()
    }
  }, [load])

  const api = useMemo(() => ({
    reload: load,

    addTasks: (nodeId: string | null) => create({ kind: 'tasks', node_id: nodeId }),

    addPalette: (nodeId: string | null) => create({ kind: 'palette', node_id: nodeId }),

    addImage: async (nodeId: string | null, file: Blob) => {
      const asset = await upload('image', file, false)
      return create({ kind: 'image', node_id: nodeId, asset_id: asset.id }, asset)
    },

    /** `ownVoice` is true only for something recorded here, by the person, just now. */
    addRecording: async (nodeId: string | null, file: Blob, opts: { ownVoice: boolean; seconds?: number; title?: string }) => {
      const asset = await upload('audio', file, opts.ownVoice, opts.seconds)
      return create({ kind: 'recording', node_id: nodeId, asset_id: asset.id, content: { title: opts.title ?? '' } }, asset)
    },

    patch,

    editContent: (id: string, content: BoardItemContent) => patch(id, { content }),

    remove: async (id: string) => {
      setItems((prev) => prev.filter((it) => it.id !== id))
      try {
        await call<void>('DELETE', `/items/${id}`)
      } catch {
        await load()
      }
    },

    /** One of a piece's own tasks, ticked from the canvas. */
    toggleTask: async (task: ProjectTask) => {
      const status = task.status === 'complete' ? 'pending' : 'complete'
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)))
      try {
        await call<{ success: boolean }>('PATCH', `/projects/${projectId}/tasks`, { task_id: task.id, status })
      } catch {
        await load()
      }
    },

    /** A run of tasks put in a new order, as dragged in the larger list. */
    reorderTasks: async (ids: string[]) => {
      const place = new Map(ids.map((id, at) => [id, at]))
      setTasks((prev) => {
        const touched = prev.filter((t) => place.has(t.id)).sort((a, b) => place.get(a.id)! - place.get(b.id)!)
        let next = 0
        return prev.map((t) => (place.has(t.id) ? touched[next++] : t))
      })
      try {
        await call<{ success: boolean }>('PATCH', `/projects/${projectId}/tasks`, { order: ids })
      } catch {
        await load()
      }
    },

    /** A new task on one piece, under the category it was typed into. */
    addTask: async (nodeId: string, title: string, category: string) => {
      try {
        const res = await call<{ task?: ProjectTask }>('POST', `/nodes/${nodeId}/tasks`, { title, type: 'creation', category })
        if (res.task && alive.current) setTasks((prev) => [...prev, { ...res.task!, node_id: nodeId }])
      } catch {
        await load()
      }
    },

    removeTask: async (task: ProjectTask) => {
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
      try {
        await call<{ success: boolean }>('DELETE', `/nodes/${task.node_id}/tasks`, { task_id: task.id })
      } catch {
        await load()
      }
    },

    /** Signed addresses last an hour; this fetches fresh ones when a picture or sound stops loading. */
    refreshAsset: async (assetId: string) => {
      try {
        const res = await call<{ url: string; thumb_url: string | null }>('GET', `/assets/${assetId}/url`)
        if (alive.current) setAssets((prev) => (prev[assetId] ? { ...prev, [assetId]: { ...prev[assetId], ...res } } : prev))
      } catch {
        // it stays as it was
      }
    },
  }), [create, load, patch, projectId, upload])

  return { ready, items, assets, tasks, api }
}

export type BoardItemsApi = ReturnType<typeof useBoardItems>['api']
