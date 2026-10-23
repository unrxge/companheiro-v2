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
import { useNoHover, usePhone } from '@/lib/use-phone'
import { StageRibbon } from '@/components/widgets/stage-ribbon'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, fonts, journeyStepFromStage, radius } from '@/lib/design-tokens'
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
  compact = false,
  dimmed = false,
  targeted = false,
  disabled = false,
  showStage = false,
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
  /** A narrow card (a project of four pieces or more): tighter margins, a smaller title, shorter labels. */
  compact?: boolean
  /** Something else on the board is being connected and this is not part of it. */
  dimmed?: boolean
  /** Waiting to be picked as the other end of a connection. */
  targeted?: boolean
  disabled?: boolean
  /** One of several pieces in a project: where this piece is on its journey, as bars only. */
  showStage?: boolean
}) {
  const { t } = useTheme()
  const [hover, setHover] = useState(false)
  const noHover = useNoHover()
  const phone = usePhone()
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(node.title)
  const field = useRef<HTMLInputElement | null>(null)
  const card = useRef<HTMLDivElement | null>(null)

  useEffect(() => { if (!renaming) setDraft(node.title) }, [node.title, renaming])
  useEffect(() => { if (renaming) field.current?.focus() }, [renaming])

  const preview = previewOf(node, 1500)
  const words = extentOf(node)
  // The same words /api/studio/projects uses for a project of one piece.
  const step = journeyStepFromStage(
    node.reflected ? 'posted'
      : node.status === 'done' ? 'executing'
      : node.short_form_script ? 'translating'
      : node.status === 'drafted' ? 'writing'
      : 'conceptualising',
  )
  // On a phone the bars are all the foot holds.
  const barsOnly = showStage && phone
  // Everything that has a size of its own comes down together, so a narrow
  // card is the same card smaller and not the wide one squeezed.
  const pad = compact ? 16 : 24
  const titleSize = compact ? 20 : 26

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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: compact ? '16px 16px 8px' : '22px 24px 10px', flexShrink: 0 }}>
        {renaming ? (
          <input
            ref={field}
            aria-label="The name of this piece"
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
              fontFamily: fonts.display, fontWeight: 600, fontSize: titleSize, lineHeight: 1.18, letterSpacing: '-0.02em',
            }}
          />
        ) : (
          <h2
            style={{
              flex: 1, minWidth: 0, margin: 0, color: node.title ? t.textPrimary : t.textMuted,
              fontFamily: fonts.display, fontWeight: 600, fontSize: titleSize, lineHeight: 1.18, letterSpacing: '-0.02em',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
              maxHeight: '2.36em',
            }}
          >
            {node.title || 'Untitled'}
          </h2>
        )}

        {!disabled && (
          <div
            style={{
              display: 'flex', gap: 2, flexShrink: 0, marginTop: 4,
              // Unseen, they must not be pressable either (a touch screen has no
              // hover to bring them out, so there they are simply shown).
              opacity: hover || renaming || noHover ? 1 : 0,
              pointerEvents: hover || renaming || noHover ? 'auto' : 'none',
              transition: 'opacity 140ms ease',
            }}
          >
            <Act label="Rename this piece" onClick={() => setRenaming(true)}>
              <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
            </Act>
            <Act label="Move it earlier" onClick={() => onMove(-1)} off={first}>
              <path d="M15 5l-7 7 7 7" />
            </Act>
            <Act label="Move it later" onClick={() => onMove(1)} off={last}>
              <path d="M9 5l7 7-7 7" />
            </Act>
            <Act label="Delete this piece" onClick={onRemove}>
              <path d="M6 6l12 12M18 6L6 18" />
            </Act>
          </div>
        )}
      </div>

      {node.intent && (
        <p
          style={{
            ...canvasType.small, color: t.textSecondary, margin: '0 0 10px', padding: `0 ${pad}px`,
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
        aria-label={`Open ${node.title || 'this piece'}`}
        onClick={() => onOpen(card.current)}
        style={{
          flex: 1, minHeight: 0, position: 'relative', width: '100%',
          // Chrome centres a button's content vertically whatever its display is;
          // the words have to start at the top of the card, so say so explicitly
          display: 'flex', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start',
          background: 'none', border: 'none', padding: `0 ${pad}px`, textAlign: 'left',
          cursor: 'pointer', overflow: 'hidden',
          maskImage: 'linear-gradient(to bottom, #000 62%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, #000 62%, transparent 100%)',
        }}
      >
        {preview ? (
          <p style={{ ...canvasType.body, fontSize: compact ? 14 : 15.5, lineHeight: 1.6, color: t.textPrimary, margin: 0, whiteSpace: 'pre-wrap' }}>
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
          display: 'flex', alignItems: 'center', gap: compact ? 8 : 12, flexShrink: 0,
          padding: compact ? `8px ${pad}px 14px` : '10px 24px 16px', ...canvasType.chip, color: t.textMuted,
        }}
      >
        {showStage && (
          <div style={{ flex: 1, minWidth: 60 }}>
            <StageRibbon step={step} compact />
          </div>
        )}
        {!barsOnly && <span>{compact ? words.toLocaleString() : `${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`}</span>}
        {!showStage && node.children.length > 0 && <span>{node.children.length} parts</span>}
        {!barsOnly && node.status === 'done' && <span style={{ color: t.verdant }}>Done</span>}

        {/* Begin/Resume writing: the plain way into the piece, kept on the right so it never competes with the counts. */}
        {!barsOnly && !node.reflected && <button
          type="button"
          data-hold
          onClick={(e) => { e.stopPropagation(); onOpen(card.current) }}
          aria-label={`${words > 0 ? 'Resume' : 'Begin'} writing ${node.title || 'this piece'}`}
          style={{
            marginLeft: showStage ? 0 : 'auto', flexShrink: 0, ...canvasType.chip, fontSize: 12, fontWeight: 600,
            padding: compact ? '6px 10px' : '6px 12px', borderRadius: radius.field, cursor: 'pointer',
            border: `1px solid ${alpha(t.tide, 0.4)}`, background: alpha(t.tide, 0.1), color: t.tide,
          }}
        >
          {compact ? (words > 0 ? 'Resume' : 'Begin') : (words > 0 ? 'Resume writing' : 'Begin writing')}
        </button>}
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
