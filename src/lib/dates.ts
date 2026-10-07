const DAY = 86_400_000

// Whole calendar days between a date and now, in the reader's own timezone,
// so something from late last night is "yesterday" and not "0 days ago".
function daysSince(date: Date, now: Date): number {
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.max(0, Math.round((midnight(now) - midnight(date)) / DAY))
}

// Spelled out here because browsers and servers disagree on short month
// names ("Sep" in one, "Sept" in another), and the same date must read the
// same wherever it is rendered.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayMonth(date: Date, now: Date): string {
  const base = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  return date.getFullYear() !== now.getFullYear() ? `${base} ${date.getFullYear()}` : base
}

function span(days: number): string {
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  const years = Math.floor(days / 365)
  return `${years} ${years === 1 ? 'year' : 'years'} ago`
}

// A specific day, said the way a person would. Within the week the weekday is
// what orients ("Wednesday (3 days ago)"); past a week the weekday tells
// nobody anything, so it becomes the date ("12 Sep (3 weeks ago)").
export function formatDateAsRelative(dateStr: string, now = new Date()): string {
  const date = new Date(dateStr)
  const days = daysSince(date, now)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${date.toLocaleDateString('en-US', { weekday: 'long' })} (${days} days ago)`
  return `${dayMonth(date, now)} (${span(days)})`
}

// The same day in as few characters as it takes, for dense lines that list
// several dates: "today", "yesterday", "3 days ago", then just "12 Sep".
export function formatDateShort(dateStr: string, now = new Date()): string {
  const date = new Date(dateStr)
  const days = daysSince(date, now)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return dayMonth(date, now)
}
