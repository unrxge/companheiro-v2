// studio/src/lib/studio/engine/autosave.ts — the local store is the truth and
// this is the only thing that tells the server (5.10, D-030, D-031).
//
// Three behaviours matter more than the plumbing:
//  • a flush that fails re-merges UNDER any newer edit, so a retry never undoes
//    something the person did while it was in flight;
//  • hiding the tab flushes with keepalive, so closing a laptop lid saves;
//  • a second tab is reconciled by canvas_version, and rows in the current move
//    set are never overwritten by a refetch.

import { api, ApiError } from '@/lib/studio/api-client'
import { createEmptyPatch, mergePatchInto, patchIsEmpty } from '@/lib/studio/store'
import type { CanvasStore, SaveState } from '@/lib/studio/store'
import type { AnyBlock, DirtyPatch } from '@/lib/studio/types'

export const DEBOUNCE_MS = 600
export const MAX_WAIT_MS = 3000
export const CHUNK = 40
export const POLL_MS = 60_000
/** D-032: the since window rotates only after this long away. */
export const OPEN_AFTER_MS = 30 * 60_000
const RETRY_LADDER = [1000, 3000, 9000]
const RETRY_TAIL = 30_000

export type FlushReason = 'debounce' | 'maxwait' | 'hidden' | 'manual'

export interface Autosave {
  schedule(): void
  flush(reason?: FlushReason): Promise<void>
  /** Rows the machine is dragging right now: a refetch must not touch them. */
  setBusy(ids: Set<string>): void
  dispose(): void
}

/** `updated_at` is the server's to stamp, so it never travels up (D-031). */
const stripStamp = (row: AnyBlock): AnyBlock => {
  const { updated_at: _u, ...rest } = row
  return rest as AnyBlock
}

