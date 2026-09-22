export type Tier = 'practice' | 'direction'
export type Interval = 'monthly' | 'yearly'

const PRICE_ENV: Record<Tier, Record<Interval, string | undefined>> = {
  practice: {
    monthly: process.env.STRIPE_PRICE_PRACTICE_MONTHLY,
    yearly: process.env.STRIPE_PRICE_PRACTICE_YEARLY,
  },
  direction: {
    monthly: process.env.STRIPE_PRICE_DIRECTION_MONTHLY,
    yearly: process.env.STRIPE_PRICE_DIRECTION_YEARLY,
  },
}

export function priceIdFor(tier: Tier, interval: Interval): string {
  const id = PRICE_ENV[tier][interval]
  if (!id) throw new Error(`No Stripe price configured for ${tier}/${interval}`)
  return id
}

export function isTier(value: unknown): value is Tier {
  return value === 'practice' || value === 'direction'
}

export function isInterval(value: unknown): value is Interval {
  return value === 'monthly' || value === 'yearly'
}

export function tierForPriceId(priceId: string): Tier | null {
  for (const tier of ['practice', 'direction'] as Tier[]) {
    for (const interval of ['monthly', 'yearly'] as Interval[]) {
      if (PRICE_ENV[tier][interval] === priceId) return tier
    }
  }
  return null
}
