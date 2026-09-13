'use client'

// studio/src/components/canvas/blocks/rich/frame.tsx — the frame region (6.2,
// D-019…D-022; lane D). 1 px dashed `line.frame`, radius 16; a name tab at the
// top-left (mono uppercase on a containerBg chip overlapping the border) with a
// 12 px chevron that collapses through actions.collapse; optional tint = a 6 %
// wash of the hue; collapsed = a 48 px bar whose tab reads `NAME · 7 BLOCKS`.
// The bar carries `data-frame-bar` so the pointer machine drags the frame by it.
//
// Drop-target state (dashes → solid tide): the store has no field for it, so
// the engine's `overlay.dropFrame(id)` sets `data-drop-target="true"` on the
// frame's `[data-block-id]` element (or on this renderer's root) and this
// component watches that attribute with a MutationObserver. Nothing goes
// through React during the drag except this one attribute flip.

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { alpha } from '@/lib/design-tokens'
import { canvasType, geometry, line, motionSpec, radii } from '@/lib/studio/canvas-tokens'
import { useCanvasStore, useInteractive, useStore } from '@/lib/studio/hooks'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'
import { useActions } from '@/components/canvas/actions'

const DROP_ATTR = 'data-drop-target'

/** True while the engine marks this frame as the drop target (attribute on the root or its `[data-block-id]` wrapper). */
function useDropTarget(rootRef: React.RefObject<HTMLDivElement | null>): boolean {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const wrapper = root.closest('[data-block-id]') as HTMLElement | null
    const targets = [root, wrapper].filter((el): el is HTMLElement => !!el)
    const read = () => setOn(targets.some((el) => el.getAttribute(DROP_ATTR) === 'true'))
    read()
    const observer = new MutationObserver(read)
    for (const el of targets) observer.observe(el, { attributes: true, attributeFilter: [DROP_ATTR] })
    return () => observer.disconnect()
  }, [rootRef])
  return on
}

export function FrameBlock({ block, phone }: BlockRendererProps<'frame'>) {
  const { t } = useTheme()
  const store = useStore()
  const actions = useActions()
  const interactive = useInteractive()
  const rootRef = useRef<HTMLDivElement>(null)
  const dropTarget = useDropTarget(rootRef)
  const childCount = useCanvasStore(() => store.descendants(block.id).length)

  const tint = block.content.tint
  const wash = tint !== 'none' ? alpha(t.hue(tint), 0.06) : 'transparent'
  const collapsed = block.collapsed
  const name = (block.name?.trim() || 'frame').toLowerCase()
  const tab = collapsed ? `${name} · ${childCount} ${childCount === 1 ? 'block' : 'blocks'}` : name

  const toggle = () => {
    if (!actions || !interactive) return
    actions.collapse(block.id, !collapsed)
  }

  return (
    <div
      ref={rootRef}
      data-frame
      data-collapsed={collapsed ? 'true' : undefined}
      style={{
        position: 'relative',
        width: '100%',
        height: collapsed ? geometry.frameBarH : block.h,
        boxSizing: 'border-box',
        borderRadius: radii.frame,
        border: dropTarget ? `1px solid ${t.tide}` : `1px dashed ${line.frame(t)}`,
        backgroundColor: wash,
        transition: `border-color ${motionSpec.hoverMs}ms ease, background-color ${motionSpec.hoverMs}ms ease`,
      }}
    >
      <div
        data-frame-bar
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: geometry.frameBarH,
          cursor: interactive && !phone ? 'grab' : 'default',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: -10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          borderRadius: 6,
          backgroundColor: t.containerBg,
          color: t.textSecondary,
          maxWidth: 'calc(100% - 24px)',
          pointerEvents: 'auto',
        }}
      >
        <span style={{ ...canvasType.label, color: t.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab}</span>
        {!phone && (
          <button
            type="button"
            data-no-drag
            aria-label={collapsed ? 'expand frame' : 'collapse frame'}
            title={collapsed ? 'expand' : 'collapse'}
            disabled={!interactive}
            onClick={(e) => {
              e.stopPropagation()
              toggle()
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 16,
              height: 16,
              padding: 0,
              border: 'none',
              background: 'transparent',
              color: t.textMuted,
              cursor: interactive ? 'pointer' : 'default',
            }}
          >
            {collapsed ? <ChevronRight size={12} strokeWidth={1.5} /> : <ChevronDown size={12} strokeWidth={1.5} />}
          </button>
        )}
      </div>
    </div>
  )
}
