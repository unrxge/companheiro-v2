'use client'

// studio/src/lib/studio/drafts.ts — the draft studio's data (9.3, D-063; lane D).
// `useDraft(draftId)` loads GET /drafts/:id, keeps the sections locally, flushes
// section edits with an 800 ms debounce as one ordered PUT (full list), sends
// title / kind / posture through PATCH at once, and after every save refreshes
// the store's `drafts[]` summary so the card re-renders without a mirror in the
// block's content. Works outside a CanvasProvider too (the summary refresh is
// skipped when there is no store).

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError } from '@/lib/studio/api-client'
import { StoreContext } from '@/lib/studio/hooks'
import type { CanvasStore } from '@/lib/studio/store'
import type { Draft, DraftKind, DraftSection, DraftSummary, Posture } from '@/lib/studio/types'
import { ensureSectionsHtml } from '@/lib/rich-text'

export const SECTION_SAVE_DEBOUNCE_MS = 800

export type SectionInput = Pick<DraftSection, 'id' | 'position' | 'label' | 'content' | 'is_locked'>

export type DraftLoad =
  | { status: 'loading' }
  | { status: 'error'; message: string; code: number }
  | { status: 'ready' }

export type DraftSaveState = 'saved' | 'saving' | 'unsaved' | 'locked' | 'signin'

/** Client copy of the server's `htmlHasText` (db.ts imports next/server, so it cannot be shared). */
export function htmlHasText(html: string | null | undefined): boolean {
  if (!html) return false
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .trim()
  return text.length > 0
}

/** The card's summary from the studio's live rows (what the bundle would compute). */
export function summaryOf(draft: Draft, sections: SectionInput[], updatedAt?: string): DraftSummary {
  return {
    id: draft.id,
    title: draft.title,
    kind: draft.kind,
    posture: draft.posture,
    sections: [...sections]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, label: s.label, is_locked: s.is_locked, has_text: htmlHasText(s.content) })),
    updated_at: updatedAt ?? draft.updated_at,
  }
}

/** Replace (or add) one draft summary in the store, if there is a store. */
export function refreshDraftSummary(store: CanvasStore | null, summary: DraftSummary): void {
  if (!store) return
  store.set((s) => {
    const idx = s.drafts.findIndex((d) => d.id === summary.id)
    const next = [...s.drafts]
    if (idx === -1) next.push(summary)
    else next[idx] = summary
    s.drafts = next
  })
}

export function newSection(position: number): DraftSection {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    draft_id: '',
    position,
    label: null,
    content: '',
    is_locked: false,
    created_at: now,
    updated_at: now,
  }
}

const toInput = (s: DraftSection, i: number): SectionInput => ({
  id: s.id,
  position: i,
  label: s.label,
  content: s.content,
  is_locked: s.is_locked,
})

export interface UseDraftResult {
  load: DraftLoad
  draft: Draft | null
  sections: DraftSection[]
  /** The project's live, unstruck anchor lines as the server saw them at load (the rail prefers the store). */
  anchors: string[]
  save: DraftSaveState
  /** Replace the section list (ordered); debounced PUT follows. */
  setSections(next: DraftSection[] | ((prev: DraftSection[]) => DraftSection[])): void
  /** Update one section's fields; debounced PUT follows. */
  updateSection(id: string, patch: Partial<Pick<DraftSection, 'label' | 'content' | 'is_locked'>>): void
  /** Title / kind / posture → PATCH at once (optimistic). */
  patchDraft(req: { title?: string; kind?: DraftKind; posture?: Posture }): Promise<void>
  /** Push pending section edits now (drawer close, page hide). */
  flush(): Promise<void>
  reload(): Promise<void>
}