export function createAutosave(opts: {
  store: CanvasStore
  projectId: string
  fetchImpl?: typeof fetch
  /** Told on every state change so the chrome can show the word. */
  onState?: (s: SaveState) => void
}): Autosave {
  const { store, projectId } = opts
  const fetchImpl = opts.fetchImpl

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let retryStep = 0
  let inFlight: Promise<void> | null = null
  let busy = new Set<string>()
  let disposed = false

  const setState = (s: SaveState) => {
    if (store.get().saveState === s) return
    store.set((st) => { st.saveState = s })
    opts.onState?.(s)
  }

  const clearTimers = () => {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null }
    if (maxWaitTimer) { clearTimeout(maxWaitTimer); maxWaitTimer = null }
  }

  const schedule = () => {
    if (disposed) return
    if (store.dirtyIsEmpty()) return
    setState('unsaved')
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void flush('debounce'), DEBOUNCE_MS)
    if (!maxWaitTimer) maxWaitTimer = setTimeout(() => void flush('maxwait'), MAX_WAIT_MS)
  }

  /** Split one snapshot into requests small enough for a keepalive body. */
  const sendPatch = async (snap: DirtyPatch, keepalive: boolean): Promise<number | null> => {
    const upserts = [...snap.upserts.values()].map(stripStamp)
    const deletes = [...snap.deletes]
    const restores = [...snap.restores]
    let version: number | null = null

    const chunks: AnyBlock[][] = []
    for (let i = 0; i < upserts.length; i += CHUNK) chunks.push(upserts.slice(i, i + CHUNK))
    if (chunks.length === 0 && (deletes.length || restores.length)) chunks.push([])

    for (let i = 0; i < chunks.length; i++) {
      const res = await api.blocks.batch(
        projectId,
        {
          upserts: chunks[i],
          // the deletes ride with the first request so one failure cannot
          // leave a delete applied locally and not on the server
          deletes: i === 0 ? deletes : [],
          restores: i === 0 ? restores : [],
        },
        { keepalive, fetchImpl },
      )
      version = res.canvas_version
    }

    for (const link of snap.links_add.values()) {
      await api.links.create(projectId, {
        id: link.id,
        from_block_id: link.from_block_id,
        to_block_id: link.to_block_id,
        word: link.word,
      })
    }
    for (const id of snap.links_delete) {
      await api.links.delete(projectId, id)
    }
    if (Object.keys(snap.project).length > 0) {
      await api.projects.patch(projectId, snap.project, { keepalive, fetchImpl })
    }
    return version
  }

  const flush = async (reason: FlushReason = 'manual'): Promise<void> => {
    if (disposed) return
    clearTimers()
    if (inFlight) {
      // one request at a time; whatever is dirty now goes in the next one
      await inFlight
      if (store.dirtyIsEmpty()) return
    }
    if (store.dirtyIsEmpty()) {
      setState('saved')
      return
    }

    const snap = store.takeDirty()
    setState('saving')
    const keepalive = reason === 'hidden'

    const run = async () => {
      try {
        const version = await sendPatch(snap, keepalive)
        if (version !== null) {
          store.set((s) => { s.project = { ...s.project, canvas_version: version } })
        }
        retryStep = 0
        setState(store.dirtyIsEmpty() ? 'saved' : 'unsaved')
        if (!store.dirtyIsEmpty()) schedule()
      } catch (e) {
        // the snapshot goes back under anything newer: a row edited since the
        // flush started keeps the newer value (D-030)
        mergePatchInto(store.dirty, snap, false)
        if (e instanceof ApiError && e.status === 401) {
          setState('signin')
          return
        }
        setState('unsaved')
        const wait = RETRY_LADDER[retryStep] ?? RETRY_TAIL
        retryStep = Math.min(retryStep + 1, RETRY_LADDER.length)
        if (retryTimer) clearTimeout(retryTimer)
        retryTimer = setTimeout(() => void flush('manual'), wait)
      }
    }

    inFlight = run().finally(() => { inFlight = null })
    return inFlight
  }

  // ── the other tab (D-031) ────────────────────────────────────────────────

  const merge = async () => {
    if (disposed) return
    try {
      const { bundle } = await api.projects.get(projectId)
      const patch = createEmptyPatch()
      for (const row of bundle.blocks) {
        if (busy.has(row.id)) continue
        const local = store.get().blocks.get(row.id)
        if (!local || row.updated_at > local.updated_at) patch.upserts.set(row.id, row)
      }
      if (!patchIsEmpty(patch)) {
        // applyPatch would mark these dirty and send them straight back
        store.set((s) => {
          for (const [id, row] of patch.upserts) s.blocks.set(id, row)
          s.links = new Map(bundle.links.map((l) => [l.id, l]))
          s.compass = bundle.compass
          s.catches = bundle.catches
          s.drafts = bundle.drafts
          s.project = { ...s.project, canvas_version: bundle.project.canvas_version }
        }, [...patch.upserts.keys()])
      } else {
        store.set((s) => { s.project = { ...s.project, canvas_version: bundle.project.canvas_version } })
      }
    } catch {
      // a failed poll is not worth telling the person about
    }
  }

  const poll = async () => {
    if (disposed || typeof document === 'undefined' || document.visibilityState !== 'visible') return
    try {
      if (!store.dirtyIsEmpty()) {
        await flush('manual')
        return
      }
      const { since } = await api.projects.since(projectId)
      store.set((s) => { s.since = since })
      if (since.canvas_version !== store.get().project.canvas_version) await merge()
    } catch {
      // same
    }
  }

  const onVisible = () => {
    if (typeof document === 'undefined') return
    if (document.visibilityState === 'hidden') {
      void flush('hidden')
      return
    }
    const last = store.get().project.last_opened_at
    const away = last ? Date.now() - Date.parse(last) : Infinity
    if (away > OPEN_AFTER_MS) {
      // long enough away that the since window should rotate (D-032)
      void api.projects.open(projectId).then(({ since }) => {
        store.set((s) => { s.since = since })
      }).catch(() => {})
    } else {
      void poll()
    }
  }

  const onHide = () => { void flush('hidden') }

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisible)
    pollTimer = setInterval(() => void poll(), POLL_MS)
  }

  return {
    schedule,
    flush,
    setBusy(ids) { busy = ids },
    dispose() {
      disposed = true
      clearTimers()
      if (retryTimer) clearTimeout(retryTimer)
      if (pollTimer) clearInterval(pollTimer)
      if (typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onHide)
        document.removeEventListener('visibilitychange', onVisible)
      }
    },
  }
}
