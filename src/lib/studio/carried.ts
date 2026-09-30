// Something said elsewhere in the app (a check-in, so far) and brought to a
// project by the person's own tap. It is stored in the project's conversation
// as their message, opening with this marker, so the companion knows it
// arrived from outside and the conversation can label it. No schema change.

export const CARRIED_MARKER = '[brought from a check-in]'

/** Splits a stored person message into its words and whether it was carried in. */
export function readCarried(text: string): { carried: boolean; text: string } {
  if (!text.startsWith(CARRIED_MARKER)) return { carried: false, text }
  return { carried: true, text: text.slice(CARRIED_MARKER.length).trim() }
}