export function useDraft(draftId: string): UseDraftResult {
  const store = useContext(StoreContext)
  const [load, setLoad] = useState<DraftLoad>({ status: 'loading' })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [sections, setSectionsState] = useState<DraftSection[]>([])
  const [anchors, setAnchors] = useState<string[]>([])
  const [save, setSave] = useState<DraftSaveState>('saved')

  const sectionsRef = useRef<DraftSection[]>([])
  const draftRef = useRef<Draft | null>(null)
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const reload = useCallback(async () => {
    setLoad({ status: 'loading' })
    try {
      const res = await api.drafts.get(draftId)
      if (!mountedRef.current) return
      const rows = ensureSectionsHtml([...res.sections].sort((a, b) => a.position - b.position))
      draftRef.current = res.draft
      sectionsRef.current = rows
      setDraft(res.draft)
      setSectionsState(rows)
      setAnchors(res.anchors)
      setSave('saved')
      setLoad({ status: 'ready' })
    } catch (e) {
      if (!mountedRef.current) return
      const code = e instanceof ApiError ? e.status : 0
      const message =
        code === 401 ? 'sign in again to open this draft'
        : code === 404 ? 'nothing here — the draft may have been deleted'
        : e instanceof Error && e.message ? e.message : 'the draft did not open'
      setLoad({ status: 'error', message, code })
    }
  }, [draftId])

  useEffect(() => {
    void reload()
  }, [reload])

  const flush = useCallback(async (): Promise<void> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!dirtyRef.current) return
    if (inFlightRef.current) {
      await inFlightRef.current
      if (!dirtyRef.current) return
    }
    const current = draftRef.current
    if (!current) return
    dirtyRef.current = false
    const payload = sectionsRef.current.map(toInput)
    setSave('saving')
    const run = (async () => {
      try {
        const { sections: saved } = await api.drafts.putSections(current.id, payload)
        if (!mountedRef.current) return
        // keep the person's newer keystrokes; take server timestamps for the rest
        if (!dirtyRef.current) {
          const byId = new Map(saved.map((s) => [s.id, s]))
          const merged = sectionsRef.current.map((s) => {
            const srv = byId.get(s.id)
            return srv ? { ...srv, content: s.content, label: s.label, is_locked: s.is_locked } : s
          })
          sectionsRef.current = merged
          setSectionsState(merged)
          setSave('saved')
        }
        const at = new Date().toISOString()
        draftRef.current = { ...current, updated_at: at }
        setDraft(draftRef.current)
        refreshDraftSummary(store, summaryOf(draftRef.current, sectionsRef.current.map(toInput), at))
      } catch (e) {
        if (!mountedRef.current) return
        dirtyRef.current = true
        if (e instanceof ApiError && e.status === 401) setSave('signin')
        else if (e instanceof ApiError && e.status === 409) {
          // a locked section changed under us, or the project is no longer writable: reload the truth
          setSave('locked')
          dirtyRef.current = false
          await reload()
        } else setSave('unsaved')
      }
    })()
    inFlightRef.current = run
    await run
    inFlightRef.current = null
  }, [reload, store])

  const schedule = useCallback(() => {
    dirtyRef.current = true
    setSave('unsaved')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void flush()
    }, SECTION_SAVE_DEBOUNCE_MS)
  }, [flush])

  const setSections = useCallback(
    (next: DraftSection[] | ((prev: DraftSection[]) => DraftSection[])) => {
      const rows = typeof next === 'function' ? next(sectionsRef.current) : next
      const renumbered = rows.map((s, i) => (s.position === i ? s : { ...s, position: i }))
      sectionsRef.current = renumbered
      setSectionsState(renumbered)
      schedule()
    },
    [schedule]
  )

  const updateSection = useCallback(
    (id: string, patch: Partial<Pick<DraftSection, 'label' | 'content' | 'is_locked'>>) => {
      const prev = sectionsRef.current
      const idx = prev.findIndex((s) => s.id === id)
      if (idx === -1) return
      const cur = prev[idx]
      const changed =
        (patch.label !== undefined && patch.label !== cur.label) ||
        (patch.content !== undefined && patch.content !== cur.content) ||
        (patch.is_locked !== undefined && patch.is_locked !== cur.is_locked)
      if (!changed) return
      const rows = [...prev]
      rows[idx] = { ...cur, ...patch }
      sectionsRef.current = rows
      setSectionsState(rows)
      schedule()
    },
    [schedule]
  )

  const patchDraft = useCallback(
    async (req: { title?: string; kind?: DraftKind; posture?: Posture }) => {
      const current = draftRef.current
      if (!current) return
      const optimistic: Draft = { ...current, ...req }
      draftRef.current = optimistic
      setDraft(optimistic)
      refreshDraftSummary(store, summaryOf(optimistic, sectionsRef.current.map(toInput)))
      try {
        const { draft: saved } = await api.drafts.patch(current.id, req)
        if (!mountedRef.current) return
        draftRef.current = { ...draftRef.current!, ...saved }
        setDraft(draftRef.current)
        refreshDraftSummary(store, summaryOf(draftRef.current, sectionsRef.current.map(toInput)))
      } catch (e) {
        if (!mountedRef.current) return
        draftRef.current = current
        setDraft(current)
        refreshDraftSummary(store, summaryOf(current, sectionsRef.current.map(toInput)))
        if (e instanceof ApiError && e.status === 401) setSave('signin')
        throw e
      }
    },
    [store]
  )

  // flush on unmount and when the page hides (the debounce would otherwise lose the last edit)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
      if (timerRef.current) clearTimeout(timerRef.current)
      if (dirtyRef.current) void flush()
    }
  }, [flush])

  return useMemo(
    () => ({ load, draft, sections, anchors, save, setSections, updateSection, patchDraft, flush, reload }),
    [load, draft, sections, anchors, save, setSections, updateSection, patchDraft, flush, reload]
  )
}
