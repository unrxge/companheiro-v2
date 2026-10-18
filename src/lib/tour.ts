// The tour (/tour) is shown right after an account is activated, and stays
// reachable from Settings. Having seen it lives in the auth user's metadata
// (PATCH /api/onboarding), beside the consent record, so it follows the
// account across devices and needs no table. It does not decide where anyone
// is sent: that is whether their answers were saved (GET /api/onboarding).

/** Finished or skipped the tour slides. */
export function markTourSeen(): void {
  // keepalive: the page is navigating away as this goes out.
  fetch('/api/onboarding', { method: 'PATCH', keepalive: true }).catch(() => {})
}

// ── Who the tour is for ─────────────────────────────────────────────────────
// Asked once, on a new account's first screen, before the tour: a name, an
// date of birth, what their practice looks like and the themes their work returns to.
// The themes become their Idea Lab territories (PUT /api/onboarding); the rest
// is kept in the auth user's metadata and decides which parts of the app the
// tour shows them (see tourSlides in components/tour/slides.tsx).

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

/** The colours themes take, in order: the same in the questions and in the Idea slide. */
export const THEME_HUES = ['violet', 'tide', 'verdant', 'ochre'] as const

/** Whole years since a YYYY-MM-DD date of birth; NaN when it is not a real date. */
export function ageFrom(birthdate: string, now = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthdate)
  if (!m) return NaN
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const born = new Date(y, mo - 1, d)
  if (born.getFullYear() !== y || born.getMonth() !== mo - 1 || born.getDate() !== d) return NaN
  const had = now.getMonth() > mo - 1 || (now.getMonth() === mo - 1 && now.getDate() >= d)
  return now.getFullYear() - y - (had ? 0 : 1)
}

/** Asked on the Idea slide when questions for their own themes could not be written. About making, whatever the theme. */
export const GENERAL_QUESTIONS = [
  'What have you been practising in private, waiting for someone to say you’re allowed to call it your life’s work?',
  'If you knew the work would outlive you, what would you start making tomorrow morning?',
  'Which piece have you been saving for the day you’re good enough, and what if that day was today?',
]

/** As long as a first name is allowed to be: enough for a double name, short enough to sit in Home's greeting. */
export const MAX_NAME = 24

/** A name as it is kept and shown: one line, single spaces, nothing invisible, never longer than MAX_NAME. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  const one = raw.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202f\ufeff]/g, ' ').replace(/\s+/g, ' ').trim()
  // By whole characters, so an accent or an emoji is never cut in half.
  return Array.from(one).slice(0, MAX_NAME).join('').trim()
}

export interface TourProfile {
  name: string
  /** YYYY-MM-DD. */
  birthdate: string
  practices: Practice[]
  /** What they typed in "Something else". */
  other: string
}
