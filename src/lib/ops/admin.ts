// Owner-only access and the numbers the /admin page and daily digest share.
import { requireUser } from '@/lib/supabase/route'
import { CAPS_USD } from '@/lib/billing/fair-use'

// ADMIN_USER_IDS: comma-separated auth user ids allowed into /admin.
export async function requireAdmin() {
  const auth = await requireUser()
  if (!auth) return null
  const allowed = (process.env.ADMIN_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  return allowed.includes(auth.user.id) ? auth : null
}

const num = (name: string, fallback: number) => {
  const n = Number(process.env[name]?.trim())
  return Number.isFinite(n) && n > 0 ? n : fallback
}

// Everything money-shaped is an estimate and says so on the page. List
// prices are what the pricing page shows; the net factor is what reaches
// you after VAT and Stripe Managed Payments' fees (roughly 0.75 for EU/UK
// consumers — adjust REVENUE_NET_FACTOR once real payouts are in).
export function moneyConfig() {
  return {
    prices: {
      practice: { monthly: num('PRICE_PRACTICE_MONTHLY_EUR', 9), yearly: num('PRICE_PRACTICE_YEARLY_EUR', 90) },
      direction: { monthly: num('PRICE_DIRECTION_MONTHLY_EUR', 29), yearly: num('PRICE_DIRECTION_YEARLY_EUR', 290) },
    },
    netFactor: num('REVENUE_NET_FACTOR', 0.75),
    eurPerUsd: num('EUR_PER_USD', 0.86),
    caps: CAPS_USD,
  }
}

export function capsMicros() {
  const out: Record<string, { soft: number; hard: number }> = {}
  for (const [plan, c] of Object.entries(CAPS_USD)) out[plan] = { soft: c.soft * 1e6, hard: c.hard * 1e6 }
  return out
}

// Dates on the calendar that need action before they bite.
export const WATCH_LIST = [
  { date: '2026-10-15', text: 'Haiku 4.5 may retire from this date. It is MODELS.fast; plan the move (and set thinking off if it goes to a Sonnet 5 model).' },
]
