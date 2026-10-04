import { NextResponse } from 'next/server'
import { countryOf, localPricesFor } from '@/lib/billing/local-prices'

/**
 * GET /api/billing/prices — what the plans cost for whoever is asking, in
 * their own currency when Stripe holds the plans in it. Public: the landing
 * page shows it to people with no account. Never cached between visitors,
 * since the answer depends on where the request came from.
 */
export async function GET(request: Request) {
  const { currency, amounts, source } = await localPricesFor(countryOf(request))
  return NextResponse.json({ currency, amounts, source }, { headers: { 'Cache-Control': 'private, no-store' } })
}
