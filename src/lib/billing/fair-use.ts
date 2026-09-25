import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AuthedContext } from '@/lib/supabase/route'
import type { UsageLike } from '@/lib/usage-log'
import type { Subscription } from './access'
import { MODELS } from '@/lib/models'

// Fair use, measured in what the AI actually costs us rather than in raw
// tokens: a Sonnet token costs three times a Haiku one, so a token count
// would either starve people on the cheap surfaces or let the expensive
// ones run away. Stored in micro-dollars (the API bills in dollars).
//
// Two thresholds per plan, both ceilings for outliers rather than budgets:
//  - soft: past it, the companion quietly answers on the fast model (about a
//    third of the cost). Never announced — the work carries on.
//  - hard: the companion's side stops until the period resets. People are
//    warned at 80% of this (components/billing/access-gate.tsx).
// Sized from real session costs (Sept 2026): a long writing-assistant reply
// runs $0.03–0.08 on the deep model, a committed writer $8–12 a month, a
// daily heavy user $30–50. Soft sits where only that heavy tail reaches it;
// reaching hard from soft takes roughly three times soft's worth of deep-model
// work again, which only abuse gets to. Direction's are set so even its
// heaviest users stay close to what the plan brings in (~$26 net of €29),
// because Direction is what funds everything else.
// Override with FAIR_USE_{TRIAL,PRACTICE,DIRECTION}_{SOFT,HARD}_USD.
const usd = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export type CappedPlan = 'trial' | 'practice' | 'direction'

export const CAPS_USD: Record<CappedPlan, { soft: number; hard: number }> = {
  trial: { soft: usd('FAIR_USE_TRIAL_SOFT_USD', 5), hard: usd('FAIR_USE_TRIAL_HARD_USD', 10) },
  practice: { soft: usd('FAIR_USE_PRACTICE_SOFT_USD', 12), hard: usd('FAIR_USE_PRACTICE_HARD_USD', 30) },
  direction: { soft: usd('FAIR_USE_DIRECTION_SOFT_USD', 25), hard: usd('FAIR_USE_DIRECTION_HARD_USD', 50) },
}

// $ per million tokens. Cache writes are priced at the 1h TTL rate (2×
// input), which is what lib/prompt-cache.ts uses; reads are 0.1× input.
// Unknown models are charged as Sonnet so a new model can only make the
// meter cautious, never blind.
const PRICES: Array<{ match: string; input: number; output: number }> = [
  { match: 'haiku', input: 1, output: 5 },
  { match: 'sonnet', input: 3, output: 15 },
  { match: 'opus', input: 5, output: 25 },
]

export function costMicros(model: string, usage: UsageLike): number {
  const p = PRICES.find((x) => model.includes(x.match)) ?? PRICES[1]
  const input = usage.input_tokens ?? 0
  const output = usage.output_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  // $/MTok × tokens = micro-dollars.
  return Math.round(p.input * (input + cacheWrite * 2 + cacheRead * 0.1) + p.output * output)
}

export type Allowance =
  | { kind: 'uncapped' }
  | { kind: 'capped'; period: string; softMicros: number; hardMicros: number; plan: CappedPlan }
  | { kind: 'no_access' }

function monthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7)
}

function capped(plan: CappedPlan, period: string): Allowance {
  const c = CAPS_USD[plan]
  return { kind: 'capped', period, plan, softMicros: c.soft * 1e6, hardMicros: c.hard * 1e6 }
}

export function allowanceFor(sub: Subscription | null): Allowance {
  if (!sub) return { kind: 'no_access' }
  if (sub.status === 'grandfathered') return { kind: 'uncapped' }
  if (sub.status === 'trialing') {
    const live = sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > Date.now()
    if (!live) return { kind: 'no_access' }
    return capped('trial', 'trial')
  }
  if (sub.status === 'active' || sub.status === 'past_due') {
    return capped(sub.tier ?? 'practice', monthKey())
  }
  return { kind: 'no_access' }
}

// The one period every call is metered against, so the gate and the meter
// can never disagree about which bucket a call belongs in.
function periodFor(sub: Subscription | null): string {
  const a = allowanceFor(sub)
  return a.kind === 'capped' ? a.period : sub?.status === 'trialing' ? 'trial' : monthKey()
}

// Header the client-side gate listens for (components/billing/access-gate).
export const GATE_HEADER = 'x-companheiro-gate'

export type GateReason = 'trial_ended' | 'fair_use'

function gateResponse(reason: GateReason, status: number, message: string) {
  return NextResponse.json({ error: message, gate: reason }, { status, headers: { [GATE_HEADER]: reason } }) as NextResponse<never>
}

async function loadState(auth: AuthedContext) {
  const { data: sub, error } = await auth.supabase
    .from('subscriptions')
    .select('status, tier, trial_ends_at, current_period_end, cancel_at_period_end, repeat_trial')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  return { sub: sub as Subscription | null, error }
}

export async function usageFor(auth: AuthedContext, period: string): Promise<number> {
  const { data } = await auth.supabase
    .from('ai_usage')
    .select('cost_micros')
    .eq('user_id', auth.user.id)
    .eq('period', period)
    .maybeSingle()
  return (data?.cost_micros as number | undefined) ?? 0
}

// Call right after auth in every route that reaches Claude. Returns the
// response to send instead, or null to carry on. A failed lookup (not a
// missing row — an actual error) lets the call through: an outage in our
// own bookkeeping must never be what stops someone mid-thought.
export async function aiGate(auth: AuthedContext): Promise<NextResponse<never> | null> {
  const { sub, error } = await loadState(auth)
  if (error) {
    console.error('aiGate: subscription lookup failed, allowing', error.message)
    return null
  }
  const a = allowanceFor(sub)
  if (a.kind === 'no_access') {
    return gateResponse('trial_ended', 402, 'Your free month has ended.')
  }
  if (a.kind === 'uncapped') return null
  const used = await usageFor(auth, a.period)
  if (used >= a.hardMicros) {
    return gateResponse('fair_use', 429, 'You have reached this period’s fair-use limit.')
  }
  if (used >= a.softMicros) lighter.add(auth.user)
  return null
}

// Users past their soft threshold for this request, keyed by the request's
// own user object so nothing outlives the request.
const lighter = new WeakSet<object>()

// The model a gated route should actually use: the one it asked for, or the
// fast model once this person is past their soft threshold. Call after
// aiGate, with the same auth.
export function pickModel(auth: Pick<AuthedContext, 'user'>, requested: string): string {
  return lighter.has(auth.user) ? MODELS.fast : requested
}

function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!key) return null
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Adds one call's cost to the person's current period. Never throws — a
// metering failure must not fail the request that already succeeded.
export async function meterUsage(userId: string, model: string, usage: UsageLike): Promise<void> {
  try {
    const db = admin()
    if (!db) return
    const { data: sub } = await db
      .from('subscriptions')
      .select('status, tier, trial_ends_at, current_period_end, cancel_at_period_end, repeat_trial')
      .eq('user_id', userId)
      .maybeSingle()
    const { error } = await db.rpc('add_ai_usage', {
      p_user_id: userId,
      p_period: periodFor(sub as Subscription | null),
      p_cost_micros: costMicros(model, usage),
    })
    if (error) console.error('meterUsage failed:', error.message)
  } catch (e) {
    console.error('meterUsage failed:', e)
  }
}
