'use client'

// studio/src/components/canvas/blocks/media/settings.tsx — the right dock's settings
// for the four media types (lane E, 6.4), rendered inside the ink-glass panel with
// the Glass* primitives. Image: caption, fit, replace, full screen. Gallery:
// columns, add images, per-image captions. Recording: title, note, own-voice
// toggle (PATCH), the full transcript. Palette: the swatch editor (1–12).
//
// The dock says what is read and what is not (D-059): `the caption is read · the
// image is not`, `the note is read · the recording is not`.

import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Maximize2, Pipette, Plus, RefreshCw, X } from 'lucide-react'
import { api } from '@/lib/studio/api-client'
import { canvasType, glass, line } from '@/lib/studio/canvas-tokens'
import { useAsset, useCanvasStore, useInteractive, useStore } from '@/lib/studio/hooks'
import { commitBlockContent, IMAGE_ACCEPT, pickFiles, putAsset, uploadImage } from '@/lib/studio/media/upload'
import { formatDuration } from '@/lib/studio/media/waveform'
import type { BlockContentMap } from '@/lib/studio/types'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type { BlockOf, BlockSettingsProps } from '@/components/canvas/blocks/registry'
import { GlassButton, GlassInput, GlassTextArea, GlassToggle, IconHit, PanelHint, SegmentControl } from '@/components/canvas/chrome/panel'
import { addImagesToGallery, GALLERY_VISIBLE } from '@/components/canvas/blocks/media/gallery'
import { errorMessage } from '@/components/canvas/blocks/media/image'
import { Lightbox } from '@/components/canvas/blocks/media/lightbox'
import { DEFAULT_HEX, normaliseHex, PALETTE_MAX } from '@/components/canvas/blocks/media/palette'

const IDLE_MS = 600

/** Local draft of a text field that commits on blur and after 600 ms idle; resets when the stored value changes elsewhere. */
function useDraft(stored: string, commit: (v: string) => void): [string, (v: string) => void, () => void] {
  const [draft, setDraft] = useState(stored)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ draft, stored, commit })
  latest.current = { draft, stored, commit }

  useEffect(() => {
    setDraft(stored)
  }, [stored])

  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const { draft: d, stored: s, commit: c } = latest.current
    if (d !== s) c(d)
  }

  const change = (v: string) => {
    setDraft(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      const { stored: s, commit: c } = latest.current
      if (v !== s) c(v)
    }, IDLE_MS)
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      const { draft: d, stored: s, commit: c } = latest.current
      if (d !== s) c(d)
    },
    []
  )

  return [draft, change, flush]
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>{children}</div>
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ ...canvasType.meta, color: glass.muted }}>{children}</div>
}

// ── image ──────────────────────────────────────────────────────────────────

export function ImageSettings({ block }: BlockSettingsProps<'image'>) {
  const store = useStore()
  const interactive = useInteractive()
  const live = (useCanvasStore((s) => s.blocks.get(block.id)) as BlockOf<'image'> | undefined) ?? block
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const set = (content: BlockContentMap['image'], extra?: { h?: number }) => commitBlockContent(store, live, content, extra)
  const [caption, setCaption, flushCaption] = useDraft(live.content.caption, (v) => set({ ...live.content, caption: v }))

  const replace = async () => {
    if (!interactive || busy) return
    const [file] = await pickFiles(IMAGE_ACCEPT)
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const { asset, aspect } = await uploadImage(store, live.project_id, file)
      const current = (store.get().blocks.get(live.id) as BlockOf<'image'> | undefined) ?? live
      commitBlockContent(store, current, { ...current.content, asset_id: asset.id, aspect }, { h: Math.ceil(current.w / aspect / 8) * 8 })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Row>
        <Label>caption</Label>
        <div onBlur={flushCaption}>
          <GlassTextArea value={caption} onChange={setCaption} placeholder="a caption, if you want one" rows={2} ariaLabel="caption" />
        </div>
      </Row>
      <Row>
        <Label>fit</Label>
        <SegmentControl<'cover' | 'contain'>
          options={[
            { value: 'cover', label: 'fill' },
            { value: 'contain', label: 'whole' },
          ]}
          value={live.content.fit}
          onChange={(fit) => interactive && set({ ...live.content, fit })}
        />
      </Row>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <GlassButton small icon={<RefreshCw size={14} strokeWidth={1.5} />} onClick={() => void replace()} disabled={!interactive || busy}>
          {busy ? 'uploading' : live.content.asset_id ? 'replace' : 'choose an image'}
        </GlassButton>
        {live.content.asset_id && (
          <GlassButton small icon={<Maximize2 size={14} strokeWidth={1.5} />} onClick={() => setOpen(true)}>
            full screen
          </GlassButton>
        )}
      </div>
      {error && <PanelHint style={{ color: '#e0674a', marginBottom: 6 }}>{error}</PanelHint>}
      <PanelHint>the caption is read · the image is not</PanelHint>
      {open && live.content.asset_id && (
        <Lightbox items={[{ asset_id: live.content.asset_id, caption: live.content.caption }]} index={0} onClose={() => setOpen(false)} onIndex={() => undefined} />
      )}
    </div>
  )
}

