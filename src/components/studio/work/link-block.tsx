'use client'

// ── a link on the canvas ────────────────────────────────────────────────────
//
// An address on the web, kept beside the work. A video, a song or a picture
// from a known place plays inside Companheiro, in a player over the canvas;
// anything else opens in a new tab. Which is which is `embedFor()`.

import { useMemo, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { embedFor, type Embed } from '@/lib/studio/embed'
import type { BoardItem, BoardItemContent } from '@/lib/studio/board-items'


function Glyph({ kind }: { kind: Embed['kind'] }) {
  const p = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  if (kind === 'video') return <svg {...p}><rect x="3" y="5.5" width="13" height="13" rx="2" /><path d="M16 10l5-3v10l-5-3" /></svg>
  if (kind === 'audio') return <svg {...p}><path d="M9 18V6l11-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></svg>
  if (kind === 'image') return <svg {...p}><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" /></svg>
  return <svg {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
}

export function LinkBlock({ item, disabled, onContent }: {
  item: BoardItem
  disabled: boolean
  onContent: (content: BoardItemContent) => void
}) {
  const { t } = useTheme()
  const [open, setOpen] = useState(false)
  const url = item.content.url ?? ''
  const e = useMemo(() => embedFor(url), [url])
  const name = item.content.title?.trim() || e.host || 'A link'
  const plays = e.kind !== 'page' && !!e.src
  const verb = e.kind === 'video' ? 'Play' : e.kind === 'audio' ? 'Listen' : e.kind === 'image' ? 'View' : 'Open'

  const act = (ev: React.MouseEvent) => {
    ev.stopPropagation()
    if (plays) setOpen(true)
    else if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        type="button"
        onClick={act}
        aria-label={`${verb}: ${name}`}
        style={{
          position: 'relative', display: 'block', width: '100%', aspectRatio: e.kind === 'page' ? '3 / 1' : '16 / 9', padding: 0, border: 'none', borderRadius: radius.field, overflow: 'hidden',
          cursor: url ? 'pointer' : 'default',
          background: e.thumb
            ? `center / cover no-repeat url("${e.thumb.replace(/"/g, '%22')}"), ${alpha(t.textPrimary, 0.06)}`
            : `radial-gradient(circle at 30% 20%, ${alpha(t.textPrimary, 0.12)}, ${alpha(t.textPrimary, 0.03)} 70%)`,
          color: t.textPrimary,
        }}
      >
        {!e.thumb && (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textSecondary }}>
            <Glyph kind={e.kind} />
          </span>
        )}
        <span
          style={{
            position: 'absolute', right: 10, bottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999,
            ...canvasType.chip, fontWeight: 600, background: 'rgba(13,12,11,0.78)', color: '#e8e6e0', backdropFilter: 'blur(8px)',
          }}
        >
          {plays ? (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.5v15l13-7.5z" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden><path d="M7 17L17 7M9 7h8v8" /></svg>
          )}
          {verb}
        </span>
      </button>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...canvasType.small, fontSize: 13, fontWeight: 600, color: t.textPrimary, overflowWrap: 'anywhere' }} title={name}>{name}</div>
        <a
          href={url || undefined}
          target="_blank"
          rel="noopener noreferrer"
          draggable={false}
          onClick={(ev) => ev.stopPropagation()}
          style={{ ...canvasType.chip, color: t.textMuted, textDecoration: 'none', display: 'block', overflowWrap: 'anywhere' }}
        >
          {e.host || url} ↗
        </a>
      </div>

      {open && plays && e.src && (
        <span onPointerDown={(ev) => ev.stopPropagation()} onClick={(ev) => ev.stopPropagation()} onWheel={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
          <ModalDialog onClose={() => setOpen(false)} title={name} subtitle={<a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{e.host} ↗</a>} maxWidth={e.ratio < 1 ? '440px' : '960px'}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {e.media && e.kind === 'video' && (
                <video src={e.src} controls autoPlay playsInline style={{ width: '100%', maxHeight: '70vh', borderRadius: radius.field, background: '#000' }} />
              )}
              {e.media && e.kind === 'audio' && <audio src={e.src} controls autoPlay style={{ width: '100%' }} />}
              {e.media && e.kind === 'image' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.src} alt={name} style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain', borderRadius: radius.field }} />
              )}
              {!e.media && (
                <div style={{ position: 'relative', width: '100%', aspectRatio: String(e.ratio), maxHeight: '75vh', borderRadius: radius.field, overflow: 'hidden', background: '#000' }}>
                  <iframe
                    src={e.src}
                    title={name}
                    allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
                  />
                </div>
              )}
              {!disabled && (
                <input
                  aria-label="Name this link"
                  defaultValue={item.content.title ?? ''}
                  placeholder="Name it (optional)"
                  maxLength={120}
                  onBlur={(ev) => { const v = ev.target.value.replace(/\s+/g, ' ').trim(); if (v !== (item.content.title ?? '')) onContent({ title: v }) }}
                  onKeyDown={(ev) => { if (ev.key === 'Enter') ev.currentTarget.blur() }}
                  style={{
                    ...canvasType.small, fontSize: 14, width: '100%', boxSizing: 'border-box', color: t.textPrimary, background: 'transparent',
                    border: `1px dashed ${alpha(t.textPrimary, 0.18)}`, borderRadius: radius.field, padding: '8px 12px', outline: 'none', fontFamily: 'inherit',
                  }}
                />
              )}
            </div>
          </ModalDialog>
        </span>
      )}
    </div>
  )
}
