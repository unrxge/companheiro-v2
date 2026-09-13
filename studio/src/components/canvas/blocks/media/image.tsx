'use client'

// studio/src/components/canvas/blocks/media/image.tsx — the image block (lane E,
// 6.2): the picture fills the width at radius 10 with a hairline inset, the caption
// sits under it inset 16 only when non-empty, no eyebrow. Thumb until the block is
// wider than 480 screen px (5.14). Empty → `choose an image`. Also home to the
// small primitives every media renderer shares (chip button, empty box, url hooks).
//
// D-059: this file knows urls and asset ids; nothing here ever passes them on.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Maximize2 } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { alpha } from '@/lib/design-tokens'
import { canvasType, geometry, line, motionSpec, radii } from '@/lib/studio/canvas-tokens'
import { useAsset, useCanvasStore, useInteractive, useStore } from '@/lib/studio/hooks'
import { THUMB_W } from '@/lib/studio/media/resize'
import { commitBlockContent, IMAGE_ACCEPT, pickFiles, refreshAssetUrls, uploadImage } from '@/lib/studio/media/upload'
import type { AssetView } from '@/lib/studio/types'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'
import { Lightbox } from '@/components/canvas/blocks/media/lightbox'

// ── shared primitives ──────────────────────────────────────────────────────

/** The full asset once k·w passes 480 screen px, else the thumb (5.14). Re-renders only when the threshold flips. */
export function useFullRes(worldWidth: number): boolean {
  return useCanvasStore((s) => s.viewport.k * worldWidth > THUMB_W)
}

const refreshedAt = new Map<string, number>()
const REFRESH_MIN_MS = 30_000

/** The src for an asset at the wanted resolution, and an error handler that refreshes an expired signed url once per 30 s. */
export function useSignedSrc(asset: AssetView | undefined, full: boolean): { src: string | null; onError: () => void } {
  const store = useStore()
  const src = asset ? (full ? asset.url : asset.thumb_url ?? asset.url) || null : null
  const onError = () => {
    if (!asset) return
    const last = refreshedAt.get(asset.id) ?? 0
    if (Date.now() - last < REFRESH_MIN_MS) return
    refreshedAt.set(asset.id, Date.now())
    void refreshAssetUrls(store, asset.id)
  }
  return { src, onError }
}

/** Mono uppercase chip on the ground colour — the media blocks' one control (`full screen`, `choose an image`). */
export function ChipButton({
  children,
  onClick,
  icon,
  style,
  ariaLabel,
  disabled = false,
}: {
  children: ReactNode
  onClick: () => void
  icon?: ReactNode
  style?: CSSProperties
  ariaLabel?: string
  disabled?: boolean
}) {
  const { t } = useTheme()
  return (
    <button
      type="button"
      data-no-drag
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="studio-icon"
      style={{
        ...canvasType.label,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 24,
        padding: '0 8px',
        borderRadius: 6,
        border: `1px solid ${line.onPaper(t)}`,
        backgroundColor: t.containerBg,
        color: t.textPrimary,
        cursor: disabled ? 'default' : 'pointer',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon}
      {children}
    </button>
  )
}

/** The dashed empty box media blocks show before a file exists. */
export function EmptyMediaBox({
  children,
  aspect = 4 / 3,
  radius = radii.media,
  height,
}: {
  children: ReactNode
  aspect?: number
  radius?: number
  height?: number
}) {
  const { t } = useTheme()
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height,
        aspectRatio: height === undefined ? String(aspect) : undefined,
        borderRadius: radius,
        border: `1px dashed ${line.frame(t)}`,
        backgroundColor: alpha(t.cardBg, 0.5),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  )
}

export function MediaStatus({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'ember' }) {
  const { t } = useTheme()
  return <span style={{ ...canvasType.meta, color: tone === 'ember' ? t.ember : t.textMuted, textAlign: 'center', padding: '0 12px' }}>{children}</span>
}

/** `choose an image` opened once, on its own, for a block just made from the library (the tile click is the gesture). */
const autoOpened = new Set<string>()
const FRESH_MS = 5000

export type UploadState = { kind: 'idle' } | { kind: 'busy'; label: string } | { kind: 'error'; message: string }

export function errorMessage(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'that did not go through — try again'
}

// ── the image block ────────────────────────────────────────────────────────