// ── gallery ────────────────────────────────────────────────────────────────

export function GallerySettings({ block }: BlockSettingsProps<'gallery'>) {
  const store = useStore()
  const interactive = useInteractive()
  const live = (useCanvasStore((s) => s.blocks.get(block.id)) as BlockOf<'gallery'> | undefined) ?? block
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)

  const set = (content: BlockContentMap['gallery']) => commitBlockContent(store, live, content)

  const add = async () => {
    if (!interactive || busy) return
    const files = await pickFiles(IMAGE_ACCEPT, true)
    if (files.length === 0) return
    setError(null)
    setBusy('adding')
    try {
      await addImagesToGallery(store, live, files, (done, total) => setBusy(total > 1 && done < total ? `adding ${done + 1} of ${total}` : 'adding'))
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const items = live.content.items
  const remove = (i: number) => set({ ...live.content, items: items.filter((_, j) => j !== i) })
  const caption = (i: number, v: string) => set({ ...live.content, items: items.map((it, j) => (j === i ? { ...it, caption: v } : it)) })

  return (
    <div>
      <Row>
        <Label>columns</Label>
        <SegmentControl<'2' | '3'>
          options={[
            { value: '2', label: '2' },
            { value: '3', label: '3' },
          ]}
          value={String(live.content.columns) as '2' | '3'}
          onChange={(v) => interactive && set({ ...live.content, columns: v === '3' ? 3 : 2 })}
        />
      </Row>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <GlassButton small icon={<ImagePlus size={14} strokeWidth={1.5} />} onClick={() => void add()} disabled={!interactive || !!busy}>
          {busy ?? 'add images'}
        </GlassButton>
        {items.length > 0 && (
          <GlassButton small icon={<Maximize2 size={14} strokeWidth={1.5} />} onClick={() => setOpen(0)}>
            full screen
          </GlassButton>
        )}
      </div>
      {error && <PanelHint style={{ color: '#e0674a', marginBottom: 6 }}>{error}</PanelHint>}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8, maxHeight: 280, overflowY: 'auto' }}>
          {items.map((item, i) => (
            <GalleryItemRow
              key={`${item.asset_id}-${i}`}
              assetId={item.asset_id}
              caption={item.caption}
              hidden={i >= GALLERY_VISIBLE}
              disabled={!interactive}
              onCaption={(v) => caption(i, v)}
              onRemove={() => remove(i)}
              onOpen={() => setOpen(i)}
            />
          ))}
        </div>
      )}
      <PanelHint>the captions are read · the images are not</PanelHint>
      {open !== null && (
        <Lightbox items={items.map((i) => ({ asset_id: i.asset_id, caption: i.caption }))} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />
      )}
    </div>
  )
}

