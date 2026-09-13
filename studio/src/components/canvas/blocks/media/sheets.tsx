'use client'

// studio/src/components/canvas/blocks/media/sheets.tsx — the phone bottom-sheet
// bodies for the four media types (lane E, D-040): the expanded readable content.
// Image → the picture and its caption (tap → lightbox); gallery → a 2-column grid
// (tap → lightbox); recording → the player with the full transcript or note;
// palette → the swatches (tap copies). View-only: nothing here uploads or edits.

import { useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType, line, radii } from '@/lib/studio/canvas-tokens'
import { useAsset } from '@/lib/studio/hooks'
import { formatDuration } from '@/lib/studio/media/waveform'
import type { GalleryItem } from '@/lib/studio/types'
import type { BlockSheetProps } from '@/components/canvas/blocks/registry'
import { Caption, MediaStatus, useSignedSrc } from '@/components/canvas/blocks/media/image'
import { Lightbox } from '@/components/canvas/blocks/media/lightbox'
import { Swatch, useCopiedHex } from '@/components/canvas/blocks/media/palette'
import { RoundButton, TranscriptPanel, useAudioPlayer, Waveform } from '@/components/canvas/blocks/media/recording'

function SheetTitle({ children }: { children: React.ReactNode }) {
  const { t } = useTheme()
  return <div style={{ ...canvasType.title, color: t.textPrimary, marginBottom: 12 }}>{children}</div>
}

// ── image ──────────────────────────────────────────────────────────────────

export function ImageSheet({ block }: BlockSheetProps<'image'>) {
  const { t } = useTheme()
  const asset = useAsset(block.content.asset_id || null)
  const { src, onError } = useSignedSrc(asset, true)
  const [open, setOpen] = useState(false)
  const caption = block.content.caption.trim()
  const aspect = block.content.aspect > 0 ? block.content.aspect : 4 / 3

  if (!asset || !src) {
    return <MediaStatus>{block.content.asset_id ? 'this image is not available' : 'no image yet'}</MediaStatus>
  }
  return (
    <div>
      <div
        role="button"
        aria-label="full screen"
        onClick={() => setOpen(true)}
        style={{ position: 'relative', width: '100%', aspectRatio: String(aspect), borderRadius: radii.media, overflow: 'hidden', backgroundColor: t.cardBgInner }}
      >
        <img key={src} src={src} alt={caption} decoding="async" onError={onError} style={{ display: 'block', width: '100%', height: '100%', objectFit: block.content.fit }} />
        <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: radii.media, boxShadow: `inset 0 0 0 1px ${line.onPaper(t)}`, pointerEvents: 'none' }} />
      </div>
      {caption && <Caption>{caption}</Caption>}
      {open && <Lightbox items={[{ asset_id: asset.id, caption }]} index={0} onClose={() => setOpen(false)} onIndex={() => undefined} />}
    </div>
  )
}

// ── gallery ────────────────────────────────────────────────────────────────

export function GallerySheet({ block }: BlockSheetProps<'gallery'>) {
  const [open, setOpen] = useState<number | null>(null)
  const items = block.content.items
  if (items.length === 0) return <MediaStatus>no images yet</MediaStatus>
  return (
    <div>
      <div style={{ columnCount: 2, columnGap: 8 }}>
        {items.map((item, i) => (
          <SheetTile key={`${item.asset_id}-${i}`} item={item} onOpen={() => setOpen(i)} />
        ))}
      </div>
      {open !== null && (
        <Lightbox items={items.map((i) => ({ asset_id: i.asset_id, caption: i.caption }))} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
      )}
    </div>
  )
}

function SheetTile({ item, onOpen }: { item: GalleryItem; onOpen: () => void }) {
  const { t } = useTheme()
  const asset = useAsset(item.asset_id)
  const { src, onError } = useSignedSrc(asset, false)
  const aspect = item.aspect > 0 ? item.aspect : 1
  return (
    <div
      role="button"
      aria-label={item.caption.trim() || 'image'}
      onClick={onOpen}
      style={{ position: 'relative', breakInside: 'avoid', marginBottom: 8, borderRadius: radii.tile, overflow: 'hidden', aspectRatio: String(aspect), backgroundColor: t.cardBgInner }}
    >
      {src && <img key={src} src={src} alt={item.caption} loading="lazy" decoding="async" onError={onError} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />}
      <div aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: radii.tile, boxShadow: `inset 0 0 0 1px ${line.onPaper(t)}`, pointerEvents: 'none' }} />
    </div>
  )
}

// ── recording ──────────────────────────────────────────────────────────────

export function RecordingSheet({ block }: BlockSheetProps<'recording'>) {
  const { t } = useTheme()
  const asset = useAsset(block.content.asset_id || null)
  const player = useAudioPlayer(asset?.url ?? null, asset?.duration_s)
  const title = block.content.title.trim()

  if (!asset) {
    return (
      <div>
        <SheetTitle>{title || 'recording'}</SheetTitle>
        <MediaStatus>{block.content.asset_id ? 'this recording is not available' : 'nothing recorded yet'}</MediaStatus>
      </div>
    )
  }
  const duration = player.duration || asset.duration_s || 0
  const played = duration > 0 ? Math.min(1, player.time / duration) : 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <RoundButton onClick={player.toggle} ariaLabel={player.playing ? 'pause' : 'play'} size={40}>
          {player.playing ? <Pause size={16} strokeWidth={1.5} /> : <Play size={16} strokeWidth={1.5} style={{ marginLeft: 1 }} />}
        </RoundButton>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...canvasType.title, color: title ? t.textPrimary : t.textMuted }}>{title || 'recording'}</div>
          <div style={{ ...canvasType.meta, color: t.textMuted, marginTop: 2 }}>
            {formatDuration(player.time)} / {formatDuration(duration)}
          </div>
        </div>
      </div>
      <Waveform envelope={asset.envelope} played={played} onSeek={player.seek} height={40} />
      <TranscriptPanel asset={asset} note={block.content.note} />
    </div>
  )
}

// ── palette ────────────────────────────────────────────────────────────────

export function PaletteSheet({ block }: BlockSheetProps<'palette'>) {
  const { copied, copy } = useCopiedHex()
  const swatches = block.content.swatches
  if (swatches.length === 0) return <MediaStatus>no colours yet</MediaStatus>
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      {swatches.map((s, i) => (
        <Swatch key={`${s.hex}-${i}`} hex={s.hex} name={s.name} size={48} copied={copied === s.hex} onCopy={copy} />
      ))}
    </div>
  )
}
