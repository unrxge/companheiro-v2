'use client'

// The signed-in person's plan, read once and shared by every screen that
// needs to know what it allows (the Project Board, a project's canvas, the
// notices in components/billing). One request per page load, not one per
// component.

import { useEffect, useState } from 'react'
import type { Entitlements } from '@/lib/billing/entitlements'

export interface PlanStatus {
  subscription: {
    status: string
    tier: 'practice' | 'direction' | null
    trial_ends_at?: string | null
    current_period_end?: string | null
    cancel_at_period_end?: boolean
    repeat_trial?: boolean
  } | null
  access: 'uncapped' | 'capped' | 'no_access'
  usage: { plan: 'trial' | 'practice' | 'direction'; period: string; used_micros: number; cap_micros: number } | null
  /** Absent only from an older response; treat as "no limits known". */
  entitlements?: Entitlements
  /** The projects in Active when there are more than the plan carries. */
  over_limit?: Array<{ id: string; title: string }> | null
  /** false while a free month's address is still to be confirmed. */
  email_verified?: boolean
}

let cached: PlanStatus | null = null
let inflight: Promise<PlanStatus | null> | null = null
const listeners = new Set<(s: PlanStatus | null) => void>()

/** Hands a status fetched elsewhere (the access gate) to everyone listening. */
export function primePlan(status: PlanStatus | null) {
  cached = status
  for (const fn of listeners) fn(status)
}

export function loadPlan(force = false): Promise<PlanStatus | null> {
  if (cached && !force) return Promise.resolve(cached)
  if (!inflight || force) {
    inflight = fetch('/api/billing/status', { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<PlanStatus>) : null))
      .then((d) => { if (d) primePlan(d); return d })
      .catch(() => null)
      .finally(() => { inflight = null })
  }
  return inflight
}

/** null until the status has loaded; nothing is locked while it is unknown. */
export function usePlan(): { status: PlanStatus | null; plan: Entitlements | null } {
  const [status, setStatus] = useState<PlanStatus | null>(cached)
  useEffect(() => {
    listeners.add(setStatus)
    if (cached) setStatus(cached)
    else void loadPlan()
    return () => { listeners.delete(setStatus) }
  }, [])
  return { status, plan: status?.entitlements ?? null }
}

const PLANS_EVENT = 'companheiro:plans'
const CHOOSE_EVENT = 'companheiro:choose-project'

/** Opens the plans (Settings) from anywhere. The access gate in the root layout answers. */
export function openPlans() {
  window.dispatchEvent(new Event(PLANS_EVENT))
}

/** Opens "which project are you keeping?" from anywhere. */
export function openProjectChoice() {
  window.dispatchEvent(new Event(CHOOSE_EVENT))
}

export const PLAN_EVENTS = { plans: PLANS_EVENT, choose: CHOOSE_EVENT } as const
