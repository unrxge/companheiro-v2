// Whether a person's Project Board shows the example projects at all. Kept
// apart from the examples themselves so Settings can ask without loading them.

/** Accounts made from this day on see the examples unless they put them away. */
export const EXAMPLES_FROM = '2026-10-17'

/** The choice kept in the auth user's metadata (`examples`), beside the consent record. */
export interface ExamplesChoice { on: boolean; changed_at?: string }

/**
 * Whether the examples are on the Project Board. A choice the person made
 * (Settings, or "Put these away" on the board) always wins. Without one, a
 * new account sees them and an account from before they existed does not:
 * nobody with a board of their own work should find four strangers' projects
 * appear on it one morning.
 */
export function examplesShown(metadata: Record<string, unknown> | null | undefined, accountCreatedAt: string | null | undefined): boolean {
  const kept = metadata?.examples as Partial<ExamplesChoice> | undefined
  if (kept && typeof kept.on === 'boolean') return kept.on
  const made = accountCreatedAt ? new Date(accountCreatedAt).getTime() : NaN
  return Number.isFinite(made) && made >= new Date(`${EXAMPLES_FROM}T00:00:00Z`).getTime()
}
