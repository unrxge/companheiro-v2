'use client'

// studio/src/components/canvas/engine-context.tsx — the engine's lifetime.
//
// One engine per open project. It owns the pointer machine, the command stack,
// autosave, the height measurer and the keyboard, and it hands the chrome a
// CanvasActions object of exactly the shape lane A's chrome already calls. The
// Stage hands it the DOM when it mounts (`attach`), because the machine binds
// its own listeners rather than going through React props.

import { createContext, useContext } from 'react'
import type { CanvasActions } from '@/components/canvas/actions'
import type { CanvasStore } from '@/lib/studio/store'
import { CommandStack } from '@/lib/studio/engine/commands'
import { createAutosave, type Autosave } from '@/lib/studio/engine/autosave'
import { createMeasurer, type Measurer } from '@/lib/studio/engine/measure'
import {
  createPointerMachine, type LinksApiLike, type OverlayApi, type PointerMachine,
} from '@/lib/studio/engine/pointer'
import { installKeyboard } from '@/lib/studio/engine/keyboard'
import { crossedChip, isChip } from '@/lib/studio/engine/culling'
import { pinSince } from '@/lib/studio/engine/pin'
import { createEngineActions, type EngineActionsHost } from '@/components/canvas/engine-actions'
import type { Viewport } from '@/lib/studio/types'

export interface StageDom {
  stageEl: HTMLElement | null
  worldEl: HTMLElement | null
  links: LinksApiLike | null
  size: () => { w: number; h: number }
}

export interface CanvasEngine {
  machine: PointerMachine
  stack: CommandStack
  autosave: Autosave
  measurer: Measurer
  actions: CanvasActions
  refs: Map<string, HTMLElement>
  attach(dom: StageDom): void
  detach(): void
  setOverlay(api: OverlayApi | null): void
  dispose(): void
}

/** Overlay and links arrive after the first render, so calls are forwarded. */
function forwarder<T extends object>(get: () => T | null, keys: Array<keyof T>): T {
  const out = {} as T
  for (const k of keys) {
    out[k] = ((...args: unknown[]) => {
      const target = get()
      if (!target) return undefined
      return (target[k] as unknown as (...a: unknown[]) => unknown)(...args)
    }) as T[keyof T]
  }
  return out
}

