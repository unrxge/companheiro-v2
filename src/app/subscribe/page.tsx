'use client'

// Where someone lands, signed in, after choosing a plan on the landing page:
// straight on to Stripe's checkout for that plan, skipping the free month.
// Nothing is charged here. Leaving checkout without paying brings them back
// to the app with their free month untouched.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AuthShell, AuthLink } from '@/components/auth/auth-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { PrimaryButton } from '@/components/ui/buttons'
import { WorkingDots } from '@/components/ui/working'
import { type as typeRoles } from '@/lib/design-tokens'
import { chosenPlanLine, readChosenPlan, type ChosenPlan } from '@/lib/billing/chosen-plan'

export default function SubscribePage() {
  const router = useRouter()
  const { t } = useTheme()
  const [plan, setPlan] = useState<ChosenPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const started = useRef(false)

  const checkout = useCallback(async (chosen: ChosenPlan) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chosen),
      })
      const d = await res.json().catch(() => ({}))
      // Already on a plan: nothing to buy, the app is where they want to be.
      if (res.status === 409) { router.replace('/home'); return }
      if (res.status === 401) { router.replace(`/login?plan=${chosen.tier}&interval=${chosen.interval}`); return }
      if (!res.ok || !d.url) {
        setError(typeof d.error === 'string' ? d.error : 'Checkout did not open.')
        setBusy(false)
        return
      }
      window.location.href = d.url
    } catch {
      setError('Checkout did not open. Check your connection and try again.')
      setBusy(false)
    }
  }, [router])

  // The plan is read here, in the browser, so the page itself never depends on the request.
  useEffect(() => {
    if (started.current) return
    started.current = true
    const chosen = readChosenPlan(window.location.search)
    if (!chosen) { router.replace('/home'); return }
    setPlan(chosen)
    void checkout(chosen)
  }, [checkout, router])

  return (
    <AuthShell
      title={error ? 'Checkout did not open.' : 'One moment.'}
      subtitle={plan ? `Taking you to checkout for ${chosenPlanLine(plan)}.` : undefined}
      footer={<span>Not ready to pay? <AuthLink href="/home">Start with the free month instead</AuthLink></span>}
    >
      {error ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p role="alert" style={{ ...typeRoles.small, color: t.danger }}>{error}</p>
          <PrimaryButton onClick={() => plan && void checkout(plan)} loading={busy} loadingLabel="Opening…" full size="lg">Try again</PrimaryButton>
        </div>
      ) : (
        <div role="status" style={{ ...typeRoles.ui, fontSize: 15, color: t.textSecondary, display: 'flex', alignItems: 'center', gap: 10, minHeight: 48 }}>
          <WorkingDots />
          <span>Opening secure checkout…</span>
        </div>
      )}
    </AuthShell>
  )
}
