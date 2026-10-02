// A plan chosen on the landing page's pricing section, carried in the URL
// (never a cookie or browser storage) through sign-up to checkout: someone
// who presses a plan's own button wants that plan now, not the free month.
// Safe to import from the browser: no keys, no price ids.

export type ChosenPlan = { tier: 'practice' | 'direction'; interval: 'monthly' | 'yearly' }

export const PLAN_LABEL: Record<ChosenPlan['tier'], string> = { practice: 'Practice', direction: 'Direction' }
export const PLAN_PRICE: Record<ChosenPlan['tier'], Record<ChosenPlan['interval'], number>> = {
  practice: { monthly: 9, yearly: 90 },
  direction: { monthly: 29, yearly: 290 },
}

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

/** "Practice, €9 a month" */
export function chosenPlanLine(plan: ChosenPlan): string {
  return `${PLAN_LABEL[plan.tier]}, €${PLAN_PRICE[plan.tier][plan.interval]} a ${plan.interval === 'yearly' ? 'year' : 'month'}`
}
