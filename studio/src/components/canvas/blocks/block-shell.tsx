'use client'

// studio/src/components/canvas/blocks/block-shell.tsx — the object chrome every
// block renders inside (6.3, 6.6; lane A). One padding, one radius, no border at
// rest. Paper: padding 16, radius 12, cardBg. Paperless: nothing. Media: padding 0.
// Draws: the eyebrow row, the hover ring, the struck state (ember midline, dim,
// sentence under), the arrival state (dashed tide outline, pulsing marker,
// place/dismiss footer), the locked glyph and the chip at k < 0.3.
//
// Layout contract for lane B's BlockView: the shell's root is `position: relative`
// and sized by its parent's width; `[data-measure]` is the inner content node the
// ResizeObserver should watch (D-015) — the struck sentence sits below it in flow
// and is not part of the measured height. The arrival marker sits at (−4, −4), so
// the positioned wrapper must not use `contain: paint` (it would clip the marker).

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { motion as m, useReducedMotion } from 'motion/react'
import { Lock } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { alpha } from '@/lib/design-tokens'
import { canvasType, geometry, line, motionSpec, pencil, radii } from '@/lib/studio/canvas-tokens'
import { registry } from '@/lib/studio/registry'
import { useCanvasStore, useChip, useInteractive } from '@/lib/studio/hooks'
import type { AnyBlock } from '@/lib/studio/types'
import { useActions } from '@/components/canvas/actions'
import { getRegistration } from '@/components/canvas/blocks/registry'
import { eyebrowWord, firstLineOf, shortDate, shortTime } from '@/components/canvas/blocks/fallback-block'

export interface BlockShellProps {
  block: AnyBlock
  selected?: boolean
  editing?: boolean
  phone?: boolean
  children: ReactNode
}

/** The default eyebrow text (uppercase is applied by CSS): `type · meta`. */
function useDefaultEyebrow(block: AnyBlock): string {
  const conceptEdited = useCanvasStore((s) => (block.type === 'concept' ? s.concept.created_at : null))
  const draft = useCanvasStore((s) => (block.type === 'draft' ? s.drafts.find((d) => d.id === block.content.draft_id) : undefined))
  const pending = useCanvasStore((s) =>
    block.type === 'commitment' ? s.compass.find((e) => e.id === block.content.entry_id)?.status === 'pending' : false
  )
  return useMemo(() => {
    const parts: string[] = [eyebrowWord(block.type)]
    switch (block.type) {
      case 'concept':
        if (conceptEdited) parts.push(`edited ${shortDate(conceptEdited)}`)
        break
      case 'update': {
        const at = block.content.said_at || block.created_at
        parts.push(shortDate(at))
        const time = shortTime(at)
        if (time) parts.push(time)
        parts.push(block.content.origin === 'talk' ? 'from talk' : 'posted')
        break
      }
      case 'note':
      case 'recording':
      case 'palette':
        parts.push(shortDate(block.created_at))
        break
      case 'draft':
        if (draft) {
          parts.push(draft.kind)
          parts.push(draft.posture)
        }
        break
      case 'commitment':
        if (pending) parts.push('proposed')
        break
      default:
        break
    }
    if (block.arrival_state === 'unplaced' && !parts.includes('from talk')) parts.push('from talk')
    return parts.join(' · ')
  }, [block, conceptEdited, draft, pending])
}

