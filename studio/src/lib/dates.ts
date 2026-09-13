// "Wednesday (3 days ago)" — the date format the user asked for wherever
// the system references a specific day.
export function formatDateAsRelative(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const daysAgo = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' })
  return `${dayOfWeek} (${daysAgo} days ago)`
}
