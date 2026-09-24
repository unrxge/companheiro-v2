import Stripe from 'stripe'

let client: Stripe | null = null

export function getStripe(): Stripe {
  if (client) return client
  // Trimmed: a pasted trailing newline ends up in the Authorization header,
  // and the SDK reports that as a generic connection error.
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  client = new Stripe(key)
  return client
}
