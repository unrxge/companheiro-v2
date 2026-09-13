'use client'

// studio/src/components/canvas/canvas-page.tsx — the composition root (lane A,
// section 11). CanvasProvider creates the store once from the bundle, provides
// StoreContext + ActionsContext, and registers the block renderers. CanvasPage
// lays out the desktop builder: a fixed root (ink + atmosphere), the 48 px top
// bar, the stage below it, and the chrome as siblings of the stage (5.0): left
// rail + panels, right dock + panels, context bar, zoom pill, talk pill, status
// strip, drawer host. The arrivals pill is lane B's (overlays/arrivals-pill.tsx)
// and is not rendered here yet.
//
// LANE B: replace the `createDefaultActions(...)` call below with the
// engine-backed factory of the same interface, mount your Stage (this file
// imports './stage' by name), and add useAutosave + the keyboard install here.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Atmosphere } from '@/components/shell/atmosphere'
import { shell } from '@/lib/design-tokens'
import { geometry, motionSpec } from '@/lib/studio/canvas-tokens'
import { StoreContext, useInteractive, useStore } from '@/lib/studio/hooks'
import { createStore, type CanvasStore } from '@/lib/studio/store'
import type { ProjectBundle } from '@/lib/studio/types'
import { ActionsContext, createDefaultActions, createInterimFlush, useActionsStrict, type CanvasActions } from '@/components/canvas/actions'
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
import { Stage } from '@/components/canvas/stage'

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
  const [flush] = useState(() => createInterimFlush(store, bundle.project.id))
  const [actions] = useState<CanvasActions>(() =>
    createDefaultActions({ store, projectId: bundle.project.id, userId: bundle.project.user_id, stageSize, flush })
  )

  useEffect(() => {
    store.set((s) => {
      if (s.interactive !== interactive) s.interactive = interactive
    })
  }, [store, interactive])

  useEffect(() => {
    flush.attach()
    return () => {
      actions.dispose()
      flush.detach()
    }
  }, [flush, actions])

  return (
    <StoreContext.Provider value={store}>
      <ActionsContext.Provider value={actions}>{children}</ActionsContext.Provider>
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
      {/* ArrivalsPill (lane B, D-038) mounts here between the pills and the drawers. */}
      <DrawerHost talkDictate={talkDictate} />
    </div>
  )
}
