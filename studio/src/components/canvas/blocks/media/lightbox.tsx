'use client'

// studio/src/components/canvas/blocks/media/lightbox.tsx — full-screen viewer for
// image and gallery blocks (lane E, 6.2). A portal over everything (ink at .94),
// the image contained, the caption under it, ←/→/Esc on the keyboard, a swipe on
// touch. Nothing here talks to a model; urls come from the store's AssetViews.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion as m, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { shell } from '@/lib/design-tokens'
import { canvasType, motionSpec, zIndex } from '@/lib/studio/canvas-tokens'
import { useCanvasStore, useStore } from '@/lib/studio/hooks'
import { refreshAssetUrls } from '@/lib/studio/media/upload'
import { IconHit } from '@/components/canvas/chrome/panel'

export interface LightboxItem {
  asset_id: string
  caption: string
}

export interface LightboxProps {
  items: LightboxItem[]
  index: number
  onClose: () => void
  onIndex: (i: number) => void
}

const SWIPE_PX = 40

export function Lightbox({ items, index, onClose, onIndex }: LightboxProps) {
  const store = useStore()
  const reduce = useReducedMotion() ?? false
  const count = items.length
  const safeIndex = count === 0 ? 0 : Math.min(Math.max(0, index), count - 1)
  const item = items[safeIndex]
  const asset = useCanvasStore((s) => (item ? s.assets.get(item.asset_id) : undefined))
  const [mounted, setMounted] = useState(false)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const refreshed = useRef<Set<string>>(new Set())

  const prev = useCallback(() => {
    if (count > 1) onIndex((safeIndex - 1 + count) % count)
  }, [count, safeIndex, onIndex])
  const next = useCallback(() => {
    if (count > 1) onIndex((safeIndex + 1) % count)
  }, [count, safeIndex, onIndex])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (e.key === 'Escape') onClose()
        else if (e.key === 'ArrowLeft') prev()
        else next()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [onClose, prev, next])

  if (!mounted || typeof document === 'undefined' || count === 0) return null

  const onImgError = () => {
    if (!item || refreshed.current.has(item.asset_id)) return
    refreshed.current.add(item.asset_id)
    void refreshAssetUrls(store, item.asset_id)
  }

  const node = (
    <m.div
      role="dialog"
      aria-label="full screen"
      data-no-drag
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduce ? 0 : motionSpec.hoverMs / 1000 }}
      onClick={onClose}
      onPointerDown={(e) => {
        pointerStart.current = { x: e.clientX, y: e.clientY }
      }}
      onPointerUp={(e) => {
        const start = pointerStart.current
        pointerStart.current = null
        if (!start) return
        const dx = e.clientX - start.x
        const dy = e.clientY - start.y
        if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
          e.stopPropagation()
          if (dx < 0) next()
          else prev()
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: zIndex.dialog,
        backgroundColor: 'rgba(13,12,11,0.94)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: shell.text,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <div style={{ position: 'absolute', top: 'calc(12px + env(safe-area-inset-top, 0px))', right: 12 }}>
        <IconHit ariaLabel="close" icon={<X size={16} strokeWidth={1.5} />} onClick={onClose} tip="esc" tipSide="left" />
      </div>

      {count > 1 && (
        <>
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} onClick={(e) => e.stopPropagation()}>
            <IconHit ariaLabel="previous" icon={<ChevronLeft size={16} strokeWidth={1.5} />} onClick={prev} tip="←" tipSide="right" />
          </div>
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }} onClick={(e) => e.stopPropagation()}>
            <IconHit ariaLabel="next" icon={<ChevronRight size={16} strokeWidth={1.5} />} onClick={next} tip="→" tipSide="left" />
          </div>
        </>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, maxWidth: '92vw', maxHeight: '90dvh' }}
      >
        {asset ? (
          <img
            key={asset.id + asset.url}
            src={asset.url}
            alt={item?.caption ?? ''}
            decoding="async"
            draggable={false}
            onError={onImgError}
            style={{ maxWidth: '92vw', maxHeight: '78dvh', objectFit: 'contain', borderRadius: 4, display: 'block' }}
          />
        ) : (
          <div style={{ ...canvasType.meta, color: shell.muted }}>this image is not available</div>
        )}
        {item?.caption.trim() && (
          <div style={{ ...canvasType.small, color: shell.text, textAlign: 'center', maxWidth: 640, padding: '0 16px' }}>{item.caption}</div>
        )}
        {count > 1 && (
          <div style={{ ...canvasType.meta, color: shell.muted }}>
            {safeIndex + 1} / {count}
          </div>
        )}
      </div>
    </m.div>
  )

  return createPortal(node, document.body)
}
