'use client'

// studio/src/components/canvas/chrome/right-dock.tsx — the right dock (6.4): a
// 48 px rail 16 px inset top-right with three icons — `sliders` (selection
// settings; auto-opens on selection when nothing is pinned), `grid` (grid & guides
// & keys), `folder` (project) — and a 320 px panel to the left of the rail.

import { useEffect, useRef } from 'react'
import { AnimatePresence, motion as m, useReducedMotion } from 'motion/react'
import { Folder, Grid3x3, SlidersHorizontal } from 'lucide-react'
import { geometry, motionSpec, zIndex } from '@/lib/studio/canvas-tokens'
import { useCanvasStore, useDock, useStore } from '@/lib/studio/hooks'
import type { RightDock as RightDockKind } from '@/lib/studio/store'
import type { CanvasActions } from '@/components/canvas/actions'
import { GridPanel } from '@/components/canvas/chrome/grid-panel'
import { IconHit, Panel, Rail } from '@/components/canvas/chrome/panel'
import { ProjectPanel } from '@/components/canvas/chrome/project-panel'
import { SelectionSettings } from '@/components/canvas/chrome/selection-settings'

export function RightDock({ actions }: { actions: CanvasActions }) {
  const store = useStore()
  const dock = useDock()
  const hasSelection = useCanvasStore((s) => s.selection.size > 0)
  const reduce = useReducedMotion() ?? false
  /** true when the person opened the panel by clicking the rail (then it never auto-closes). */
  const pinned = useRef(false)

  const toggle = (which: RightDockKind) => {
    store.set((s) => {
      s.dock = { ...s.dock, right: s.dock.right === which ? 'none' : which }
    })
    pinned.current = store.get().dock.right !== 'none'
  }

  useEffect(() => {
    const right = store.get().dock.right
    if (hasSelection && right === 'none') {
      pinned.current = false
      store.set((s) => {
        s.dock = { ...s.dock, right: 'selection' }
      })
    } else if (!hasSelection && right === 'selection' && !pinned.current) {
      store.set((s) => {
        s.dock = { ...s.dock, right: 'none' }
      })
    }
  }, [hasSelection, store])

  return (
    <>
      <Rail side="right">
        <IconHit
          size={36}
          ariaLabel="selection"
          tip="selection"
          tipSide="left"
          active={dock.right === 'selection'}
          onClick={() => toggle('selection')}
          icon={<SlidersHorizontal size={16} strokeWidth={1.5} />}
        />
        <IconHit
          size={36}
          ariaLabel="grid & keys"
          tip="grid & keys"
          tipSide="left"
          active={dock.right === 'grid'}
          onClick={() => toggle('grid')}
          icon={<Grid3x3 size={16} strokeWidth={1.5} />}
        />
        <IconHit
          size={36}
          ariaLabel="project"
          tip="project"
          tipSide="left"
          active={dock.right === 'project'}
          onClick={() => toggle('project')}
          icon={<Folder size={16} strokeWidth={1.5} />}
        />
      </Rail>
      <AnimatePresence>
        {dock.right !== 'none' && (
          <m.div
            key={dock.right}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: reduce ? 0 : motionSpec.panelMs / 1000, ease: [0.2, 0.7, 0.2, 1] }}
            style={{
              position: 'absolute',
              top: geometry.topBarH + 16,
              right: 16 + geometry.railW + 8,
              zIndex: zIndex.chrome,
            }}
          >
            <Panel width={geometry.rightDockW} ariaLabel={dock.right}>
              {dock.right === 'selection' && <SelectionSettings actions={actions} />}
              {dock.right === 'grid' && <GridPanel actions={actions} />}
              {dock.right === 'project' && <ProjectPanel actions={actions} />}
            </Panel>
          </m.div>
        )}
      </AnimatePresence>
    </>
  )
}
