'use client'

// studio/src/components/canvas/drawers/drawer-host.tsx — mounts the right drawer
// by store.drawer.kind (6.4): talk (G, chromeless, 420), compass (D, 420), draft
// (D, chromeless, 760 with `wider`), concept revisions (H, 420). Selecting another
// draft swaps content in place; the canvas stays pannable underneath.

import { useCallback, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { geometry } from '@/lib/studio/canvas-tokens'
import { useDrawer, useStore } from '@/lib/studio/hooks'
import { CompassDrawer } from '@/components/compass/compass-drawer'
import { ConceptRevisionsDrawer } from '@/components/concept/concept-revisions-drawer'
import { DraftStudio } from '@/components/draft/draft-studio'
import { TalkDrawer } from '@/components/talk/talk-drawer'
import { Drawer, DrawerChromeContext, type DrawerChrome } from '@/components/canvas/drawers/drawer'

export function DrawerHost({ talkDictate = false }: { talkDictate?: boolean }) {
  const store = useStore()
  const drawer = useDrawer()
  const [wider, setWider] = useState(false)

  const close = useCallback(() => {
    store.set((s) => {
      s.drawer = { kind: 'none' }
    })
  }, [store])

  const chrome = useMemo<DrawerChrome>(() => ({ close, wider, setWider }), [close, wider])

  return (
    <DrawerChromeContext.Provider value={chrome}>
      <AnimatePresence initial={false}>
        {drawer.kind === 'talk' && (
          <Drawer key="talk" chromeless ariaLabel="talk">
            <TalkDrawer dictate={talkDictate} />
          </Drawer>
        )}
        {drawer.kind === 'compass' && (
          <Drawer key="compass" eyebrow="compass" title="compass" ariaLabel="compass">
            <CompassDrawer />
          </Drawer>
        )}
        {drawer.kind === 'draft' && drawer.draftId && (
          <Drawer key="draft" chromeless width={geometry.draftDrawerW} wider={wider} ariaLabel="draft">
            <DraftStudio draftId={drawer.draftId} />
          </Drawer>
        )}
        {drawer.kind === 'revisions' && (
          <Drawer key="revisions" eyebrow="concept" title="concept edits" ariaLabel="concept edits">
            <ConceptRevisionsDrawer />
          </Drawer>
        )}
      </AnimatePresence>
    </DrawerChromeContext.Provider>
  )
}
