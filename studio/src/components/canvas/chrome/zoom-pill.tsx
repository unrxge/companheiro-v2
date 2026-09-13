'use client'

// studio/src/components/canvas/chrome/zoom-pill.tsx — bottom-left corner (6.4):
// `−  100%  +` mono 11, `fit`, `tidy`, and the save word (saved / saving /
// unsaved / sign in again) in mono 10 muted. 28 px tall ink-glass pill.

import { Minus, Plus } from 'lucide-react'
import { canvasType, geometry, glass, line, zIndex } from '@/lib/studio/canvas-tokens'
import { useInteractive, useSaveState, useViewport } from '@/lib/studio/hooks'
import type { CanvasActions } from '@/components/canvas/actions'
import { ZOOM_STEP } from '@/components/canvas/actions'
import { GlassButton, IconHit, Panel } from '@/components/canvas/chrome/panel'

const SAVE_WORD = { saved: 'saved', saving: 'saving', unsaved: 'unsaved', signin: 'sign in again' } as const

export function ZoomPill({ actions }: { actions: CanvasActions }) {
  const v = useViewport()
  const saveState = useSaveState()
  const interactive = useInteractive()
  return (
    <div
      data-zoom-pill
      style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        zIndex: zIndex.chrome,
      }}
    >
      <Panel style={{ height: geometry.zoomPillH, display: 'flex', alignItems: 'center', padding: '0 4px', borderRadius: 999 }}>
        <IconHit size={24} ariaLabel="zoom out" onClick={() => actions.zoomBy(1 / ZOOM_STEP)} icon={<Minus size={14} strokeWidth={1.5} />} />
        <button
          type="button"
          onClick={() => actions.zoomTo(1)}
          title="100%"
          style={{
            ...canvasType.meta,
            color: glass.text,
            background: 'none',
            border: 'none',
            padding: '0 6px',
            minWidth: 44,
            cursor: 'pointer',
            textAlign: 'center',
          }}
        >
          {Math.round(v.k * 100)}%
        </button>
        <IconHit size={24} ariaLabel="zoom in" onClick={() => actions.zoomBy(ZOOM_STEP)} icon={<Plus size={14} strokeWidth={1.5} />} />
        <span aria-hidden style={{ width: 1, height: 14, backgroundColor: line.chromeSoft, margin: '0 2px' }} />
        <GlassButton small mono onClick={() => actions.fitAll()} style={{ padding: '3px 8px' }}>
          fit
        </GlassButton>
        <GlassButton small mono onClick={() => actions.tidy(false)} disabled={!interactive} style={{ padding: '3px 8px' }}>
          tidy
        </GlassButton>
      </Panel>
      <span
        data-save-word
        aria-live="polite"
        style={{
          ...canvasType.label,
          color: saveState === 'unsaved' || saveState === 'signin' ? glass.text : glass.muted,
          textTransform: 'none',
          letterSpacing: '0.04em',
        }}
      >
        {SAVE_WORD[saveState]}
      </span>
    </div>
  )
}