export function BlockShell({ block, selected = false, editing = false, phone = false, children }: BlockShellProps) {
  const { t } = useTheme()
  const chip = useChip()
  const interactive = useInteractive()
  const actions = useActions()
  const reduce = useReducedMotion() ?? false
  const [hovered, setHovered] = useState(false)
  const spec = registry[block.type]
  const reg = getRegistration(block.type)
  const defaultEyebrow = useDefaultEyebrow(block)

  const struck = !!block.struck_at
  const unplaced = block.arrival_state === 'unplaced'
  const paper = spec.class === 'paper'
  const media = spec.class === 'media'
  const accent = spec.accent ? t.hue(spec.accent) : null

  // ── chip (D-010): dot + first line, nothing else ──
  if (chip) {
    return (
      <div data-shell data-chip style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, width: '100%', overflow: 'hidden' }}>
        <i style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: accent ?? t.textMuted, opacity: struck ? 0.45 : 1 }} />
        <span style={{ ...canvasType.chip, color: t.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: struck ? 0.45 : 1 }}>
          {firstLineOf(block)}
        </span>
      </div>
    )
  }

  const mode = reg?.eyebrow ?? (paper ? 'shell' : 'none')
  const eyebrowText = mode === 'none' ? null : mode === 'shell' ? defaultEyebrow : mode(block)
  const showEyebrow = !!eyebrowText

  const radius = media ? radii.media : paper ? radii.block : 0
  const padding = paper ? geometry.paperPadding : 0
  const hoverRing = hovered && !phone && interactive && !selected && !editing
  const dur = (ms: number) => (reduce ? 0 : ms / 1000)

  const surface: CSSProperties = {
    position: 'relative',
    borderRadius: radius,
    padding,
    backgroundColor: paper ? (struck ? alpha(t.cardBg, 0.45) : t.cardBg) : undefined,
    boxShadow: hoverRing ? `inset 0 0 0 1px ${line.hover(t)}` : 'none',
    transition: `box-shadow ${reduce ? 0 : 120}ms ease, background-color ${reduce ? 0 : motionSpec.strikeMs}ms ease`,
    cursor: editing ? 'text' : undefined,
  }

  const content: CSSProperties = {
    opacity: struck ? 0.45 : 1,
    transition: `opacity ${reduce ? 0 : motionSpec.strikeMs}ms ease`,
  }

  const lockGlyph = block.locked ? (
    <span aria-label="locked" title="locked" style={{ display: 'inline-flex', color: t.textMuted, flexShrink: 0 }}>
      <Lock size={12} strokeWidth={1.5} />
    </span>
  ) : null

  return (
    <div
      data-shell
      data-class={spec.class}
      onPointerEnter={phone ? undefined : () => setHovered(true)}
      onPointerLeave={phone ? undefined : () => setHovered(false)}
      style={{ position: 'relative', width: '100%' }}
    >
      <m.div
        data-surface
        initial={unplaced ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: dur(motionSpec.arrivalEnterMs), ease: [0.2, 0.7, 0.2, 1] }}
        style={surface}
      >
        {unplaced && (
          <>
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: -1,
                borderRadius: radius + 1,
                border: `1px dashed ${line.arrival(t)}`,
                pointerEvents: 'none',
              }}
            />
            <m.i
              aria-hidden
              animate={reduce ? { opacity: 1 } : { opacity: [motionSpec.markerPulse.from, motionSpec.markerPulse.to, motionSpec.markerPulse.from] }}
              transition={reduce ? { duration: 0 } : { duration: motionSpec.markerPulse.periodMs / 1000, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                left: -4,
                top: -4,
                width: geometry.markerPx,
                height: geometry.markerPx,
                borderRadius: '50%',
                backgroundColor: pencil.marker(t),
                pointerEvents: 'none',
              }}
            />
          </>
        )}

        <div data-measure style={content}>
          {showEyebrow ? (
            <div
              data-eyebrow
              style={{
                ...canvasType.eyebrow,
                color: t.textMuted,
                height: geometry.eyebrowH,
                marginBottom: geometry.eyebrowGap,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{eyebrowText}</span>
              {lockGlyph}
            </div>
          ) : (
            lockGlyph && <div style={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}>{lockGlyph}</div>
          )}

          {children}

          {unplaced && (
            <div
              data-no-drag
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginTop: 12,
                paddingLeft: paper ? 0 : 0,
                flexWrap: 'wrap',
              }}
            >
              {!phone && (
                <TextAction color={t.tide} onClick={() => actions?.place(block.id)}>
                  place
                </TextAction>
              )}
              <TextAction color={t.textMuted} onClick={() => actions?.dismiss(block.id)}>
                dismiss
              </TextAction>
              {phone && (
                <span style={{ ...canvasType.meta, color: t.textMuted }}>place it from a larger screen</span>
              )}
            </div>
          )}
        </div>

        {struck && (
          <m.div
            aria-hidden
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: dur(motionSpec.strikeMs), ease: [0.2, 0.7, 0.2, 1] }}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '50%',
              height: 1,
              backgroundColor: pencil.strike(t),
              transformOrigin: 'left center',
              pointerEvents: 'none',
            }}
          />
        )}
      </m.div>

      {struck && (
        <m.div
          data-struck-sentence
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: dur(120), delay: dur(120) }}
          style={{
            ...canvasType.meta,
            color: pencil.strike(t),
            marginTop: 6,
            paddingLeft: paper ? geometry.paperPadding : 0,
            paddingRight: paper ? geometry.paperPadding : 0,
            wordBreak: 'break-word',
          }}
        >
          struck {shortDate(block.struck_at)}
          {block.struck_by ? ` — “${block.struck_by}”` : ''}
        </m.div>
      )}
    </div>
  )
}

function TextAction({ children, color, onClick }: { children: ReactNode; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-no-drag
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      style={{
        ...canvasType.small,
        fontWeight: 500,
        color,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        lineHeight: 1.2,
      }}
    >
      {children}
    </button>
  )
}
