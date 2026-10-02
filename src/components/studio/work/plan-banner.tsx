'use client'

// Shown on a project that can be read but not worked on: the plan carries one
// project at a time and this is not the one in Active (or one has yet to be
// chosen). Says why in a sentence and offers the way through, right here.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { PlanNote } from '@/components/billing/plan-note'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { oneAtATimeLine, REST_DAYS, restEndsAt } from '@/lib/billing/entitlements'
import { openPlans, openProjectChoice } from '@/lib/billing/use-plan'
import type { ProjectAccess } from '@/lib/studio/plan-access'

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' })

export function PlanBanner({ projectId, title, access, onSwitched }: {
  projectId: string
  title: string
  access: ProjectAccess
  /** Called once this project holds the place, so the page can read itself again. */
  onSwitched: () => void
}) {
  const { t } = useTheme()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  if (access.workable) return null

  const line = oneAtATimeLine(access.plan)
  const holder = access.active.find((p) => p.id !== projectId)
  const holderTitle = holder?.title.trim() || 'Untitled'
  const resting = access.resting_until ? dayFmt.format(new Date(access.resting_until)) : null

  const takePlace = async () => {
    setBusy(true)
    setFailed(null)
    try {
      const res = await fetch(`/api/studio/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ shelf_stage: 'active', swap: true }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(typeof d.error === 'string' ? d.error : 'That did not save. Try again.')
      }
      setAsking(false)
      onSwitched()
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not save. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="status"
      style={{
        border: `1px solid ${alpha(t.ochre, 0.45)}`, background: alpha(t.ochre, 0.08), borderRadius: radius.widget,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <p style={{ ...canvasType.body, color: t.textPrimary, margin: 0 }}>
        {access.reason === 'over_limit'
          ? `${line} Choose the one you are working on to carry on here.`
          : resting
            ? `You can read this one, not change it. It is resting until ${resting}.`
            : holder
              ? `You can read this one, not change it. ${line} Right now that is “${holderTitle}”.`
              : `You can read this one, not change it. ${line}`}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {access.reason === 'over_limit' && <QuietButton size="sm" onClick={openProjectChoice}>Choose a project</QuietButton>}
        {access.reason === 'not_active' && !resting && (
          <QuietButton size="sm" onClick={() => (holder ? setAsking(true) : void takePlace())} loading={busy && !asking} loadingLabel="Switching…">
            Work on this one instead
          </QuietButton>
        )}
        <GhostButton size="sm" onClick={openPlans}>See Direction</GhostButton>
        {failed && !asking && <span style={{ ...canvasType.small, color: t.ember }}>{failed}</span>}
      </div>

      {asking && (
        <PlanNote
          title={`Switch to “${title.trim() || 'Untitled'}”?`}
          onClose={() => setAsking(false)}
          action={{ label: 'Switch', busy, onClick: () => void takePlace() }}
        >
          <p style={{ margin: 0 }}>
            {line} “{holderTitle}” goes back to your Queue and rests for {REST_DAYS} days. You can read and export it, but not work on it
            or bring it back until {dayFmt.format(new Date(restEndsAt()))}.
          </p>
          {failed && <p role="alert" style={{ margin: '10px 0 0', color: t.ember }}>{failed}</p>}
        </PlanNote>
      )}
    </div>
  )
}
