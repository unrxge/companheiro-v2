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
