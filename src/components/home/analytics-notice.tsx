'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { Card } from '@/components/shell/page-shell'
import { QuietButton } from '@/components/ui/buttons'
import { type as typeRoles } from '@/lib/design-tokens'

/**
 * Shown once, on Home, to an account that existed before usage analytics did
 * and so has never been told about them (lib/usage-analytics.ts). Nothing of
 * theirs is shown to the maker until they have answered here: left on, their
 * usage is shared from then; switched off, it never is. New accounts are told
 * on the tour's last slide instead and never see this.
 */
export function AnalyticsNotice() {
  const { t } = useTheme()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState<'on' | 'off' | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setShow(d?.usage_analytics?.told === false))
      .catch(() => {})
  }, [])

  const answer = async (on: boolean) => {
    setBusy(on ? 'on' : 'off')
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(on ? { usage_analytics_told: true } : { usage_analytics: false }),
      })
      if (res.ok) setShow(false)
    } finally {
      setBusy(null)
    }
  }

  if (!show) return null
  return (
    <Card style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px 24px' }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <p style={{ ...typeRoles.ui, fontSize: 14, fontWeight: 600, color: t.textPrimary }}>New: usage analytics</p>
          <p style={{ ...typeRoles.small, fontSize: 13, color: t.textSecondary, marginTop: 4 }}>
            To learn how Companheiro is working for people, its maker would like to see which parts of your projects you use, and when: dates, counts and
            stages. Never what you write, never a title, and nothing from your check-ins. You can change this in Settings at any time.{' '}
            <a href="/privacy#analytics" target="_blank" rel="noopener noreferrer" style={{ color: t.textSecondary, textDecoration: 'underline', textUnderlineOffset: 3 }}>What this covers</a>
          </p>
        </div>
        {/* The two answers carry the same weight: neither is the one being pushed. */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <QuietButton size="sm" onClick={() => answer(false)} loading={busy === 'off'} disabled={busy !== null} loadingLabel="Switching off…">Switch it off</QuietButton>
          <QuietButton size="sm" onClick={() => answer(true)} loading={busy === 'on'} disabled={busy !== null} loadingLabel="Saving…">Keep it on</QuietButton>
        </div>
      </div>
    </Card>
  )
}
