'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { Card, Divider } from '@/components/shell/page-shell'
import { PrimaryButton, GhostButton } from '@/components/ui/buttons'
import { Pill } from '@/components/ui/pill'
import { type as typeRoles } from '@/lib/design-tokens'
import type { Interval, Tier } from '@/lib/billing/plans'

type Subscription = {
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'grandfathered'
  tier: Tier | null
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

const PLAN_LABEL: Record<Tier, string> = { practice: 'Practice', direction: 'Direction' }
const PRICE: Record<Tier, Record<Interval, number>> = {
  practice: { monthly: 9, yearly: 90 },
  direction: { monthly: 29, yearly: 290 },
}

function daysLeft(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))
}

export function BillingCard() {
  const { t } = useTheme()
  const [sub, setSub] = useState<Subscription | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [interval, setInterval] = useState<Interval>('monthly')
  const [busy, setBusy] = useState<Tier | 'portal' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/billing/status')
      .then((r) => r.json())
      .then((d) => setSub(d.subscription ?? null))
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const subscribe = async (tier: Tier) => {
    setBusy(tier)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, interval }),
      })
      const d = await res.json()
      if (!res.ok || !d.url) {
        setError(d.error || 'Could not start checkout.')
        return
      }
      window.location.href = d.url
    } finally {
      setBusy(null)
    }
  }

  const manage = async () => {
    setBusy('portal')
    setError(null)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const d = await res.json()
      if (!res.ok || !d.url) {
        setError(d.error || 'Could not open billing.')
        return
      }
      window.location.href = d.url
    } finally {
      setBusy(null)
    }
  }

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0' }
  const label: React.CSSProperties = { ...typeRoles.ui, fontSize: 14, color: t.textPrimary, fontWeight: 500 }
  const hint: React.CSSProperties = { ...typeRoles.small, fontSize: 12, color: t.textMuted, marginTop: 2 }

  if (!loaded) return null

  return (
    <Card padding={18}>
      {sub?.status === 'grandfathered' && (
        <div style={row}>
          <div>
            <div style={label}>Plan</div>
            <div style={hint}>Free, for as long as you&apos;re here. Thank you for being early.</div>
          </div>
        </div>
      )}

      {sub?.status === 'active' && sub.tier && (
        <>
          <div style={row}>
            <div>
              <div style={label}>{PLAN_LABEL[sub.tier]}</div>
              <div style={hint}>
                {sub.cancel_at_period_end
                  ? `Ends ${sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : 'soon'}.`
                  : sub.current_period_end
                    ? `Renews ${new Date(sub.current_period_end).toLocaleDateString()}.`
                    : null}
              </div>
            </div>
            <GhostButton size="sm" onClick={manage} loading={busy === 'portal'} loadingLabel="Opening…">Manage billing</GhostButton>
          </div>
        </>
      )}

      {sub?.status === 'past_due' && (
        <div style={row}>
          <div>
            <div style={label}>Payment failed</div>
            <div style={hint}>Update your card to keep your plan active.</div>
          </div>
          <GhostButton size="sm" onClick={manage} loading={busy === 'portal'} loadingLabel="Opening…">Update card</GhostButton>
        </div>
      )}

      {(sub?.status === 'trialing' || sub?.status === 'canceled' || !sub) && (
        <>
          <div style={row}>
            <div>
              <div style={label}>{sub?.status === 'trialing' && sub.trial_ends_at ? `Trial — ${daysLeft(sub.trial_ends_at)} days left` : 'Choose a plan'}</div>
              <div style={hint}>Practice for one active project in words. Direction for many, in any medium.</div>
            </div>
            <div role="radiogroup" aria-label="Billing period" style={{ display: 'inline-flex', gap: 6 }}>
              <Pill hue="neutral" selected={interval === 'monthly'} onClick={() => setInterval('monthly')} size="sm">Monthly</Pill>
              <Pill hue="neutral" selected={interval === 'yearly'} onClick={() => setInterval('yearly')} size="sm">Yearly</Pill>
            </div>
          </div>
          <Divider />
          <div style={row}>
            <div style={label}>Practice — €{PRICE.practice[interval]}{interval === 'yearly' ? '/yr' : '/mo'}</div>
            <PrimaryButton size="sm" onClick={() => subscribe('practice')} loading={busy === 'practice'} loadingLabel="Starting…">Subscribe</PrimaryButton>
          </div>
          <Divider />
          <div style={row}>
            <div style={label}>Direction — €{PRICE.direction[interval]}{interval === 'yearly' ? '/yr' : '/mo'}</div>
            <PrimaryButton size="sm" onClick={() => subscribe('direction')} loading={busy === 'direction'} loadingLabel="Starting…">Subscribe</PrimaryButton>
          </div>
        </>
      )}

      {error && <p style={{ ...typeRoles.small, color: t.danger, marginTop: 8 }}>{error}</p>}
    </Card>
  )
}