function GalleryItemRow({
  assetId,
  caption,
  hidden,
  disabled,
  onCaption,
  onRemove,
  onOpen,
}: {
  assetId: string
  caption: string
  hidden: boolean
  disabled: boolean
  onCaption: (v: string) => void
  onRemove: () => void
  onOpen: () => void
}) {
  const asset = useAsset(assetId)
  const [draft, setDraft, flush] = useDraft(caption, onCaption)
  const src = asset?.thumb_url ?? asset?.url ?? null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: hidden ? 0.5 : 1 }}>
      <button
        type="button"
        aria-label="full screen"
        onClick={onOpen}
        style={{
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: 6,
          border: `1px solid ${line.chromeSoft}`,
          padding: 0,
          overflow: 'hidden',
          background: 'rgba(236,233,226,0.06)',
          cursor: 'pointer',
        }}
      >
        {src && <img src={src} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }} onBlur={flush}>
        <GlassInput value={draft} onChange={setDraft} onCommit={(v) => { setDraft(v); flush() }} placeholder="caption" ariaLabel="caption" disabled={disabled} />
      </div>
      <IconHit ariaLabel="remove" tip="remove" tipSide="left" icon={<X size={14} strokeWidth={1.5} />} onClick={onRemove} disabled={disabled} size={24} />
    </div>
  )
}

// ── recording ──────────────────────────────────────────────────────────────

