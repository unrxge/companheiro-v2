// The tour (/tour) is shown once, right after an account is activated, and
// stays reachable from Settings. "Seen" lives in the auth user's metadata
// (PATCH /api/onboarding), beside the consent record, so it follows the
// account across devices and needs no table. The local flag is a backstop:
// if that write fails, /home must not send the person round again.

const TOUR_SEEN_KEY = 'companheiro-tour-seen'

export function tourSeenLocally(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

/** Finished or skipped: either way it is not shown unasked again. */
export function markTourSeen(): void {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, '1')
  } catch {
    /* storage unavailable: the account record below still counts */
  }
  // keepalive: the page is navigating away as this goes out.
  fetch('/api/onboarding', { method: 'PATCH', keepalive: true }).catch(() => {})
}

// ── Who the tour is for ─────────────────────────────────────────────────────
// Asked once, on a new account's first screen, before the tour: a name, an
// age, what their practice looks like and the themes their work returns to.
// The themes become their Idea Lab territories (PUT /api/onboarding); the rest
// is kept in the auth user's metadata and decides which parts of the app the
// tour shows them (see slidesFor in components/tour/slides.tsx).

export const PRACTICES = [
  { key: 'writer', label: 'Writer' },
  { key: 'songwriter', label: 'Songwriter' },
  { key: 'cinematographer', label: 'Cinematographer' },
  { key: 'creator', label: 'Content creator' },
  { key: 'client', label: 'Client projects' },
  { key: 'director', label: 'Creative director' },
] as const
export type Practice = (typeof PRACTICES)[number]['key']
export const PRACTICE_KEYS: readonly Practice[] = PRACTICES.map((p) => p.key)
export const MAX_PRACTICES = 3
export const MAX_THEMES = 4
/** The Terms' minimum age. */
export const MIN_AGE = 18

export interface TourProfile {
  name: string
  age: number
  practices: Practice[]
  /** What they typed in "Something else". */
  other: string
}
