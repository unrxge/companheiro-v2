// Usage analytics: what the maker can see about how an account uses the app.
//
// What it is: which parts of the project side of the app someone uses, and how
// each project moves from started to finished, as dates, counts and fixed
// choices (a stage, a kind). What it never is: anything a person wrote (no
// titles, no text, no conversation), and nothing at all from check-ins,
// captures, ideas, the portrait or letters. The routes that build it
// (/api/admin/people) select columns by name for that reason; lib/ops/people.ts
// lists them.
//
// It is on unless someone switches it off (Settings → Share usage analytics),
// but nobody's is shown before they have been told it exists: either they
// agreed to a Privacy Policy that describes it when they signed up, or they
// have been shown the notice (the tour's last slide, or the card on Home that
// older accounts get once).
//
// Where the choice is kept: on the auth user's metadata, beside the record of
// which Terms they agreed to, so it needs no table:
//
//   user_metadata.usage_analytics = { on, told_at, changed_at? }

/** The first Privacy Policy version that describes usage analytics. */
export const ANALYTICS_POLICY_VERSION = '2026-10-12'

interface Metadata {
  usage_analytics?: { on?: boolean; told_at?: string | null } | null
  consent?: { privacy?: string } | null
}

export interface AnalyticsChoice {
  /** False only when they have switched it off. */
  on: boolean
  /** They have been told it exists, one way or the other. */
  told: boolean
}

export function analyticsChoiceOf(metadata: unknown): AnalyticsChoice {
  const m = (metadata ?? {}) as Metadata
  const agreedTo = typeof m.consent?.privacy === 'string' ? m.consent.privacy : ''
  return {
    on: m.usage_analytics?.on !== false,
    told: !!m.usage_analytics?.told_at || agreedTo >= ANALYTICS_POLICY_VERSION,
  }
}

/** Whether this account's usage may be shown to the maker. */
export function sharesAnalytics(metadata: unknown): boolean {
  const { on, told } = analyticsChoiceOf(metadata)
  return on && told
}