export function createCanvasEngine(opts: {
  store: CanvasStore
  projectId: string
  /** Surfaces the keys reach that live outside the canvas. */
  openTalk: () => void
  openLibrary: (search: boolean) => void
  toggleKeyMap: () => void
}): CanvasEngine {
  const { store, projectId } = opts
  const refs = new Map<string, HTMLElement>()
  const stack = new CommandStack()

  let dom: StageDom | null = null
  let overlay: OverlayApi | null = null
  let uninstallKeys: (() => void) | null = null
  let detachDom: (() => void) | null = null
  let viewportSaveTimer: ReturnType<typeof setTimeout> | null = null

  const overlayProxy = forwarder<OverlayApi>(() => overlay, [
    'guides', 'clearGuides', 'marquee', 'dropFrame', 'rubber', 'ghost', 'sync',
  ])
  const linksProxy = forwarder<LinksApiLike>(() => dom?.links ?? null, ['updateFor', 'redraw'])

  const autosave = createAutosave({ store, projectId })
  const measurer = createMeasurer({
    store,
    onHeights: () => {
      // a taller concept pushes its since row down with it (D-026)
      pinSince(store)
      autosave.schedule()
      overlayProxy.sync()
      linksProxy.redraw()
    },
  })

  const machine = createPointerMachine({
    store,
    refs,
    overlay: overlayProxy,
    links: linksProxy,
    stack,
    stageEl: () => dom?.stageEl ?? null,
    worldEl: () => dom?.worldEl ?? null,
    vw: () => dom?.size().w ?? 0,
    vh: () => dom?.size().h ?? 0,
    onCommit: () => {
      pinSince(store)
      autosave.schedule()
    },
    onViewport: (v) => commitViewport(v),
    onEdit: (id) => machine.enterEdit(id),
    onOpen: (id) => bundle.actions.enterOrOpen(id),
    onLink: (from, to) => void bundle.createLink(from, to),
    onPlace: (type, at) => bundle.createAt(type, at),
    onBusy: (ids) => autosave.setBusy(ids),
  })

  /**
   * The viewport is state, not a change to the work: it never enters the undo
   * stack, and it is persisted lazily so a pan does not put the canvas in
   * `saving` every frame (5.2).
   */
  function commitViewport(v: Viewport) {
    const before = store.get().viewport.k
    store.set((s) => {
      s.viewport = v
      if (crossedChip(before, v.k)) s.chip = isChip(v.k)
    })
    if (viewportSaveTimer) clearTimeout(viewportSaveTimer)
    viewportSaveTimer = setTimeout(() => {
      store.dirty.project = { ...store.dirty.project, viewport: store.get().viewport }
      autosave.schedule()
    }, 1000)
  }

  const host: EngineActionsHost = {
    store,
    projectId,
    stack,
    machine,
    autosave,
    overlay: overlayProxy,
    links: linksProxy,
    stageSize: () => dom?.size() ?? { w: 0, h: 0 },
    worldEl: () => dom?.worldEl ?? null,
    setViewport: (v) => machine.setViewport(v, true),
  }

  const bundle = createEngineActions(host)
  const actions = bundle.actions

  const engine: CanvasEngine = {
    machine,
    stack,
    autosave,
    measurer,
    actions,
    refs,

    attach(next) {
      dom = next
      const stage = next.stageEl
      if (!stage) return
      const down = (e: PointerEvent) => machine.down(e)
      const move = (e: PointerEvent) => machine.move(e)
      const up = (e: PointerEvent) => machine.up(e)
      const cancel = () => machine.cancel()
      const wheel = (e: WheelEvent) => machine.wheel(e)

      stage.addEventListener('pointerdown', down)
      stage.addEventListener('pointermove', move, { passive: false })
      stage.addEventListener('pointerup', up)
      stage.addEventListener('pointercancel', cancel)
      stage.addEventListener('lostpointercapture', cancel)
      stage.addEventListener('wheel', wheel, { passive: false })
      window.addEventListener('blur', cancel)

      uninstallKeys = installKeyboard({
        store,
        actions,
        machine,
        openTalk: opts.openTalk,
        openLibrary: opts.openLibrary,
        toggleKeyMap: opts.toggleKeyMap,
        setSetting: (key, value) => {
          store.set((s) => { s.project = { ...s.project, settings: { ...s.project.settings, [key]: value } } })
          store.dirty.project = {
            ...store.dirty.project,
            settings: { ...(store.dirty.project.settings ?? {}), [key]: value },
          }
          autosave.schedule()
        },
        closeDrawer: () => {
          if (store.get().drawer.kind === 'none') return false
          store.set((s) => { s.drawer = { kind: 'none' } })
          return true
        },
      })

      detachDom = () => {
        stage.removeEventListener('pointerdown', down)
        stage.removeEventListener('pointermove', move)
        stage.removeEventListener('pointerup', up)
        stage.removeEventListener('pointercancel', cancel)
        stage.removeEventListener('lostpointercapture', cancel)
        stage.removeEventListener('wheel', wheel)
        window.removeEventListener('blur', cancel)
      }

      // a fresh open starts from the stored viewport
      machine.setViewport(store.get().viewport, false)
      overlayProxy.sync()
      linksProxy.redraw()
    },

    detach() {
      detachDom?.()
      detachDom = null
      uninstallKeys?.()
      uninstallKeys = null
      dom = null
    },

    setOverlay(api) {
      overlay = api
      api?.sync()
    },

    dispose() {
      engine.detach()
      if (viewportSaveTimer) clearTimeout(viewportSaveTimer)
      measurer.dispose()
      machine.dispose()
      void autosave.flush('manual')
      autosave.dispose()
    },
  }

  // a handle for the dev harness at /dev/canvas; never present in a production build
  if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
    ;(window as unknown as { __studioEngine?: unknown; __studioStore?: unknown }).__studioEngine = engine
    ;(window as unknown as { __studioStore?: unknown }).__studioStore = store
  }

  return engine
}

export const EngineContext = createContext<CanvasEngine | null>(null)

export function useCanvasEngine(): CanvasEngine | null {
  return useContext(EngineContext)
}
