'use client'

// The plans' prices for this visitor, asked for once per page load and shared
// by everything that shows a price. Until the answer arrives (and in the
// static HTML) the fallback is shown.

import { useEffect, useState } from 'react'
import { FALLBACK_PRICES, formatMoney, type LocalPrices, type PriceInterval, type PriceTier } from './price-format'

let pending: Promise<LocalPrices> | null = null

function ask(): Promise<LocalPrices> {
  // `?country=` only does anything outside production (see local-prices.ts).
  const country = new URLSearchParams(window.location.search).get('country')
  pending ??= fetch(`/api/billing/prices${country ? `?country=${encodeURIComponent(country)}` : ''}`)
    .then((r) => (r.ok ? r.json() : FALLBACK_PRICES))
    .then((p: LocalPrices) => (p?.amounts?.practice && p.currency ? p : FALLBACK_PRICES))
    .catch(() => FALLBACK_PRICES)
  return pending
}

export function usePrices(): LocalPrices & { money: (tier: PriceTier, interval: PriceInterval) => string } {
  const [prices, setPrices] = useState<LocalPrices>(FALLBACK_PRICES)
  useEffect(() => {
    let alive = true
    void ask().then((p) => { if (alive) setPrices(p) })
    return () => { alive = false }
  }, [])
  return { ...prices, money: (tier, interval) => formatMoney(prices.amounts[tier][interval], prices.currency) }
}
