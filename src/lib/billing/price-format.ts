// What the plans cost, as shown to a person: the amounts and the currency
// come from Stripe (see local-prices.ts), so the page can never say one thing
// and checkout charge another. Pure and safe to import from the browser.

export type PriceTier = 'practice' | 'direction'
export type PriceInterval = 'monthly' | 'yearly'

export interface LocalPrices {
  /** ISO code, lower case, as Stripe writes it. */
  currency: string
  /** In the currency's smallest unit (cents, pence), as Stripe stores them. */
  amounts: Record<PriceTier, Record<PriceInterval, number>>
  /** 'fallback' until Stripe has answered, or when it could not be reached. */
  source: 'stripe' | 'fallback'
}

/** Shown before Stripe answers, and in the static HTML. */
export const FALLBACK_PRICES: LocalPrices = {
  currency: 'eur',
  amounts: { practice: { monthly: 900, yearly: 9000 }, direction: { monthly: 2900, yearly: 29000 } },
  source: 'fallback',
}

/** Currencies Stripe counts in whole units, with no cents. */
const ZERO_DECIMAL = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'])

/** "€9", "£7.50", "US$10". No decimals when the amount is whole. */
export function formatMoney(minor: number, currency: string): string {
  const value = ZERO_DECIMAL.has(currency) ? minor : minor / 100
  const whole = Number.isInteger(value)
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: whole ? 0 : 2,
    }).format(value)
  } catch {
    return `${value} ${currency.toUpperCase()}`
  }
}

const EUROZONE = ['AT', 'BE', 'BG', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK']
const BY_COUNTRY: Record<string, string> = {
  ...Object.fromEntries(EUROZONE.map((c) => [c, 'eur'])),
  GB: 'gbp', US: 'usd', CA: 'cad', AU: 'aud', NZ: 'nzd', BR: 'brl', MX: 'mxn', CH: 'chf', SE: 'sek', NO: 'nok', DK: 'dkk',
  PL: 'pln', CZ: 'czk', HU: 'huf', RO: 'ron', JP: 'jpy', IN: 'inr', SG: 'sgd', HK: 'hkd', ZA: 'zar', AE: 'aed', IL: 'ils',
}

/** The currency someone in this country pays in, when it is one we know. */
export function currencyForCountry(country: string | null | undefined): string | null {
  return country ? BY_COUNTRY[country.toUpperCase()] ?? null : null
}