export function ImageBlock({ block, selected, phone }: BlockRendererProps<'image'>) {
  const { t } = useTheme()
  const store = useStore()
  const interactive = useInteractive()
  const asset = useAsset(block.content.asset_id || null)
  const full = useFullRes(block.w)
  const { src, onError } = useSignedSrc(asset, full)
  const [state, setState] = useState<UploadState>({ kind: 'idle' })
  const [hover, setHover] = useState(false)
  const [open, setOpen] = useState(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const choose = async () => {
    if (!interactive || state.kind === 'busy') return
    const [file] = await pickFiles(IMAGE_ACCEPT)
    if (!file) return
    setState({ kind: 'busy', label: 'uploading' })
    try {
      const { asset: uploaded, aspect } = await uploadImage(store, block.project_id, file)
      const w = (store.get().blocks.get(block.id) ?? block).w
      commitBlockContent(store, block, { ...block.content, asset_id: uploaded.id, aspect }, { h: Math.ceil(w / aspect / 8) * 8 })
      if (alive.current) setState({ kind: 'idle' })
    } catch (e) {
      if (alive.current) setState({ kind: 'error', message: errorMessage(e) })
    }
  }

  // First render of a library-made block: open the picker once (D-017 tile click is the gesture).
  const fresh = !block.content.asset_id && Date.now() - Date.parse(block.created_at) < FRESH_MS
  useEffect(() => {
    if (!fresh || !selected || !interactive || phone || autoOpened.has(block.id)) return
    autoOpened.add(block.id)
    void choose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const caption = block.content.caption.trim()
  const aspect = block.content.aspect > 0 ? block.content.aspect : 4 / 3

  if (!block.content.asset_id || !asset) {
    return (
      <div>
        <EmptyMediaBox aspect={aspect}>
          {state.kind === 'busy' ? (
            <MediaStatus>{state.label}</MediaStatus>
          ) : !block.content.asset_id ? (
            interactive && !phone ? (
              <ChipButton onClick={() => void choose()}>choose an image</ChipButton>
            ) : (
              <MediaStatus>no image yet</MediaStatus>
            )
          ) : (
            <MediaStatus>this image is not available</MediaStatus>
          )}
          {state.kind === 'error' && <MediaStatus tone="ember">{state.message}</MediaStatus>}
        </EmptyMediaBox>
        {caption && <Caption>{caption}</Caption>}
      </div>
    )
  }

  return (
    <div>
      <div
        onPointerEnter={phone ? undefined : () => setHover(true)}
        onPointerLeave={phone ? undefined : () => setHover(false)}
        onDoubleClick={phone ? undefined : (e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: String(aspect),
          borderRadius: radii.media,
          overflow: 'hidden',
          backgroundColor: t.cardBgInner,
        }}
      >
        {src && (
          <img
            key={src}
            src={src}
            alt={caption}
            loading="lazy"
            decoding="async"
            draggable={false}
            width={asset.width ?? undefined}
            height={asset.height ?? undefined}
            onError={onError}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: block.content.fit, userSelect: 'none' }}
          />
        )}
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, borderRadius: radii.media, boxShadow: `inset 0 0 0 1px ${line.onPaper(t)}`, pointerEvents: 'none' }}
        />
        {!phone && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              opacity: hover || selected ? 1 : 0,
              transition: `opacity ${motionSpec.hoverMs}ms ease`,
              pointerEvents: hover || selected ? 'auto' : 'none',
            }}
          >
            <ChipButton onClick={() => setOpen(true)} icon={<Maximize2 size={12} strokeWidth={1.5} />} ariaLabel="full screen">
              full screen
            </ChipButton>
          </div>
        )}
        {state.kind === 'busy' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: alpha(t.containerBg, 0.6),
            }}
          >
            <MediaStatus>{state.label}</MediaStatus>
          </div>
        )}
      </div>
      {caption && <Caption>{caption}</Caption>}
      {state.kind === 'error' && (
        <div style={{ padding: `8px ${geometry.captionInset}px 0` }}>
          <MediaStatus tone="ember">{state.message}</MediaStatus>
        </div>
      )}
      {open && (
        <Lightbox items={[{ asset_id: block.content.asset_id, caption }]} index={0} onClose={() => setOpen(false)} onIndex={() => undefined} />
      )}
    </div>
  )
}

export function Caption({ children }: { children: ReactNode }) {
  const { t } = useTheme()
  return (
    <div
      style={{
        ...canvasType.small,
        color: t.textSecondary,
        padding: `12px ${geometry.captionInset}px 0`,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {children}
    </div>
  )
}