export function RecordingSettings({ block }: BlockSettingsProps<'recording'>) {
  const store = useStore()
  const interactive = useInteractive()
  const confirm = useConfirm()
  const live = (useCanvasStore((s) => s.blocks.get(block.id)) as BlockOf<'recording'> | undefined) ?? block
  const asset = useAsset(live.content.asset_id || null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (content: BlockContentMap['recording']) => commitBlockContent(store, live, content)
  const [title, setTitle, flushTitle] = useDraft(live.content.title, (v) => set({ ...live.content, title: v.slice(0, 120) }))
  const [note, setNote, flushNote] = useDraft(live.content.note, (v) => set({ ...live.content, note: v }))

  const setOwnVoice = async (v: boolean) => {
    if (!asset || busy) return
    if (!v && asset.transcript) {
      const ok = await confirm({
        title: 'keep it as a reference?',
        body: 'a reference is not listened to, so the transcript goes with it.',
        confirmLabel: 'make it a reference',
        cancelLabel: 'not now',
      })
      if (!ok) return
    }
    setBusy(true)
    setError(null)
    try {
      const { asset: next } = await api.assets.patch(asset.id, { own_voice: v })
      putAsset(store, { ...asset, ...next, url: 'url' in next ? next.url : asset.url, thumb_url: 'thumb_url' in next ? next.thumb_url : asset.thumb_url })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Row>
        <Label>title</Label>
        <div onBlur={flushTitle}>
          <GlassInput value={title} onChange={setTitle} onCommit={(v) => { setTitle(v); flushTitle() }} placeholder="what this is" ariaLabel="title" disabled={!interactive} />
        </div>
      </Row>
      <Row>
        <Label>note</Label>
        <div onBlur={flushNote}>
          <GlassTextArea value={note} onChange={setNote} placeholder="what you want to remember about it" rows={3} ariaLabel="note" />
        </div>
      </Row>
      {asset ? (
        <>
          <div style={{ margin: '0 -12px 6px' }}>
            <GlassToggle label="my own voice" checked={asset.own_voice} onChange={(v) => void setOwnVoice(v)} disabled={!interactive || busy} />
          </div>
          <PanelHint style={{ marginBottom: 8 }}>
            {formatDuration(asset.duration_s)}
            {' · '}
            {asset.own_voice ? 'transcribed as your words' : 'a reference, not listened to'}
          </PanelHint>
          {asset.own_voice && (
            <Row>
              <Label>transcript</Label>
              <div
                style={{
                  ...canvasType.small,
                  color: asset.transcript ? glass.text : glass.muted,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 220,
                  overflowY: 'auto',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${line.chromeSoft}`,
                }}
              >
                {asset.transcript || 'nothing was heard'}
              </div>
            </Row>
          )}
        </>
      ) : (
        <PanelHint style={{ marginBottom: 8 }}>{live.content.asset_id ? 'this recording is not available' : 'record a take on the block'}</PanelHint>
      )}
      {error && <PanelHint style={{ color: '#e0674a', marginBottom: 6 }}>{error}</PanelHint>}
      <PanelHint>the note is read · the recording is not{asset?.own_voice ? ' · your own voice is read as your words' : ''}</PanelHint>
    </div>
  )
}

// ── palette ────────────────────────────────────────────────────────────────

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>
}

function eyeDropper(): (new () => EyeDropperLike) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { EyeDropper?: new () => EyeDropperLike }
  return w.EyeDropper ?? null
}

export function PaletteSettings({ block }: BlockSettingsProps<'palette'>) {
  const store = useStore()
  const interactive = useInteractive()
  const live = (useCanvasStore((s) => s.blocks.get(block.id)) as BlockOf<'palette'> | undefined) ?? block
  const swatches = live.content.swatches
  const set = (next: BlockContentMap['palette']['swatches']) => commitBlockContent(store, live, { swatches: next.slice(0, PALETTE_MAX) })
  const dropper = eyeDropper()

  const add = (hex = DEFAULT_HEX) => {
    if (swatches.length >= PALETTE_MAX) return
    set([...swatches, { hex, name: null }])
  }
  const pick = async () => {
    if (!dropper || swatches.length >= PALETTE_MAX) return
    try {
      const { sRGBHex } = await new dropper().open()
      const hex = normaliseHex(sRGBHex)
      if (hex) add(hex)
    } catch {
      // dismissed
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {swatches.map((s, i) => (
          <SwatchRow
            key={i}
            hex={s.hex}
            name={s.name ?? ''}
            disabled={!interactive}
            onHex={(hex) => set(swatches.map((x, j) => (j === i ? { ...x, hex } : x)))}
            onName={(name) => set(swatches.map((x, j) => (j === i ? { ...x, name: name.trim() ? name.trim().slice(0, 40) : null } : x)))}
            onRemove={() => set(swatches.filter((_, j) => j !== i))}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <GlassButton small icon={<Plus size={14} strokeWidth={1.5} />} onClick={() => add()} disabled={!interactive || swatches.length >= PALETTE_MAX}>
          add a colour
        </GlassButton>
        {dropper && (
          <GlassButton small icon={<Pipette size={14} strokeWidth={1.5} />} onClick={() => void pick()} disabled={!interactive || swatches.length >= PALETTE_MAX}>
            pick from the screen
          </GlassButton>
        )}
      </div>
      <PanelHint>{swatches.length >= PALETTE_MAX ? `${PALETTE_MAX} is the most a palette holds` : 'click a swatch on the block to copy its hex'}</PanelHint>
    </div>
  )
}

function SwatchRow({
  hex,
  name,
  disabled,
  onHex,
  onName,
  onRemove,
}: {
  hex: string
  name: string
  disabled: boolean
  onHex: (hex: string) => void
  onName: (name: string) => void
  onRemove: () => void
}) {
  const [hexDraft, setHexDraft, flushHex] = useDraft(hex, (v) => {
    const n = normaliseHex(v)
    if (n) onHex(n)
  })
  const [nameDraft, setNameDraft, flushName] = useDraft(name, onName)
  const valid = normaliseHex(hexDraft) !== null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label
        aria-label="colour"
        style={{
          position: 'relative',
          width: 24,
          height: 24,
          flexShrink: 0,
          borderRadius: 6,
          backgroundColor: normaliseHex(hexDraft) ?? hex,
          boxShadow: `inset 0 0 0 1px ${line.chrome}`,
          cursor: disabled ? 'default' : 'pointer',
          overflow: 'hidden',
        }}
      >
        <input
          type="color"
          value={normaliseHex(hexDraft) ?? hex}
          disabled={disabled}
          onChange={(e) => {
            const n = normaliseHex(e.target.value)
            if (n) {
              setHexDraft(n)
              onHex(n)
            }
          }}
          style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'inherit' }}
        />
      </label>
      <div style={{ width: 92, flexShrink: 0 }} onBlur={flushHex}>
        <GlassInput
          value={hexDraft}
          onChange={setHexDraft}
          onCommit={(v) => { setHexDraft(v); flushHex() }}
          mono
          placeholder="#hex"
          ariaLabel="hex"
          disabled={disabled}
          style={{ borderColor: valid ? undefined : 'rgba(224,103,74,0.6)' }}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }} onBlur={flushName}>
        <GlassInput value={nameDraft} onChange={setNameDraft} onCommit={(v) => { setNameDraft(v); flushName() }} placeholder="name" ariaLabel="name" disabled={disabled} />
      </div>
      <IconHit ariaLabel="remove" tip="remove" tipSide="left" icon={<X size={14} strokeWidth={1.5} />} onClick={onRemove} disabled={disabled} size={24} />
    </div>
  )
}
