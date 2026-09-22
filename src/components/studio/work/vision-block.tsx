'use client'

// studio/src/components/work/vision-block.tsx — the project itself, as a
// block on the board.
//
// The title, the ethos it's for, and the rules that can catch you used to
// live in a pill in the corner of the screen — chrome, not content, and easy
// to forget was even there. It belongs on the same surface as the work it
// governs: dragged wherever it reads best next to the pieces it stands over.
//
// Collapsed, it is not a card at all — no box, no border, just the title
// sitting on the canvas the way a heading sits on a page, sized to its own
// words rather than stretched to fill some fixed row, with a small, quiet
// toggle right beside it. Only once opened does it take on paper: the vision
// and the rules need a surface to sit on, the title never did.

import { useEffect, useRef, useState } from 'react'
import { ConversationLogModal, type ConversationLogMessage } from '@/components/conversation/conversation-log-modal'
import { useTheme } from '@/components/theme/theme-provider'
import { RuleList } from '@/components/studio/work/rules'
import { InlineField } from '@/components/studio/work/bits'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'
import type { Rule } from '@/lib/studio/node-types'

export const VISION_TITLE_H = 60
export const VISION_COLLAPSED_H = VISION_TITLE_H
// A first guess only, for the one frame before the board measures the real
// thing — the panel itself sizes to its actual content, not this number.
export const VISION_EXPANDED_H = VISION_TITLE_H + 8 + 340

/**
 * Wide on purpose — the vision reads as two columns side by side, what it's
 * for and what can catch it, rather than one long, narrow one — but tied to
 * the width of the piece cards it sits above, not a constant of its own.
 * Fixed at 880 regardless of screen, it dwarfed a lane of narrower cards on
 * anything but a wide window; scaled off cardW, the two grow and shrink
 * together and the whole board keeps one sense of scale. Capped at 1040, not
 * 880 — the old cap left both columns wrapping onto more lines than the
 * words needed on anything wider than a small window.
 */
export function visionWidth(cardW: number): number {
  return Math.round(Math.min(1040, Math.max(560, cardW * 1.6)))
}

const TITLE_STYLE = { ...canvasType.anchor, fontSize: 32, lineHeight: 1.15 } as const

export function VisionBlock({
  title,
  width,
  intent,
  rules,
  expanded,
  onToggle,
  onRename,
  onEditIntent,
  onEditRules,
  disabled,
  conversationLog,
}: {
  title: string
  /** From visionWidth(cardW) — kept in proportion with the cards below it. */
  width: number
  intent: string
  rules: Rule[]
  expanded: boolean
  onToggle: () => void
  onRename: (title: string) => void
  onEditIntent: (intent: string) => void
  onEditRules: (rules: Rule[]) => void
  disabled: boolean
  /** The Idea Lab conversation behind this project, when there was one. */
  conversationLog?: ConversationLogMessage[] | null
}) {
  const { t } = useTheme()
  const liveRules = rules.filter((r) => !r.retired_at).length
  const [renaming, setRenaming] = useState(false)
  const [showLog, setShowLog] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => { if (!renaming) setDraft(title) }, [title, renaming])
  useEffect(() => { if (renaming) inputRef.current?.focus() }, [renaming])

  const commit = () => {
    setRenaming(false)
    const next = draft.trim()
    if (next !== title.trim()) onRename(next)
  }

  return (
    <div style={{ maxWidth: width, display: 'flex', flexDirection: 'column' }}>
      {/* the title itself: never boxed, sized to its own words, always the
         most prominent thing here — a heading until you click it. */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: VISION_TITLE_H, maxWidth: '100%' }}>
        {renaming ? (
          <input
            ref={inputRef}
            aria-label="The project's title"
            value={draft}
            size={Math.max(draft.length, 8)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(title); setRenaming(false) } }}
            style={{
              ...TITLE_STYLE, color: shell.text, background: 'transparent',
              border: 'none', outline: 'none', padding: 0, minWidth: 0, maxWidth: '100%',
            }}
          />
        ) : (
          <h1
            onClick={() => !disabled && setRenaming(true)}
            title={disabled ? undefined : 'Rename the project'}
            style={{
              // Never t.textPrimary: this row sits directly on the shell,
              // which is always dark, in both states — a card only ever
              // appears underneath it once expanded, never behind the title.
              ...TITLE_STYLE, color: title ? shell.text : shell.muted, margin: 0,
              cursor: disabled ? 'default' : 'text', minWidth: 0, maxWidth: '100%',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {title || 'Untitled project'}
          </h1>
        )}
        <button
          type="button"
          aria-label={expanded ? 'Hide what this is for' : 'What this is for, and the rules that catch you'}
          aria-expanded={expanded}
          onClick={onToggle}
          style={{
            width: 28, height: 28, borderRadius: 999, padding: 0, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            border: 'none', background: expanded ? shell.fillHover : 'transparent',
            color: shell.muted,
          }}
        >
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 200ms ease' }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* the vision and the rules: boxed, and only ever here when asked for.
         Two columns, not one long one — the width is here to be used. */}
      {expanded && (
        <div
          data-hold
          style={{
            // Sized to its own content — a fixed cap here either clipped a
            // long intent and its rules mid-sentence, or left too much air
            // under a short one. 70vh is a safety valve for a genuinely long
            // list of rules, not a height ordinary content should ever reach.
            marginTop: 8, width, maxHeight: '70vh', overflowY: 'auto',
            background: t.cardBg, borderRadius: radius.card, boxShadow: t.shadow,
            padding: '26px 30px', boxSizing: 'border-box',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.textMuted, marginBottom: 10 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3" />
              </svg>
              <span style={{ ...canvasType.chip }}>What this is for</span>
            </div>
            <InlineField
              ariaLabel="What this project is for"
              value={intent}
              placeholder="Say what the whole project is, and what it has to do…"
              multiline
              disabled={disabled}
              onCommit={onEditIntent}
              style={{ ...canvasType.conceptBody, fontSize: 15, color: t.textSecondary }}
            />
            {conversationLog && conversationLog.length > 0 && (
              <button
                type="button"
                onClick={() => setShowLog(true)}
                style={{
                  ...canvasType.chip, marginTop: 16, padding: 0, background: 'none', border: 'none',
                  color: t.ember, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3,
                }}
              >
                Read the conversation that shaped this
              </button>
            )}
          </div>
          <div style={{ borderLeft: `1px solid ${alpha(t.textPrimary, 0.08)}`, paddingLeft: 36 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: t.textMuted, marginBottom: 10 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                <path d="M5 4h14v16H5z" />
                <line x1="8.5" y1="9" x2="15.5" y2="9" />
                <line x1="8.5" y1="13" x2="15.5" y2="13" />
                <line x1="8.5" y1="17" x2="12" y2="17" />
              </svg>
              <span style={{ ...canvasType.chip }}>
                {liveRules || 'no'} {liveRules === 1 ? 'rule' : 'rules'} in force
              </span>
            </div>
            <RuleList rules={rules} inherited={[]} disabled={disabled} onChange={onEditRules} />
          </div>
        </div>
      )}
      {showLog && conversationLog && (
        <ConversationLogModal messages={conversationLog} onClose={() => setShowLog(false)} />
      )}
    </div>
  )
}
