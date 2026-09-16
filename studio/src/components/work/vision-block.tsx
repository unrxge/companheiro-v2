'use client'

// studio/src/components/work/vision-block.tsx — the project itself, as a
// block on the board.
//
// The title, the ethos it's for, and the rules that can catch you used to
// live in a pill in the corner of the screen — chrome, not content, and easy
// to forget was even there. It belongs on the same surface as the work it
// governs: a card like any other, that pans and zooms with everything else,
// opens to show its vision and constraints, and can be dragged wherever it
// reads best next to the pieces it is standing over.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { RuleList } from '@/components/work/rules'
import { InlineField } from '@/components/work/bits'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, fonts, radius } from '@/lib/design-tokens'
import type { Rule } from '@/lib/studio/node-types'

export const VISION_W = 440
export const VISION_COLLAPSED_H = 96
export const VISION_EXPANDED_H = 420

export function VisionBlock({
  title,
  intent,
  rules,
  expanded,
  onToggle,
  onRename,
  onEditIntent,
  onEditRules,
  disabled,
}: {
  title: string
  intent: string
  rules: Rule[]
  expanded: boolean
  onToggle: () => void
  onRename: (title: string) => void
  onEditIntent: (intent: string) => void
  onEditRules: (rules: Rule[]) => void
  disabled: boolean
}) {
  const { t } = useTheme()
  const [hover, setHover] = useState(false)
  const liveRules = rules.filter((r) => !r.retired_at).length

  return (
    <div
      data-hold
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: VISION_W, boxSizing: 'border-box',
        maxHeight: expanded ? VISION_EXPANDED_H : VISION_COLLAPSED_H,
        display: 'flex', flexDirection: 'column',
        background: t.cardBg, borderRadius: radius.card,
        border: `1px solid ${hover ? alpha(t.textPrimary, 0.16) : 'transparent'}`,
        boxShadow: t.shadow,
        overflow: 'hidden',
        transition: 'border-color 160ms ease, max-height 200ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '18px 20px 12px', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineField
            ariaLabel="the project's title"
            value={title}
            placeholder="untitled project"
            disabled={disabled}
            onCommit={onRename}
            style={{ ...canvasType.conceptTitle, fontSize: 22, color: t.textPrimary }}
          />
        </div>
        <button
          type="button"
          aria-label={expanded ? 'hide what this is for' : 'what this is for, and the rules that catch you'}
          aria-expanded={expanded}
          onClick={onToggle}
          style={{
            width: 26, height: 26, borderRadius: 999, padding: 0, flexShrink: 0, marginTop: 2,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            border: 'none', background: expanded ? alpha(t.textPrimary, 0.08) : 'transparent',
            color: t.textMuted,
          }}
        >
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 200ms ease' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {!expanded && (
        <button
          type="button"
          onClick={onToggle}
          style={{
            ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none',
            textAlign: 'left', cursor: 'pointer', padding: '0 20px 16px',
          }}
        >
          {intent ? intent : 'what this is for…'}
          {liveRules > 0 && ` · ${liveRules} ${liveRules === 1 ? 'rule' : 'rules'}`}
        </button>
      )}

      {expanded && (
        <div style={{ padding: '0 20px 20px', overflowY: 'auto', minHeight: 0 }}>
          <InlineField
            ariaLabel="what this project is for"
            value={intent}
            placeholder="say what the whole project is, and what it has to do…"
            multiline
            disabled={disabled}
            onCommit={onEditIntent}
            style={{ ...canvasType.conceptBody, fontSize: 15, color: t.textSecondary }}
          />
          <div style={{ borderTop: `1px solid ${alpha(t.textPrimary, 0.08)}`, marginTop: 16, paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.textMuted, marginBottom: 10 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                <path d="M5 4h14v16H5z" />
                <line x1="8.5" y1="9" x2="15.5" y2="9" />
                <line x1="8.5" y1="13" x2="15.5" y2="13" />
                <line x1="8.5" y1="17" x2="12" y2="17" />
              </svg>
              <span style={{ ...canvasType.chip, fontFamily: fonts.mono }}>
                {liveRules || 'no'} {liveRules === 1 ? 'rule' : 'rules'} in force
              </span>
            </div>
            <RuleList rules={rules} inherited={[]} disabled={disabled} onChange={onEditRules} />
          </div>
        </div>
      )}
    </div>
  )
}
