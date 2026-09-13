'use client'

// studio/src/components/canvas/chrome/arrivals-pill.tsx — D-038. When blocks
// have arrived from talk and are sitting off-screen at the edge of the canvas,
// a tide pill at the right edge says how many and pans to them.
//
// It says "2 arrived", never a badge or a counter on a tab: the number is the
// only thing on screen that counts anything, and it counts things waiting for a
// decision, not things done (D-049).

import { useMemo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { alpha } from '@/lib/design-tokens'
import { canvasType, geometry, radii } from '@/lib/studio/canvas-tokens'
import { intersects, rectOf } from '@/lib/studio/geometry'
import { useCanvasStore, useInteractive, useStore } from '@/lib/studio/hooks'
import { useActions } from '@/components/canvas/actions'
import { visibleWorldRect } from '@/lib/studio/engine/viewport'

export function ArrivalsPill() {
  const { t } = useTheme()
  const store = useStore()
  const actions = useActions()
  const interactive = useInteractive()
  const reduce = useReducedMotion() ?? false

  const viewport = useCanvasStore((s) => s.viewport)
  const unplacedIds = useCanvasStore(
    () => store.unplaced().map((b) => b.id),
    (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
  )

  /** Only arrivals the person cannot currently see are worth a pill. */
  const offScreen = useMemo(() => {
    if (unplacedIds.length === 0) return []
    const w = typeof window === 'undefined' ? 0 : window.innerWidth
    const h = typeof window === 'undefined' ? 0 : window.innerHeight - geometry.topBarH
    if (w === 0) return []
    const view = visibleWorldRect(viewport, w, h, 0)
    return unplacedIds.filter((id) => {
      const b = store.get().blocks.get(id)
      return !!b && !intersects(rectOf(b), view)
    })
  }, [unplacedIds, viewport, store])

  if (offScreen.length === 0) return null

  const goThere = () => {
    actions?.fitIds(offScreen)
  }

  const word = offScreen.length === 1 ? '1 arrived' : `${offScreen.length} arrived`

  return (
    <motion.button
      type="button"
      onClick={goThere}
      initial={reduce ? false : { opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: reduce ? 0 : 0.2 }}
      title={interactive ? 'pan to what arrived' : 'pan to what arrived — place it from a larger screen'}
      style={{
        position: 'fixed',
        right: geometry.railW + 12,
        top: `calc(50% - 16px)`,
        height: 32,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 12px',
        borderRadius: radii.pill,
        border: `1px solid ${alpha(t.tide, 0.5)}`,
        backgroundColor: alpha(t.tide, 0.14),
        backdropFilter: 'blur(12px)',
        color: t.tide,
        cursor: 'pointer',
        zIndex: 40,
        ...canvasType.label,
      }}
    >
      <span
        aria-hidden
        style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: t.tide, display: 'inline-block' }}
      />
      {word} →
    </motion.button>
  )
}
