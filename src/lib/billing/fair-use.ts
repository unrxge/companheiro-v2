import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { AuthedContext } from '@/lib/supabase/route'
import type { UsageLike } from '@/lib/usage-log'
import type { Subscription } from './access'

// Fair use, measured in what the AI actually costs us rather than in raw
// tokens: a Sonnet token costs three times a Haiku one, so a token count
// would either starve people on the cheap surfaces or let the expensive
// ones run away. Stored in micro-dollars (the API bills in dollars).
//
// The caps are ceilings for outliers, not a budget anyone is expected to
// reach. At the time of writing one deep companion turn costs roughly
// $0.02–0.03, so $4 is somewhere around 150–200 long conversations a month.
// Override per environment with FAIR_USE_{TRIAL,PRACTICE,DIRECTION}_USD;
// an unset Direction cap means no cap.
const usd = (name: string, fallback: number | null): number | null => {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export const CAPS_USD = {
  trial: usd('FAIR_USE_TRIAL_USD', 2),
  practice: usd('FAIR_USE_PRACTICE_USD', 4),
  direction: usd('FAIR_USE_DIRECTION_USD', null),
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
  | { kind: 'capped'; period: string; capMicros: number; plan: 'trial' | 'practice' | 'direction' }
  | { kind: 'no_access' }

function monthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7)
}

export function allowanceFor(sub: Subscription | null): Allowance {
  if (!sub) return { kind: 'no_access' }
  if (sub.status === 'grandfathered') return { kind: 'uncapped' }
  if (sub.status === 'trialing') {
    const live = sub.trial_ends_at && new Date(sub.trial_ends_at).getTime() > Date.now()
    if (!live) return { kind: 'no_access' }
    return CAPS_USD.trial == null
      ? { kind: 'uncapped' }
      : { kind: 'capped', period: 'trial', capMicros: CAPS_USD.trial * 1e6, plan: 'trial' }
  }
  if (sub.status === 'active' || sub.status === 'past_due') {
    const plan = sub.tier ?? 'practice'
    const cap = CAPS_USD[plan]
    return cap == null
      ? { kind: 'uncapped' }
      : { kind: 'capped', period: monthKey(), capMicros: cap * 1e6, plan }
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
  if (used >= a.capMicros) {
    return gateResponse('fair_use', 429, 'You have reached this period’s fair-use limit.')
  }
  return null
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
