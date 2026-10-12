// A plan chosen on the landing page's pricing section, carried in the URL
// (never a cookie or browser storage) through sign-up to checkout: someone
// who presses a plan's own button wants that plan now, not the free month.
// Safe to import from the browser: no keys, no price ids.

export type ChosenPlan = { tier: 'practice' | 'direction'; interval: 'monthly' | 'yearly' }

// What each plan is called where people read it. The first is `practice`
// everywhere in the code, the database and Stripe's metadata, and was shown
// as "Practice" until 2026-10-12: to an artist that read as rehearsal, as if
// the work were not yet the real thing. "Focus" says what the plan is (two
// projects at a time, on purpose) without ranking the person who chooses it.
export const PLAN_LABEL: Record<ChosenPlan['tier'], string> = { practice: 'Focus', direction: 'Direction' }

/** The plan named in a query string, or null when none (or nonsense) is there. */
export function readChosenPlan(search: string | URLSearchParams): ChosenPlan | null {
  const q = typeof search === 'string' ? new URLSearchParams(search) : search
  const tier = q.get('plan')
  if (tier !== 'practice' && tier !== 'direction') return null
  return { tier, interval: q.get('interval') === 'yearly' ? 'yearly' : 'monthly' }
}

export function chosenPlanQuery(plan: ChosenPlan): string {
  return `plan=${plan.tier}&interval=${plan.interval}`
}

/** "Practice, €9 a month". `price` is already formatted, in the visitor's currency (use-prices.ts). */
export function chosenPlanLine(plan: ChosenPlan, price: string): string {
  return `${PLAN_LABEL[plan.tier]}, ${price} a ${plan.interval === 'yearly' ? 'year' : 'month'}`
}
