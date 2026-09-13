'use client'

// studio/src/components/phone/phone-stage.tsx — STUB (lane A, 11.1). Lane B
// replaces the body with 5.13 (one-finger pan, pinch, tap → BlockSheet, the
// phone initial viewport). The exported signature stays: `PhoneStage()`. It reads
// the store from StoreContext (the project page wraps it in CanvasProvider).
//
// Stub behaviour: the same Stage with interactive = false, the since line fixed
// at the top, G's TalkBar fixed at the bottom, and fit(all) with k ≥ 0.35 once
// on mount (D-004).

import { useEffect, useRef } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { shell } from '@/lib/design-tokens'
import { canvasType, geometry, glass, line, zIndex } from '@/lib/studio/canvas-tokens'
import { useSince, useStore } from '@/lib/studio/hooks'
import { sinceSentence } from '@/lib/studio/since'
import { fitViewport } from '@/components/canvas/actions'
import { ChromeStyles } from '@/components/canvas/chrome/panel'
import { Stage } from '@/components/canvas/stage'
import { TalkBar } from '@/components/talk/talk-bar'

const PHONE_K_MIN = 0.35

export function PhoneStage() {
  const { t } = useTheme()
  const store = useStore()
  const since = useSince()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = rootRef.current
    const bbox = store.bboxAll()
    if (!el || !bbox) return
    const v = fitViewport(bbox, el.clientWidth, el.clientHeight - geometry.topBarH)
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
      <Stage interactive={false} phone />
      <TalkBar />
    </div>
  )
}
