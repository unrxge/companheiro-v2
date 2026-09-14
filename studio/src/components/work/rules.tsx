'use client'

// studio/src/components/work/rules.tsx — rules and what happens when one is
// broken.
//
// A rule is checkable in a way a description of a vision never is. Rules fire
// at boundaries only, never while writing, and a collision arrives as a
// question with both doors open: fix the work, or amend the rule. Amending is
// the only honest way a vision changes here, so it is a first-class answer and
// not a way of dismissing the question.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import type { CheckOutcome, Rule, RuleCheck } from '@/lib/studio/node-types'
import { newRule } from '@/lib/studio/tree'
import { InlineField, Label } from '@/components/work/bits'

export function RuleList({
  rules,
  onChange,
  inherited = [],
  disabled = false,
}: {
  rules: Rule[]
  onChange: (next: Rule[]) => void
  /** Rules in force from above: shown, never editable here. */
  inherited?: Array<{ rule: Rule; from: string }>
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [adding, setAdding] = useState('')
  const live = rules.filter((r) => !r.retired_at)

  const add = () => {
    const text = adding.trim()
    if (!text) return
    onChange([...rules, newRule(text)])
    setAdding('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Label>rules</Label>

      {inherited.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {inherited.map(({ rule, from }) => (
            <li
              key={rule.id}
              style={{
                ...canvasType.small, color: t.textSecondary,
                display: 'flex', gap: 8, alignItems: 'baseline',
              }}
            >
              <span style={{ ...canvasType.chip, color: t.textMuted, flexShrink: 0 }}>{from}</span>
              <span>{rule.text}</span>
            </li>
          ))}
        </ul>
      )}

      {live.length === 0 && inherited.length === 0 && (
        <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>
          none yet. a rule is something you can be caught breaking — “every part ends on a question”,
          “the chorus never says the title”.
        </p>
      )}

      {live.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {live.map((rule) => (
            <li key={rule.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span aria-hidden style={{ ...canvasType.small, color: t.ember, lineHeight: '22px' }}>·</span>
              <div style={{ flex: '1 1 auto', maxWidth: 520 }}>
                <InlineField
                  ariaLabel="rule"
                  value={rule.text}
                  disabled={disabled}
                  onCommit={(text) =>
                    onChange(rules.map((r) => (r.id === rule.id ? { ...r, text } : r)))
                  }
                  style={{ ...canvasType.small }}
                />
              </div>
              {!disabled && (
                <button
                  type="button"
                  aria-label="retire this rule"
                  onClick={() =>
                    onChange(rules.map((r) => (r.id === rule.id ? { ...r, retired_at: new Date().toISOString() } : r)))
                  }
                  style={{
                    ...canvasType.chip, color: t.textMuted, background: 'none',
                    border: 'none', cursor: 'pointer', padding: '2px 4px',
                    flexShrink: 0, alignSelf: 'baseline',
                  }}
                >
                  retire
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            aria-label="a new rule"
            value={adding}
            placeholder="add a rule…"
            onChange={(e) => setAdding(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            style={{
              flex: 1, ...canvasType.small, color: t.textPrimary,
              background: t.inputBg, border: `1px solid ${t.inputBorder}`,
              borderRadius: radius.field, padding: '6px 10px', outline: 'none',
            }}
          />
          <GhostButton size="sm" onClick={add} disabled={!adding.trim()}>add</GhostButton>
        </div>
      )}
    </div>
  )
}

/** A collision, with both doors open. */
export function CheckCard({
  check,
  onResolve,
  onAmend,
}: {
  check: RuleCheck
  onResolve: (outcome: CheckOutcome, note?: string) => void
  /** Called with the new wording when the answer is that the rule was wrong. */
  onAmend: (newText: string) => void
}) {
  const { t } = useTheme()
  const [amending, setAmending] = useState(false)
  const [text, setText] = useState(check.rule_text)

  return (
    <div
      style={{
        border: `1px solid ${alpha(t.ochre, 0.4)}`,
        background: alpha(t.ochre, 0.07),
        borderRadius: radius.widget,
        padding: 14,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ ...canvasType.chip, color: t.ochre }}>your rule: {check.rule_text}</div>
      <p style={{ ...canvasType.body, color: t.textPrimary, margin: 0 }}>{check.question}</p>

      {amending ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            aria-label="the rule, reworded"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{
              ...canvasType.small, color: t.textPrimary, background: t.inputBg,
              border: `1px solid ${t.inputBorder}`, borderRadius: radius.field,
              padding: '8px 10px', outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <QuietButton
              size="sm"
              onClick={() => { onAmend(text.trim()); onResolve('amended', text.trim()) }}
              disabled={!text.trim()}
            >
              change the rule
            </QuietButton>
            <GhostButton size="sm" onClick={() => setAmending(false)}>never mind</GhostButton>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <QuietButton size="sm" onClick={() => onResolve('fixed')}>i&rsquo;ll fix it</QuietButton>
          <GhostButton size="sm" onClick={() => setAmending(true)}>the rule was wrong</GhostButton>
          <GhostButton size="sm" onClick={() => onResolve('meant_it')}>i meant it</GhostButton>
          <GhostButton size="sm" onClick={() => onResolve('dismissed')}>not now</GhostButton>
        </div>
      )}
    </div>
  )
}
