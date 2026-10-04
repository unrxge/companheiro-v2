'use client'

// Asked before a project takes a place in Active that another has to give
// up: which one rests, for how long, and that nothing inside it changes.
// The one card for this, wherever the move is made from.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { PlanNote } from '@/components/billing/plan-note'
import { type as typeRoles } from '@/lib/design-tokens'
import { activeLimitLine, REST_DAYS, restEndsAt, type Plan } from '@/lib/billing/entitlements'

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' })
const named = (title: string) => title.trim() || 'Untitled'

export function SwapNote({ plan, title, holders, busy, error, onConfirm, onClose }: {
  plan: Plan
  /** The project asking for a place. */
  title: string
  /** The projects in Active now. One of them rests. */
  holders: Array<{ id: string; title: string }>
  busy?: boolean
  error?: string | null
  onConfirm: (restId: string) => void
  onClose: () => void
}) {
  const { t } = useTheme()
  const only = holders.length === 1 ? holders[0] : null
  const [chosen, setChosen] = useState<string | null>(only?.id ?? null)
  const until = dayFmt.format(new Date(restEndsAt()))

  return (
    <PlanNote
      title={`Start working on “${named(title)}”?`}
      onClose={onClose}
      action={{ label: only ? 'Rest it and start' : 'Rest that one and start', busy, disabled: !chosen, onClick: () => chosen && onConfirm(chosen) }}
    >
      <p style={{ margin: 0 }}>
        {activeLimitLine(plan)}{' '}
        {only
          ? `To work on this one, “${named(only.title)}” goes back to your Queue and rests for ${REST_DAYS} days, until ${until}.`
          : `To work on this one, another goes back to your Queue and rests for ${REST_DAYS} days, until ${until}. Which one?`}
      </p>
      {!only && (
        <div role="radiogroup" aria-label="The project that rests" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {holders.map((h) => {
            const on = chosen === h.id
            return (
              <button
                key={h.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setChosen(h.id)}
                style={{
                  ...typeRoles.ui, fontSize: 15, textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12,
                  border: `1px solid ${on ? t.ember : t.divider}`, background: on ? t.cardBgInner : 'transparent', color: t.textPrimary,
                }}
              >
                <span aria-hidden style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, border: `1px solid ${on ? t.ember : t.textMuted}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {on && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.ember }} />}
                </span>
                {named(h.title)}
              </button>
            )
          })}
        </div>
      )}
      <p style={{ margin: '12px 0 0' }}>
        Nothing in the resting project changes. Every piece, draft, note and file stays as you left it, and you can read and export it
        while it rests. It just can’t be worked on or brought back until {until}.
      </p>
      {error && <p role="alert" style={{ margin: '10px 0 0', color: t.ember }}>{error}</p>}
    </PlanNote>
  )
}
