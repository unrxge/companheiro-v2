'use client'

// studio/src/components/canvas/chrome/left-rail.tsx — the left rail (6.4): 48 px
// ink-glass, 16 px inset from the stage's top-left, two icons — `plus` (library)
// and `layers` (blocks list) — each opening a 280 px pop-over panel to the right
// of the rail (x ±12 → 0 + opacity, 220 ms).

import { AnimatePresence, motion as m, useReducedMotion } from 'motion/react'
import { Layers, Plus } from 'lucide-react'
import { geometry, motionSpec, zIndex } from '@/lib/studio/canvas-tokens'
import { useDock, useInteractive, useStore } from '@/lib/studio/hooks'
import type { LeftDock } from '@/lib/studio/store'
import type { BlockType } from '@/lib/studio/types'
import type { CanvasActions } from '@/components/canvas/actions'
import { BlocksListPanel } from '@/components/canvas/chrome/blocks-list-panel'
import { LibraryPanel } from '@/components/canvas/chrome/library-panel'
import { IconHit, Panel, Rail } from '@/components/canvas/chrome/panel'

export function LeftRail({ actions, onPlace }: { actions: CanvasActions; onPlace?: (type: BlockType) => void }) {
  const store = useStore()
  const dock = useDock()
  const interactive = useInteractive()
  const reduce = useReducedMotion() ?? false
  const place = onPlace ?? ((type: BlockType) => actions.enterPlacing(type))

  const toggle = (which: LeftDock) =>
    store.set((s) => {
      s.dock = { ...s.dock, left: s.dock.left === which ? 'none' : which }
    })

  return (
    <>
      <Rail side="left">
        <IconHit
          size={36}
          ariaLabel="library"
          tip="library"
          tipSide="right"
          active={dock.left === 'library'}
          onClick={() => toggle('library')}
          icon={<Plus size={16} strokeWidth={1.5} />}
        />
        <IconHit
          size={36}
          ariaLabel="layers"
          tip="layers"
          tipSide="right"
          active={dock.left === 'layers'}
          onClick={() => toggle('layers')}
          icon={<Layers size={16} strokeWidth={1.5} />}
        />
      </Rail>
      <AnimatePresence>
        {dock.left !== 'none' && (
          <m.div
            key={dock.left}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: reduce ? 0 : motionSpec.panelMs / 1000, ease: [0.2, 0.7, 0.2, 1] }}
            style={{
              position: 'absolute',
              top: geometry.topBarH + 16,
              left: 16 + geometry.railW + 8,
              zIndex: zIndex.chrome,
            }}
          >
            <Panel width={geometry.libraryPanelW} ariaLabel={dock.left}>
              {dock.left === 'library' ? <LibraryPanel onPlace={place} disabled={!interactive} /> : <BlocksListPanel actions={actions} />}
            </Panel>
          </m.div>
        )}
      </AnimatePresence>
    </>
  )
}
