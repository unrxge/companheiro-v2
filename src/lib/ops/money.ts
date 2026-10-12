// What one account has cost and brought in, for /admin/people.
//
// Cost is exact: the sum of what each of their companion calls cost (ai_calls,
// in dollars as billed). Income is an estimate: Stripe's amounts are not
// stored, so it is rebuilt from the plan changes that are (billing_events) at
// list price, one charge at the start of each month or year on a plan. A
// change of plan part-way through is counted as a fresh charge, so treat it
// as "about". Net is what is left after tax and Stripe's fees (netFactor).

export interface BillingEvent { kind: string; tier: string | null; billing_interval: string | null; created_at: string }
export interface Call { cost_micros: number; created_at: string }
export interface Prices {
  prices: Record<string, { monthly: number; yearly: number }>
  netFactor: number
  eurPerUsd: number
}

export interface PersonMoney {
  /** Dollars spent on their companion calls: ever, and in the last 30 days. */
  costUsd: number
  cost30Usd: number
  calls: number
  /** Their average cost per month since their first call. */
  costPerMonthUsd: number
  /** Euros: charged at list price, and what reaches you of it. */
  paidEur: number
  netEur: number
  /** Net income less their cost, in euros. What they have been worth so far. */
  valueEur: number
  /** Whole months on a paid plan. */
  monthsPaying: number
  paying: boolean
  /** Dollars per calendar month, oldest first, for the small chart. */
  costByMonth: { month: string; usd: number }[]
}

const DAY = 86_400_000
const MONTH = 30.44 * DAY

export function personMoney(events: BillingEvent[], calls: Call[], money: Prices, now = Date.now()): PersonMoney {
  // ── Income: walk the plan changes, closing one stretch as the next opens.
  type Stretch = { tier: string; interval: string; from: number }
  let open = null as Stretch | null
  let paidEur = 0
  let paidMs = 0
  const close = (until: number) => {
    if (!open) return
    const yearly = open.interval === 'year' || open.interval === 'yearly'
    const length = yearly ? 365.25 * DAY : MONTH
    const charges = Math.floor(Math.max(0, until - open.from) / length) + 1
    const price = money.prices[open.tier]?.[yearly ? 'yearly' : 'monthly'] ?? 0
    paidEur += charges * price
    paidMs += Math.max(0, until - open.from)
    open = null
  }
  for (const e of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const at = Date.parse(e.created_at)
    if (e.kind === 'subscribed' || e.kind === 'resubscribed' || e.kind === 'tier_changed') {
      const was = open as Stretch | null
      close(at)
      const tier: string | undefined = e.tier ?? was?.tier
      if (tier) open = { tier, interval: e.billing_interval ?? was?.interval ?? 'month', from: at }
    } else if (e.kind === 'canceled') {
      close(at)
    }
  }
  const paying = open !== null
  close(now)

  // ── Cost.
  const micros = (list: Call[]) => list.reduce((s, c) => s + (c.cost_micros ?? 0), 0)
  const costUsd = micros(calls) / 1e6
  const since30 = new Date(now - 30 * DAY).toISOString()
  const first = calls.map((c) => c.created_at).sort()[0]
  const months = first ? Math.max(1, (now - Date.parse(first)) / MONTH) : 1
  const byMonth = new Map<string, number>()
  for (const c of calls) byMonth.set(c.created_at.slice(0, 7), (byMonth.get(c.created_at.slice(0, 7)) ?? 0) + c.cost_micros / 1e6)

  const netEur = paidEur * money.netFactor
  return {
    costUsd,
    cost30Usd: micros(calls.filter((c) => c.created_at >= since30)) / 1e6,
    calls: calls.length,
    costPerMonthUsd: costUsd / months,
    paidEur,
    netEur,
    valueEur: netEur - costUsd * money.eurPerUsd,
    monthsPaying: Math.floor(paidMs / MONTH),
    paying,
    costByMonth: [...byMonth.entries()].sort().map(([month, usd]) => ({ month, usd })),
  }
}
