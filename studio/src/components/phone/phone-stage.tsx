'use client'

// studio/src/components/phone/phone-stage.tsx — the canvas on a phone (5.13,
// D-040). The SAME Stage, with `interactive = false`: the pointer machine then
// registers only panning and pinching, so one finger pans, two zoom, and
// nothing can be moved, resized or created. Tapping a block opens it as a sheet
// instead of selecting it, because reading is not arranging.
//
// Talk still works here — talk is not a canvas edit, and a phone is where most
// talking happens. Blocks it produces wait at the edge for the next desk
// session.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { shell } from '@/lib/design-tokens'
import { canvasType, geometry, glass, line, zIndex } from '@/lib/studio/canvas-tokens'
import { useSince, useStore } from '@/lib/studio/hooks'
import { sinceSentence } from '@/lib/studio/since'
import { fit } from '@/lib/studio/engine/viewport'
import { ChromeStyles } from '@/components/canvas/chrome/panel'
import { Stage } from '@/components/canvas/stage'
import { TalkBar } from '@/components/talk/talk-bar'
import { BlockSheet } from '@/components/phone/block-sheet'

const PHONE_K_MIN = 0.35

export function PhoneStage() {
  const { t } = useTheme()
  const store = useStore()
  const since = useSince()
  const rootRef = useRef<HTMLDivElement>(null)
  const [sheetId, setSheetId] = useState<string | null>(null)

  useEffect(() => {
    const el = rootRef.current
    const bbox = store.bboxAll()
    if (!el || !bbox) return
    const v = fit(bbox, el.clientWidth, el.clientHeight - geometry.topBarH)
    const k = Math.max(PHONE_K_MIN, v.k)
    // When the floor lifts k above the true fit, centring would cut both edges: keep the left edge (the concept) in view.
    const clamped = k > v.k
    store.set((s) => {
      s.viewport = {
        k,
        tx: Math.round(clamped ? 16 - bbox.x * k : (el.clientWidth - bbox.w * k) / 2 - bbox.x * k),
        ty: Math.round(16 - bbox.y * k),
      }
      s.chip = k < 0.3
    })
  }, [store])

  /**
   * A tap is a click that did not pan. The machine has already swallowed the
   * drag, so anything that still reaches here with a block under it is a tap.
   */
  const onClick = useCallback((e: React.MouseEvent) => {
    if (!(e.target instanceof Element)) return
    const el = e.target.closest('[data-block-id]')
    const id = el?.getAttribute('data-block-id')
    if (!id) return
    const block = store.get().blocks.get(id)
    if (!block || block.type === 'since') return
    setSheetId(id)
  }, [store])

  const firstOpen = !since.last_said && since.arrived_since === 0 && since.waiting === 0
  const { lines, dots } = sinceSentence(since, new Date(), firstOpen)

  return (
    <div ref={rootRef} style={{ position: 'fixed', inset: 0, backgroundColor: shell.ink, overflow: 'hidden' }}>
      <ChromeStyles />
      <div
        data-since-strip
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: geometry.topBarH,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '0 16px',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          color: glass.text,
          borderBottom: `1px solid ${line.chrome}`,
          zIndex: zIndex.chrome,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ ...canvasType.label, color: glass.muted, flexShrink: 0 }}>since you were here</span>
        <span style={{ ...canvasType.small, overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
          {dots[0] && <i style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.tide, flexShrink: 0 }} />}
          {lines[0] ?? 'first time here'}
        </span>
      </div>
      <div onClick={onClick} style={{ position: 'absolute', inset: 0 }}>
        <Stage interactive={false} phone />
      </div>
      <TalkBar />
      {sheetId && <BlockSheet id={sheetId} onClose={() => setSheetId(null)} />}
    </div>
  )
}
