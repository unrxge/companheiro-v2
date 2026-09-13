'use client'

// studio/src/lib/studio/hooks.ts — React reads of the canvas store (5.3).
// useSyncExternalStore throughout; a block subscribes only to its own id.

import { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react'
import type { AnyBlock, Viewport } from '@/lib/studio/types'
import type { CanvasState, CanvasStore } from '@/lib/studio/store'

export const StoreContext = createContext<CanvasStore | null>(null)

export function useStore(): CanvasStore {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore: no StoreContext above this component')
  return store
}

/** Shallow equality for array/object selector results (Object.is per element/key). */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
    return true
  }
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false
  }
  return true
}

/**
 * Select a slice of the canvas state. The selector runs on every store change;
 * the component re-renders only when `eq` (default Object.is) says the result
 * changed. Pass `shallowEqual` for selectors that build arrays or objects.
 */
export function useCanvasStore<T>(selector: (s: CanvasState) => T, eq: (a: T, b: T) => boolean = Object.is): T {
  const store = useStore()
  const selectorRef = useRef(selector)
  const eqRef = useRef(eq)
  selectorRef.current = selector
  eqRef.current = eq
  const cache = useRef<{ has: boolean; value: T }>({ has: false, value: undefined as unknown as T })

  const getSnapshot = useCallback((): T => {
    const next = selectorRef.current(store.get())
    const c = cache.current
    if (c.has && eqRef.current(c.value, next)) return c.value
    cache.current = { has: true, value: next }
    return next
  }, [store])

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot)
}

/** One block's row; subscribes via subscribeBlock only (perf, D-010). */
export function useBlock(id: string): AnyBlock | undefined {
  const store = useStore()
  const subscribe = useCallback((fn: () => void) => store.subscribeBlock(id, fn), [store, id])
  const getSnapshot = useCallback(() => store.get().blocks.get(id), [store, id])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Selection is its own slice: only the two blocks whose membership changed re-render. */
export function useIsSelected(id: string): boolean {
  return useCanvasStore((s) => s.selection.has(id))
}

export function useIsPrimary(id: string): boolean {
  return useCanvasStore((s) => s.primary === id)
}

export function useIsEditing(id: string): boolean {
  return useCanvasStore((s) => s.editing === id)
}

export function useIsHovered(id: string): boolean {
  return useCanvasStore((s) => s.hover === id)
}

export function useViewport(): Viewport {
  return useCanvasStore((s) => s.viewport)
}

export function useMode() {
  return useCanvasStore((s) => s.mode)
}

export function useInteractive(): boolean {
  return useCanvasStore((s) => s.interactive)
}

export function useChip(): boolean {
  return useCanvasStore((s) => s.chip)
}

export function useSaveState() {
  return useCanvasStore((s) => s.saveState)
}

export function useDrawer() {
  return useCanvasStore((s) => s.drawer)
}

export function useDock() {
  return useCanvasStore((s) => s.dock)
}

export function useProject() {
  return useCanvasStore((s) => s.project)
}

export function useConcept() {
  return useCanvasStore((s) => s.concept)
}

export function useSince() {
  return useCanvasStore((s) => s.since)
}

export function useCompass() {
  return useCanvasStore((s) => s.compass)
}

export function useCatches() {
  return useCanvasStore((s) => s.catches)
}

export function useDrafts() {
  return useCanvasStore((s) => s.drafts)
}

export function useDraftSummary(draftId: string) {
  return useCanvasStore((s) => s.drafts.find((d) => d.id === draftId))
}

export function useAsset(assetId: string | null | undefined) {
  return useCanvasStore((s) => (assetId ? s.assets.get(assetId) : undefined))
}

export function useLinks() {
  return useCanvasStore((s) => s.links)
}

/** Live rows stacked into a timeline block (newest first). Re-evaluates on every store change. */
export function useChildrenStacked(timelineId: string): AnyBlock[] {
  const store = useStore()
  return useCanvasStore(() => store.childrenStacked(timelineId), shallowEqual)
}

/** Ids in render order (depth, z); re-renders the caller only when the order changes. */
export function useRenderOrderIds(): string[] {
  const store = useStore()
  return useCanvasStore(() => store.renderOrder().map((b) => b.id), shallowEqual)
}

export function useUnplacedIds(): string[] {
  const store = useStore()
  return useCanvasStore(() => store.unplaced().map((b) => b.id), shallowEqual)
}
