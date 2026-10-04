// The plans' prices for one visitor, read from Stripe. Server only.
//
// A Stripe price can carry the same plan in several currencies ("currency
// options"). When all four prices carry the visitor's currency, that is what
// they are shown and what checkout charges; otherwise they see the prices'
// own currency. Either way the number on the page is Stripe's number.

import type Stripe from 'stripe'
import { getStripe } from './stripe'
import { priceIdFor } from './plans'
import { currencyForCountry, FALLBACK_PRICES, type LocalPrices, type PriceInterval, type PriceTier } from './price-format'

const TIERS: PriceTier[] = ['practice', 'direction']
const INTERVALS: PriceInterval[] = ['monthly', 'yearly']
const KEEP_MS = 10 * 60 * 1000

type Loaded = Record<PriceTier, Record<PriceInterval, Stripe.Price>>
let kept: { at: number; prices: Loaded } | null = null

async function load(): Promise<Loaded> {
  if (kept && Date.now() - kept.at < KEEP_MS) return kept.prices
  const stripe = getStripe()
  const entries = await Promise.all(
    TIERS.flatMap((tier) => INTERVALS.map(async (interval) => {
      const price = await stripe.prices.retrieve(priceIdFor(tier, interval), { expand: ['currency_options'] })
      return [tier, interval, price] as const
    })),
  )
  const prices = { practice: {}, direction: {} } as Loaded
  for (const [tier, interval, price] of entries) prices[tier][interval] = price
  kept = { at: Date.now(), prices }
  return prices
}

const amountIn = (price: Stripe.Price, currency: string): number | null =>
  currency === price.currency ? price.unit_amount : price.currency_options?.[currency]?.unit_amount ?? null

/** The prices for someone in `country`, and the currency the prices are kept in. */
export async function localPricesFor(country: string | null): Promise<LocalPrices & { base: string }> {
  try {
    const prices = await load()
    const base = prices.practice.monthly.currency
    const all = TIERS.flatMap((t) => INTERVALS.map((i) => prices[t][i]))
    const wanted = currencyForCountry(country)
    const currency = wanted && all.every((p) => amountIn(p, wanted) !== null) ? wanted : base
    // The prices' own currency must at least agree across the four.
    if (!all.every((p) => amountIn(p, currency) !== null)) return { ...FALLBACK_PRICES, base: FALLBACK_PRICES.currency }
    const amounts = { practice: {}, direction: {} } as LocalPrices['amounts']
    for (const t of TIERS) for (const i of INTERVALS) amounts[t][i] = amountIn(prices[t][i], currency) as number
    return { currency, amounts, source: 'stripe', base }
  } catch (error) {
    console.error('local prices error:', error)
    return { ...FALLBACK_PRICES, base: FALLBACK_PRICES.currency }
  }
}

/** Where the request came from, as Vercel's edge reports it. Absent locally. */
export function countryOf(request: Request): string | null {
  const header = request.headers.get('x-vercel-ip-country')
  if (header) return header
  // Outside production, `?country=BR` stands in for the header so a currency can be tried.
  if (process.env.NODE_ENV !== 'production') return new URL(request.url).searchParams.get('country')
  return null
}
