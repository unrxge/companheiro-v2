'use client'

// Shown on a project that can be read but not worked on: the plan carries a
// set number of projects at a time and this is not one of those in Active (or
// which stay has yet to be chosen). Says why in a sentence and offers the way through, right here.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { SwapNote } from '@/components/billing/swap-note'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { activeLimitLine } from '@/lib/billing/entitlements'
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

  const line = activeLimitLine(access.plan)
  const holders = access.active.filter((p) => p.id !== projectId)
  // Active has a place free: taking it rests nothing, so nothing is asked.
  const full = access.limit !== null && holders.length >= access.limit
  const holderTitles = holders.map((p) => `“${p.title.trim() || 'Untitled'}”`).join(' and ')
  const resting = access.resting_until ? dayFmt.format(new Date(access.resting_until)) : null

  const takePlace = async (restId?: string) => {
    setBusy(true)
    setFailed(null)
    try {
      const res = await fetch(`/api/studio/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ shelf_stage: 'active', swap: true, ...(restId ? { rest_id: restId } : {}) }),
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
          ? `${line} Choose which you are working on to carry on here.`
          : resting
            ? `You can read this one, not change it. It is resting until ${resting}.`
            : !full
              ? 'You can read this one, not change it, while it waits in your Queue.'
              : holders.length
              ? `You can read this one, not change it. ${line} Right now that is ${holderTitles}.`
              : `You can read this one, not change it. ${line}`}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {access.reason === 'over_limit' && <QuietButton size="sm" onClick={openProjectChoice}>Choose projects</QuietButton>}
        {access.reason === 'not_active' && !resting && (
          <QuietButton size="sm" onClick={() => (full ? setAsking(true) : void takePlace())} loading={busy && !asking} loadingLabel="Switching…">
            {full ? "Work on this one instead" : "Work on this one"}
          </QuietButton>
        )}
        <GhostButton size="sm" onClick={openPlans}>See Direction</GhostButton>
        {failed && !asking && <span style={{ ...canvasType.small, color: t.ember }}>{failed}</span>}
      </div>

      {asking && (
        <SwapNote
          plan={access.plan}
          title={title}
          holders={holders}
          busy={busy}
          error={failed}
          onClose={() => setAsking(false)}
          onConfirm={(restId) => void takePlace(restId)}
        />
      )}
    </div>
  )
}
