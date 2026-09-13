'use client'

// studio/src/components/talk/talk-bar.tsx — the phone talk bar (8.1, D-040):
// fixed at the bottom; tap → the talk sheet (100 dvh, radius 22 top) with the same
// conversation as the drawer; press-and-hold 400 ms → the sheet opens already
// dictating. Nothing else on the phone talks.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion as m, useReducedMotion } from 'motion/react'
import { Mic, X } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { DrawerIcon } from '@/components/canvas/drawers/drawer'
import { canvasType, geometry, glass, line, motionSpec, zIndex } from '@/lib/studio/canvas-tokens'
import { TalkPanel } from '@/components/talk/talk-drawer'

const HOLD_MS = 400

export function TalkBar() {
  const { t } = useTheme()
  const reduce = useReducedMotion() ?? false
  const [open, setOpen] = useState<{ dictate: boolean } | null>(null)
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
    <>
      <button
        type="button"
        data-talk-bar
        aria-label="talk (hold to dictate)"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          fired.current = false
          setHolding(true)
          timer.current = setTimeout(() => {
            fired.current = true
            setHolding(false)
            setOpen({ dictate: true })
          }, HOLD_MS)
        }}
        onPointerUp={() => {
          const wasArmed = timer.current !== null
          clear()
          if (wasArmed && !fired.current) setOpen({ dictate: false })
        }}
        onPointerLeave={clear}
        onPointerCancel={clear}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen({ dictate: false })
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: 'fixed',
          left: 12,
          right: 12,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
          height: geometry.talkPillH,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 16px',
          backgroundColor: glass.bg,
          backdropFilter: glass.filter,
          WebkitBackdropFilter: glass.filter,
          border: `1px solid ${line.chrome}`,
          borderRadius: 999,
          color: glass.text,
          zIndex: zIndex.chrome,
          cursor: 'pointer',
          transform: holding ? 'scale(0.98)' : 'scale(1)',
          transition: `transform ${motionSpec.hoverMs}ms ease`,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        <Mic size={16} strokeWidth={1.5} />
        <span style={{ ...canvasType.small, fontWeight: 500 }}>talk</span>
        <span style={{ ...canvasType.label, color: glass.muted, marginLeft: 'auto' }}>hold to dictate</span>
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            key="talk-sheet"
            role="dialog"
            aria-label="talk"
            data-talk-sheet
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: reduce ? 0 : motionSpec.drawerMs / 1000, ease: [0.2, 0.7, 0.2, 1] }}
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              height: '100dvh',
              backgroundColor: t.containerBg,
              borderRadius: '22px 22px 0 0',
              zIndex: zIndex.drawer,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              paddingTop: 'env(safe-area-inset-top, 0px)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 12,
                padding: '18px 16px 12px',
                borderBottom: `1px solid ${t.divider}`,
                flexShrink: 0,
              }}
            >
              <div>
                <div style={{ ...canvasType.eyebrow, color: t.textMuted, marginBottom: 4 }}>talk</div>
                <div style={{ ...canvasType.title, color: t.textPrimary }}>talk</div>
              </div>
              <DrawerIcon ariaLabel="close" onClick={() => setOpen(null)} icon={<X size={16} strokeWidth={1.5} />} />
            </div>
            <TalkPanel dictate={open.dictate} phone />
          </m.div>
        )}
      </AnimatePresence>
    </>
  )
}
