'use client'

// studio/src/components/canvas/canvas-page.tsx — the composition root (lane A,
// section 11). CanvasProvider creates the store once from the bundle, provides
// StoreContext + ActionsContext, and registers the block renderers. CanvasPage
// lays out the desktop builder: a fixed root (ink + atmosphere), the 48 px top
// bar, the stage below it, and the chrome as siblings of the stage (5.0): left
// rail + panels, right dock + panels, context bar, zoom pill, talk pill, status
// strip, drawer host, and the arrivals pill.
//
// The actions object comes from the engine (`createCanvasEngine`), which also
// owns the pointer machine, the command stack, autosave, height measuring and
// the keyboard. The interim flusher and `createDefaultActions` are gone: the
// engine's actions implement the same `CanvasActions` interface, so nothing in
// chrome/* changed.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Atmosphere } from '@/components/shell/atmosphere'
import { shell } from '@/lib/design-tokens'
import { geometry, motionSpec } from '@/lib/studio/canvas-tokens'
import { StoreContext, useInteractive, useStore } from '@/lib/studio/hooks'
import { createStore, type CanvasStore } from '@/lib/studio/store'
import type { ProjectBundle } from '@/lib/studio/types'
import { ActionsContext, useActionsStrict } from '@/components/canvas/actions'
import { registerAll } from '@/components/canvas/blocks'
import { ContextBar } from '@/components/canvas/chrome/context-bar'
import { LeftRail } from '@/components/canvas/chrome/left-rail'
import { ChromeStyles } from '@/components/canvas/chrome/panel'
import { RightDock } from '@/components/canvas/chrome/right-dock'
import { StatusStrip } from '@/components/canvas/chrome/status-strip'
import { TalkPill } from '@/components/canvas/chrome/talk-pill'
import { TopBar } from '@/components/canvas/chrome/top-bar'
import { ZoomPill } from '@/components/canvas/chrome/zoom-pill'
import { DrawerHost } from '@/components/canvas/drawers/drawer-host'
import { ArrivalsPill } from '@/components/canvas/chrome/arrivals-pill'
import { Stage } from '@/components/canvas/stage'
import { EngineContext, createCanvasEngine, type CanvasEngine } from '@/components/canvas/engine-context'

function stageSize(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 1280, h: 800 - geometry.topBarH }
  return { w: window.innerWidth, h: window.innerHeight - geometry.topBarH }
}

/**
 * Store + actions for one project. The store is created once per mount (a new
 * project id remounts through `key`); `interactive` is synced into it.
 */
export function CanvasProvider({ bundle, interactive, children }: { bundle: ProjectBundle; interactive: boolean; children: ReactNode }) {
  const [store] = useState<CanvasStore>(() => {
    registerAll()
    return createStore(bundle, interactive)
  })
  /**
   * The engine is created and destroyed by the effect that owns it, rather than
   * once in a useState with a cleanup that disposes it. An engine holds real
   * resources — pointer listeners, a keyboard, timers, a ResizeObserver — and a
   * disposed one stays dead, so it must never outlive or under-live its effect.
   * A mount → unmount → mount cycle (React's strict double-mount, or a
   * Fast Refresh) therefore gets a fresh engine instead of a dead one whose
   * autosave silently stops flushing.
   *
   * Chrome calls `useActionsStrict()`, so children wait the one tick until the
   * engine exists.
   */
  const [engine, setEngine] = useState<CanvasEngine | null>(null)
  const projectId = bundle.project.id

  useEffect(() => {
    // the library and talk are opened by key as well as by click, so the engine
    // is given the two openers rather than reaching into chrome state
    const next = createCanvasEngine({
      store,
      projectId,
      openTalk: () => store.set((s) => { s.drawer = { kind: 'talk' } }),
      openLibrary: () => store.set((s) => { s.dock = { ...s.dock, left: 'library' } }),
      toggleKeyMap: () => store.set((s) => {
        s.dock = { ...s.dock, right: s.dock.right === 'grid' ? 'none' : 'grid' }
      }),
    })
    setEngine(next)
    return () => {
      next.dispose()
      setEngine((current) => (current === next ? null : current))
    }
  }, [store, projectId])

  useEffect(() => {
    store.set((s) => {
      if (s.interactive !== interactive) s.interactive = interactive
    })
  }, [store, interactive])

  if (!engine) return null

  return (
    <StoreContext.Provider value={store}>
      <EngineContext.Provider value={engine}>
        <ActionsContext.Provider value={engine.actions}>{children}</ActionsContext.Provider>
      </EngineContext.Provider>
    </StoreContext.Provider>
  )
}

export function CanvasPage({ bundle, interactive }: { bundle: ProjectBundle; interactive: boolean }) {
  return (
    <CanvasProvider bundle={bundle} interactive={interactive}>
      <CanvasChrome />
    </CanvasProvider>
  )
}

function CanvasChrome() {
  const store = useStore()
  const actions = useActionsStrict()
  const interactive = useInteractive()
  const rootRef = useRef<HTMLDivElement>(null)
  const [talkDictate, setTalkDictate] = useState(false)

  const openTalk = (dictate: boolean) => {
    setTalkDictate(dictate)
    store.set((s) => {
      s.drawer = { kind: 'talk' }
    })
  }

  const measure = () => {
    const el = rootRef.current
    if (!el) return stageSize()
    return { w: el.clientWidth, h: el.clientHeight - geometry.topBarH }
  }

  return (
    <div ref={rootRef} data-canvas-root style={{ position: 'fixed', inset: 0, backgroundColor: shell.ink, overflow: 'hidden' }}>
      <Atmosphere mood="neutral" intensity={motionSpec.atmosphereIntensity} />
      <ChromeStyles />
      <TopBar actions={actions} />
      <Stage interactive={interactive} />
      <StatusStrip />
      <LeftRail actions={actions} />
      <RightDock actions={actions} />
      <ContextBar actions={actions} stageSize={measure} />
      <ZoomPill actions={actions} />
      <TalkPill onOpen={openTalk} />
      <ArrivalsPill />
      <DrawerHost talkDictate={talkDictate} />
    </div>
  )
}
