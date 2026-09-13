'use client'

// studio/src/components/phone/block-sheet.tsx — D-040. Tapping a block on a
// phone opens it as a bottom sheet, because a scaled canvas is unreadable on a
// small screen and pinching to read a note is not reading.
//
// Reading is not arranging, so this is allowed on a phone: the sheet shows the
// block's full content, and the compass sheet keeps its four verbs. What it
// never offers is moving anything — an arrival can only be dismissed here, with
// one line saying where to place it.

import { useEffect } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { alpha } from '@/lib/design-tokens'
import { canvasType, glass, line, radii } from '@/lib/studio/canvas-tokens'
import { useBlock } from '@/lib/studio/hooks'
import { registry } from '@/lib/studio/registry'
import { getRegistration } from '@/components/canvas/blocks/registry'
import { FallbackBlock, typeWord } from '@/components/canvas/blocks/fallback-block'
import { useActions } from '@/components/canvas/actions'
import { CompassSheet } from '@/components/compass/compass-sheet'

export function BlockSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useTheme()
  const block = useBlock(id)
  const actions = useActions()
  const reduce = useReducedMotion() ?? false

  // a sheet is modal enough that the page behind it should not scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!block || block.deleted_at) return null

  const spec = registry[block.type]
  const reg = getRegistration(block.type)
  const Sheet = reg?.Sheet
  const Renderer = reg?.Renderer ?? FallbackBlock
  const unplaced = block.arrival_state === 'unplaced'

  return (
    <motion.div
      role="dialog"
      aria-modal
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.18 }}
      style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: 'rgba(13,12,11,0.5)' }}
      onClick={onClose}
    >
      <motion.div
        initial={reduce ? false : { y: 32 }}
        animate={{ y: 0 }}
        transition={{ duration: reduce ? 0 : 0.22, ease: [0.2, 0, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: t.containerBg,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderTop: `1px solid ${line.chrome}`,
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '14px 16px',
            borderBottom: `1px solid ${line.onPaper(t)}`,
            flexShrink: 0,
          }}
        >
          <span style={{ ...canvasType.label, color: t.textSecondary }}>
            {block.name ?? typeWord(block.type)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: radii.pill,
              border: `1px solid ${line.onPaper(t)}`, background: 'transparent',
              color: t.textSecondary, cursor: 'pointer',
            }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16, WebkitOverflowScrolling: 'touch' }}>
          {block.type === 'compass'
            ? <CompassSheet onClose={onClose} />
            : Sheet
              ? <Sheet block={block} />
              : <Renderer block={block} editing={false} selected={false} phone />}
        </div>

        {unplaced && (
          <footer
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
              borderTop: `1px solid ${line.onPaper(t)}`,
              flexShrink: 0,
            }}
          >
            <span style={{ ...canvasType.label, color: t.textSecondary }}>place it from a larger screen</span>
            <button
              type="button"
              onClick={() => { void actions?.dismiss(id); onClose() }}
              style={{
                ...canvasType.label,
                padding: '8px 14px', borderRadius: radii.pill,
                border: `1px solid ${alpha(t.ember, 0.5)}`,
                backgroundColor: alpha(t.ember, 0.12),
                color: t.ember, cursor: 'pointer',
              }}
            >
              dismiss
            </button>
          </footer>
        )}
        {!unplaced && spec.opens === 'draft' && (
          <footer
            style={{
              padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
              borderTop: `1px solid ${line.onPaper(t)}`,
              flexShrink: 0,
            }}
          >
            <span style={{ ...canvasType.label, color: glass.muted }}>reading only on this screen</span>
          </footer>
        )}
      </motion.div>
    </motion.div>
  )
}
