'use client'

// studio/src/components/canvas/blocks/media/gallery.tsx — the gallery block (lane E,
// 6.2): a fixed-size mood board. CSS columns (2 or 3) with 8 px gaps, tiles at
// radius 8 with a hairline inset, captions on hover (desktop), a mono `+n` tile
// after 24, a corner `full screen` action that opens the lightbox. Empty →
// `add images`. Nothing here ever passes an asset id or url to a model (D-059).

import { useEffect, useRef, useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { alpha } from '@/lib/design-tokens'
import { canvasType, line, motionSpec, radii } from '@/lib/studio/canvas-tokens'
import { useAsset, useInteractive, useStore } from '@/lib/studio/hooks'
import { commitBlockContent, IMAGE_ACCEPT, pickFiles, uploadImage } from '@/lib/studio/media/upload'
import type { GalleryItem } from '@/lib/studio/types'
import type { BlockOf, BlockRendererProps } from '@/components/canvas/blocks/registry'
import { Lightbox } from '@/components/canvas/blocks/media/lightbox'
import { ChipButton, EmptyMediaBox, errorMessage, MediaStatus, useFullRes, useSignedSrc, type UploadState } from '@/components/canvas/blocks/media/image'

export const GALLERY_VISIBLE = 24
const GAP = 8

/** Upload several picked files one after another and append them to the gallery. Shared with the dock settings. */
export async function addImagesToGallery(
  store: ReturnType<typeof useStore>,
  block: BlockOf<'gallery'>,
  files: File[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  let done = 0
  for (const file of files) {
    onProgress?.(done, files.length)
    const { asset, aspect } = await uploadImage(store, block.project_id, file)
    const live = (store.get().blocks.get(block.id) as BlockOf<'gallery'> | undefined) ?? block
    const item: GalleryItem = { asset_id: asset.id, caption: '', aspect }
    commitBlockContent(store, live, { ...live.content, items: [...live.content.items, item] })
    done++
  }
  onProgress?.(done, files.length)
}

export function GalleryBlock({ block, selected, phone }: BlockRendererProps<'gallery'>) {
  const { t } = useTheme()
  const store = useStore()
  const interactive = useInteractive()
  const [state, setState] = useState<UploadState>({ kind: 'idle' })
  const [hover, setHover] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const items = block.content.items
  const columns = block.content.columns === 3 ? 3 : 2
  const tileW = (block.w - GAP * (columns - 1)) / columns
  const full = useFullRes(tileW)

  const add = async () => {
    if (!interactive || state.kind === 'busy') return
    const files = await pickFiles(IMAGE_ACCEPT, true)
    if (files.length === 0) return
    setState({ kind: 'busy', label: files.length === 1 ? 'adding' : `adding 1 of ${files.length}` })
    try {
      await addImagesToGallery(store, block, files, (done, total) => {
        if (alive.current && done < total) setState({ kind: 'busy', label: total === 1 ? 'adding' : `adding ${done + 1} of ${total}` })
      })
      if (alive.current) setState({ kind: 'idle' })
    } catch (e) {
      if (alive.current) setState({ kind: 'error', message: errorMessage(e) })
    }
  }

  const visible = items.slice(0, GALLERY_VISIBLE)
  const more = items.length - visible.length
  const canHover = !phone && interactive

  if (items.length === 0) {
    return (
      <EmptyMediaBox height={block.h}>
        {state.kind === 'busy' ? (
          <MediaStatus>{state.label}</MediaStatus>
        ) : interactive && !phone ? (
          <ChipButton onClick={() => void add()}>add images</ChipButton>
        ) : (
          <MediaStatus>no images yet</MediaStatus>
        )}
        {state.kind === 'error' && <MediaStatus tone="ember">{state.message}</MediaStatus>}
      </EmptyMediaBox>
    )
  }

  return (
    <div
      onPointerEnter={phone ? undefined : () => setHover(true)}
      onPointerLeave={phone ? undefined : () => setHover(false)}
      style={{ position: 'relative', width: '100%', height: block.h, overflow: 'hidden', borderRadius: radii.media }}
    >
      <div style={{ columnCount: columns, columnGap: GAP, columnFill: 'balance' }}>
        {visible.map((item, i) => (
          <Tile
            key={`${item.asset_id}-${i}`}
            item={item}
            full={full}
            hoverable={canHover}
            onOpen={phone ? undefined : () => setOpen(i)}
          />
        ))}
        {more > 0 && (
          <div
            data-no-drag
            role="button"
            aria-label={`${more} more`}
            onClick={(e) => {
              e.stopPropagation()
              if (!phone) setOpen(GALLERY_VISIBLE)
            }}
            style={{
              breakInside: 'avoid',
              marginBottom: GAP,
              aspectRatio: '1',
              borderRadius: radii.tile,
              backgroundColor: t.cardBgInner,
              boxShadow: `inset 0 0 0 1px ${line.onPaper(t)}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: phone ? 'default' : 'pointer',
            }}
          >
            <span style={{ ...canvasType.meta, color: t.textMuted }}>+{more}</span>
          </div>
        )}
      </div>

      {!phone && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            gap: 6,
            opacity: hover || selected ? 1 : 0,
            transition: `opacity ${motionSpec.hoverMs}ms ease`,
            pointerEvents: hover || selected ? 'auto' : 'none',
          }}
        >
          {interactive && state.kind !== 'busy' && <ChipButton onClick={() => void add()}>add images</ChipButton>}
          <ChipButton onClick={() => setOpen(0)} icon={<Maximize2 size={12} strokeWidth={1.5} />} ariaLabel="full screen">
            full screen
          </ChipButton>
        </div>
      )}

      {(state.kind === 'busy' || state.kind === 'error') && (
        <div
          style={{
            position: 'absolute',
            left: 8,
            bottom: 8,
            padding: '4px 8px',
            borderRadius: 6,
            backgroundColor: alpha(t.containerBg, 0.92),
          }}
        >
          <MediaStatus tone={state.kind === 'error' ? 'ember' : 'muted'}>{state.kind === 'busy' ? state.label : state.message}</MediaStatus>
        </div>
      )}

      {open !== null && (
        <Lightbox
          items={items.map((i) => ({ asset_id: i.asset_id, caption: i.caption }))}
          index={open}
          onClose={() => setOpen(null)}
          onIndex={setOpen}
        />
      )}
    </div>
  )
}

function Tile({ item, full, hoverable, onOpen }: { item: GalleryItem; full: boolean; hoverable: boolean; onOpen?: () => void }) {
  const { t } = useTheme()
  const asset = useAsset(item.asset_id)
  const { src, onError } = useSignedSrc(asset, full)
  const [hover, setHover] = useState(false)
  const caption = item.caption.trim()
  const aspect = item.aspect > 0 ? item.aspect : 1
  return (
    <div
      onPointerEnter={hoverable ? () => setHover(true) : undefined}
      onPointerLeave={hoverable ? () => setHover(false) : undefined}
      onDoubleClick={onOpen ? (e) => {
        e.stopPropagation()
        onOpen()
      } : undefined}
      style={{
        position: 'relative',
        breakInside: 'avoid',
        marginBottom: GAP,
        borderRadius: radii.tile,
        overflow: 'hidden',
        aspectRatio: String(aspect),
        backgroundColor: t.cardBgInner,
      }}
    >
      {src && asset ? (
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
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none' }}
        />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ ...canvasType.meta, color: t.textMuted }}>not available</span>
        </div>
      )}
      <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: radii.tile, boxShadow: `inset 0 0 0 1px ${line.onPaper(t)}`, pointerEvents: 'none' }} />
      {caption && hoverable && (
        <div
          style={{
            position: 'absolute',
            left: 6,
            right: 6,
            bottom: 6,
            padding: '4px 8px',
            borderRadius: 6,
            backgroundColor: alpha(t.containerBg, 0.92),
            color: t.textPrimary,
            ...canvasType.small,
            fontSize: 12,
            lineHeight: 1.35,
            opacity: hover ? 1 : 0,
            transition: `opacity ${motionSpec.hoverMs}ms ease`,
            pointerEvents: 'none',
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
          }}
        >
          {caption}
        </div>
      )}
    </div>
  )
}
