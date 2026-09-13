'use client'

// studio/src/components/canvas/chrome/talk-pill.tsx — bottom-right corner (6.4):
// a 44 px pill in the paper's inverse (ink on paper / paper on coal), mic glyph +
// `talk`. Tap → the talk drawer; press-and-hold 400 ms → the drawer opens already
// dictating (8.1). The pill only reports which; canvas-page opens the drawer.

import { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType, geometry, motionSpec, zIndex } from '@/lib/studio/canvas-tokens'

const HOLD_MS = 400

export function TalkPill({ onOpen }: { onOpen: (dictate: boolean) => void }) {
  const { t } = useTheme()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const [holding, setHolding] = useState(false)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHolding(false)
  }

  return (
    <button
      type="button"
      data-talk-pill
      aria-label="talk (hold to dictate)"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        fired.current = false
        setHolding(true)
        timer.current = setTimeout(() => {
          fired.current = true
          setHolding(false)
          onOpen(true)
        }, HOLD_MS)
      }}
      onPointerUp={() => {
        const wasArmed = timer.current !== null
        clear()
        if (wasArmed && !fired.current) onOpen(false)
      }}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(false)
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'absolute',
        right: 16,
        bottom: 16,
        height: geometry.talkPillH,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 18px 0 16px',
        borderRadius: 999,
        border: 'none',
        backgroundColor: t.inverseBg,
        color: t.inverseText,
        cursor: 'pointer',
        zIndex: zIndex.chrome,
        boxShadow: t.shadow,
        transform: holding ? 'scale(0.98)' : 'scale(1)',
        transition: `transform ${motionSpec.hoverMs}ms ease, background-color 0.3s ease`,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      <Mic size={16} strokeWidth={1.5} />
      <span style={{ ...canvasType.small, fontWeight: 600 }}>talk</span>
    </button>
  )
}
