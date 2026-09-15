'use client'

// studio/src/components/work/piece-card.tsx — one piece, on the board.
//
// Deliberately large. A piece of work is not a row in a list, and the card is
// sized so that one of them plus three quarters of the next fills the window:
// what you are looking at, and the thing you have not finished, always in the
// same glance.
//
// Inside is the person's own opening — never a summary, never a count standing
// in for the words. It fades out at the foot of the card because it continues,
// and continuing is what the card is asking you to do.

import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, fonts, radius } from '@/lib/design-tokens'
import type { TreeNode } from '@/lib/studio/node-types'
import { extentOf, previewOf } from '@/lib/studio/tree'

export function PieceCard({
  node,
  width,
  height,
  onOpen,
  onRename,
  onRemove,
  onMove,
  first,
  last,
  dimmed = false,
  targeted = false,
  disabled = false,
}: {
  node: TreeNode
  width: number
  height: number
  onOpen: (el: HTMLElement | null) => void
  onRename: (title: string) => void
  onRemove: () => void
  onMove: (delta: -1 | 1) => void
  first: boolean
  last: boolean
  /** Something else on the board is being connected and this is not part of it. */
  dimmed?: boolean
  /** Waiting to be picked as the other end of a connection. */
  targeted?: boolean
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [hover, setHover] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(node.title)
  const field = useRef<HTMLInputElement | null>(null)
  const card = useRef<HTMLDivElement | null>(null)

  useEffect(() => { if (!renaming) setDraft(node.title) }, [node.title, renaming])
  useEffect(() => { if (renaming) field.current?.focus() }, [renaming])

  const preview = previewOf(node, 1500)
  const words = extentOf(node)

  const commit = () => {
    setRenaming(false)
    const next = draft.trim()
    if (next !== node.title.trim()) onRename(next)
  }

  return (
    <div
      ref={card}
      data-hold
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', width, height, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column',
        background: t.cardBg, borderRadius: radius.card,
        border: `1px solid ${targeted ? t.tide : hover ? alpha(t.textPrimary, 0.16) : 'transparent'}`,
        boxShadow: targeted ? `0 0 0 3px ${alpha(t.tide, 0.22)}, ${t.shadow}` : t.shadow,
        opacity: dimmed ? 0.4 : 1,
        transition: 'opacity 180ms ease, border-color 160ms ease, box-shadow 160ms ease',
      }}
    >
      {/* ── the head: what it is called, and what can be done to it ─────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '22px 24px 10px', flexShrink: 0 }}>
        {renaming ? (
          <input
            ref={field}
            aria-label="the name of this piece"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setDraft(node.title); setRenaming(false) }
            }}
            style={{
              flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
              padding: 0, color: t.textPrimary,
              fontFamily: fonts.display, fontWeight: 600, fontSize: 26, lineHeight: 1.18, letterSpacing: '-0.02em',
            }}
          />
        ) : (
          <h2
            style={{
              flex: 1, minWidth: 0, margin: 0, color: node.title ? t.textPrimary : t.textMuted,
              fontFamily: fonts.display, fontWeight: 600, fontSize: 26, lineHeight: 1.18, letterSpacing: '-0.02em',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              maxHeight: '2.36em',
            }}
          >
            {node.title || 'untitled'}
          </h2>
        )}

        {!disabled && (
          <div
            style={{
              display: 'flex', gap: 2, flexShrink: 0, marginTop: 4,
              opacity: hover || renaming ? 1 : 0,
              transition: 'opacity 140ms ease',
            }}
          >
            <Act label="rename this piece" onClick={() => setRenaming(true)}>
              <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
            </Act>
            <Act label="move it earlier" onClick={() => onMove(-1)} off={first}>
              <path d="M15 5l-7 7 7 7" />
            </Act>
            <Act label="move it later" onClick={() => onMove(1)} off={last}>
              <path d="M9 5l7 7-7 7" />
            </Act>
            <Act label="delete this piece" onClick={onRemove}>
              <path d="M6 6l12 12M18 6L6 18" />
            </Act>
          </div>
        )}
      </div>

      {node.intent && (
        <p
          style={{
            ...canvasType.small, color: t.textSecondary, margin: '0 0 12px', padding: '0 24px',
            // Two lines, hard. The gap below is a margin and not padding on
            // purpose: overflow clips at the padding box, so padding here would
            // let a third, half-cut line show through over the words.
            flexShrink: 0, boxSizing: 'content-box', maxHeight: '3em',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {node.intent}
        </p>
      )}

      {/* ── the words, going on past the edge of the card ───────────────── */}
      <button
        type="button"
        aria-label={`open ${node.title || 'this piece'}`}
        onClick={() => onOpen(card.current)}
        style={{
          flex: 1, minHeight: 0, position: 'relative', width: '100%',
          // Chrome centres a button's content vertically whatever its display is;
          // the words have to start at the top of the card, so say so explicitly
          display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start',
          background: 'none', border: 'none', padding: '0 24px', textAlign: 'left',
          cursor: 'pointer', overflow: 'hidden',
          maskImage: 'linear-gradient(to bottom, #000 62%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 62%, transparent 100%)',
        }}
      >
        {preview ? (
          <p style={{ ...canvasType.body, fontSize: 15.5, lineHeight: 1.62, color: t.textPrimary, margin: 0, whiteSpace: 'pre-wrap' }}>
            {preview}
          </p>
        ) : (
          <p style={{ ...canvasType.small, color: t.textMuted, margin: 0, fontStyle: 'italic' }}>
            Nothing written here yet. Open it and start.
          </p>
        )}
      </button>

      {/* ── the foot: only what the words cannot say themselves ─────────── */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
          padding: '10px 24px 16px', ...canvasType.chip, color: t.textMuted,
        }}
      >
        <span>{words}w</span>
        {node.children.length > 0 && <span>{node.children.length} parts</span>}
        {node.stands_whole && (
          <span title="this claims to stand whole on its own" style={{ color: t.violet }}>whole</span>
        )}
        {node.status === 'done' && <span style={{ color: t.verdant }}>done</span>}
      </div>
    </div>
  )
}

function Act({
  label, onClick, off = false, children,
}: {
  label: string
  onClick: () => void
  off?: boolean
  children: React.ReactNode
}) {
  const { t } = useTheme()
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={off}
      onClick={onClick}
      style={{
        width: 26, height: 26, borderRadius: 7, padding: 0, border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent',
        color: off ? alpha(t.textPrimary, 0.18) : t.textMuted,
        cursor: off ? 'default' : 'pointer',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  )
}
