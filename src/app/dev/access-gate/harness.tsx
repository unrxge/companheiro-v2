'use client'

import { useState } from 'react'
import { FairUseNotice, NearLimitBanner, TrialEndedNotice, type Status } from '@/components/billing/access-gate'

type Plan = 'trial' | 'practice' | 'direction'
type View = 'near' | 'fair_use' | 'trial_ended' | 'repeat_trial'

const status = (plan: Plan, repeat = false): Status => ({
  subscription: { status: plan === 'trial' ? 'trialing' : 'active', tier: plan === 'trial' ? null : plan, repeat_trial: repeat },
  access: 'capped',
  usage: { plan, period: '2026-09', used_micros: 0, cap_micros: 1 },
})

export function AccessGateHarness() {
  const [view, setView] = useState<View | null>(null)
  const [plan, setPlan] = useState<Plan>('practice')
  const close = () => setView(null)
  const btn = (v: View, label: string) => (
    <button onClick={() => setView(v)} style={{ padding: '6px 10px', marginRight: 8, marginBottom: 8 }}>{label}</button>
  )

  return (
    <div style={{ padding: 24, color: '#ece9e2' }}>
      <p style={{ marginBottom: 12 }}>Plan: {(['trial', 'practice', 'direction'] as Plan[]).map((p) => (
        <button key={p} onClick={() => setPlan(p)} style={{ marginLeft: 8, fontWeight: plan === p ? 700 : 400 }}>{p}</button>
      ))}</p>
      {btn('near', '80% banner')}
      {btn('fair_use', 'Limit reached')}
      {btn('trial_ended', 'Trial ended')}
      {btn('repeat_trial', 'Repeat address')}
      {view === 'near' && <NearLimitBanner plan={plan} onClose={close} />}
      {view === 'fair_use' && <FairUseNotice status={status(plan)} onClose={close} onPlans={close} />}
      {view === 'trial_ended' && <TrialEndedNotice status={status('trial')} onClose={close} onPlans={close} />}
      {view === 'repeat_trial' && <TrialEndedNotice status={status('trial', true)} onClose={close} onPlans={close} />}
    </div>
  )
}
