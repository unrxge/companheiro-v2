// Which copy of the app this is.
//
//   live   companheiro.app, built from `main`, the database real people use
//   lab    any other branch Vercel builds (the `lab` branch above all), on its
//          own database and Stripe's test mode
//   local  a dev server on this machine
//
// Server-only: Vercel sets VERCEL_ENV for builds and functions, not for the
// browser. Read it in server components and routes and pass the answer down.

export type DeployEnv = 'live' | 'lab' | 'local'

/** The Supabase project behind companheiro.app. Public (it is in the site's own scripts). */
export const LIVE_SUPABASE_REF = 'qtyihplgqaqcbzkvjnld'

export function deployEnv(): DeployEnv {
  const env = process.env.VERCEL_ENV?.trim()
  if (env === 'production') return 'live'
  if (env === 'preview') return 'lab'
  return 'local'
}

export const IS_LAB = deployEnv() === 'lab'

/**
 * Stops a build that is wired to the wrong side: a lab build pointed at the
 * live database or at Stripe's live mode, or a live build pointed anywhere
 * but the live database. Called from next.config.ts, so a miswired deployment
 * never goes up; Vercel keeps serving the last good one.
 *
 * If the live database ever moves to another Supabase project, change
 * LIVE_SUPABASE_REF in the same commit.
 */
export function assertWiring(): void {
  const env = deployEnv()
  if (env === 'local') return

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const onLiveDatabase = url.includes(LIVE_SUPABASE_REF)
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? ''
  const onLiveStripe = /^(sk|rk)_live_/.test(stripeKey)

  const problems: string[] = []
  if (env === 'lab' && onLiveDatabase) {
    problems.push(
      'This is a lab build, but NEXT_PUBLIC_SUPABASE_URL is the live database. ' +
        'In Vercel → Settings → Environment Variables, give the Preview environment the lab project\'s ' +
        'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.',
    )
  }
  if (env === 'lab' && onLiveStripe) {
    problems.push(
      'This is a lab build, but STRIPE_SECRET_KEY is a live key. ' +
        'Give the Preview environment Stripe\'s test-mode key, webhook secret and price ids.',
    )
  }
  if (env === 'live' && !onLiveDatabase) {
    problems.push(
      'This is the live build, but NEXT_PUBLIC_SUPABASE_URL is not the live database. ' +
        'Check the Production values in Vercel → Settings → Environment Variables.',
    )
  }
  if (problems.length) {
    throw new Error(`\n\nBuild stopped: wrong database or payments for this environment.\n\n- ${problems.join('\n- ')}\n`)
  }
}
