import type { AuthedContext } from '@/lib/supabase/route'
import { DEFAULT_SLOTS, isFilled, slotLabel, type FilledSlot, type TerritorySlot } from '@/lib/territories'

/** The user's configured territory slots (defaults for accounts with no row). */
export async function getUserTerritories({ supabase, user }: AuthedContext): Promise<TerritorySlot[]> {
  try {
    const { data } = await supabase.from('user_territory_config').select('slots').eq('user_id', user.id).maybeSingle()
    const slots = data?.slots
    return Array.isArray(slots) && slots.some(isFilled) ? (slots as TerritorySlot[]) : DEFAULT_SLOTS
  } catch {
    return DEFAULT_SLOTS
  }
}

export function filledTerritories(slots: TerritorySlot[]): FilledSlot[] {
  return slots.filter(isFilled)
}

/** `key — Label` lines for a prompt, so the model returns one of the user's keys. */
export function territoryPromptList(slots: TerritorySlot[]): string {
  return filledTerritories(slots)
    .map((s) => `- ${s.key} — ${slotLabel(s)}`)
    .join('\n')
}

export function territoryKeyUnion(slots: TerritorySlot[]): string {
  return filledTerritories(slots)
    .map((s) => `"${s.key}"`)
    .join(' | ')
}
