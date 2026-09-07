// Territories are the person's own themes. Four predefined ones exist for the
// original account; everyone else seeds theirs in onboarding. Keys are stored
// as text on captures/ideas/pieces; labels resolve through the user's slots.

import type { Hue } from '@/lib/design-tokens'

export type PredefinedSlot = { type: 'predefined'; key: string }
export type CustomSlot = { type: 'custom'; key: string; label: string; rangeMap?: string; facetSeeds?: string[] }
export type TerritorySlot = PredefinedSlot | CustomSlot | null
export type FilledSlot = PredefinedSlot | CustomSlot

export const MAX_TERRITORY_SLOTS = 8

export const PREDEFINED_TERRITORIES: Record<string, { label: string; short: string; hue: Hue }> = {
  creativity_devotion_curiosity: { label: 'Creativity, devotion & curiosity', short: 'Creativity & Devotion', hue: 'ember' },
  healthy_masculinity_emotional_regulation: { label: 'Healthy masculinity & emotional regulation', short: 'Healthy Masculinity', hue: 'tide' },
  inner_child_tending_expression: { label: 'Inner child tending & expression', short: 'Inner Child', hue: 'ochre' },
  slow_living_life_in_service: { label: 'Slow living & life in service', short: 'Slow Living', hue: 'verdant' },
}

export const DEFAULT_SLOTS: TerritorySlot[] = Object.keys(PREDEFINED_TERRITORIES).map((key) => ({ type: 'predefined', key }))

const CUSTOM_HUES: Hue[] = ['ember', 'verdant', 'violet', 'ochre', 'tide']

export function isFilled(s: TerritorySlot): s is FilledSlot {
  return s != null
}

/** Human label for a stored territory key, using the user's slots when known. */
export function territoryLabel(key: string | null | undefined, slots?: TerritorySlot[]): string {
  if (!key) return ''
  const pre = PREDEFINED_TERRITORIES[key]
  if (pre) return pre.label
  const custom = slots?.find((s): s is CustomSlot => !!s && s.type === 'custom' && s.key === key)
  if (custom) return custom.label
  // Unknown key (e.g. a deleted custom territory): make it readable.
  return key.replace(/^custom_\d+_?/, '').replace(/_/g, ' ') || 'Territory'
}

export function territoryShort(key: string | null | undefined, slots?: TerritorySlot[]): string {
  if (!key) return ''
  const pre = PREDEFINED_TERRITORIES[key]
  if (pre) return pre.short
  return territoryLabel(key, slots)
}

export function territoryHue(key: string | null | undefined, slots?: TerritorySlot[]): Hue {
  if (!key) return 'ember'
  const pre = PREDEFINED_TERRITORIES[key]
  if (pre) return pre.hue
  const idx = (slots ?? []).filter(isFilled).findIndex((s) => s.key === key)
  return CUSTOM_HUES[(idx < 0 ? key.length : idx) % CUSTOM_HUES.length]
}

export function slotLabel(s: FilledSlot): string {
  return s.type === 'predefined' ? PREDEFINED_TERRITORIES[s.key]?.label ?? s.key : s.label
}

export function slotShort(s: FilledSlot): string {
  return s.type === 'predefined' ? PREDEFINED_TERRITORIES[s.key]?.short ?? s.key : s.label
}

/** Turn a free-text label into a stable custom key. */
export function customKey(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return `custom_${Date.now()}_${slug || 'theme'}`
}

/**
 * Server-side: resolve whatever the model or the user typed to one of the
 * user's territory keys. Exact key → label match → word overlap → first slot.
 */
export function resolveTerritoryKey(raw: string | null | undefined, slots: TerritorySlot[]): string | null {
  const filled = slots.filter(isFilled)
  if (filled.length === 0) return raw || null
  if (!raw) return filled[0].key
  const r = raw.trim().toLowerCase()
  const exact = filled.find((s) => s.key.toLowerCase() === r)
  if (exact) return exact.key
  const byLabel = filled.find((s) => slotLabel(s).toLowerCase() === r)
  if (byLabel) return byLabel.key
  const words = r.split(/[^a-z0-9à-ú]+/).filter((w) => w.length > 3)
  let best: { key: string; score: number } | null = null
  for (const s of filled) {
    const hay = `${s.key} ${slotLabel(s)}`.toLowerCase()
    const score = words.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0)
    if (score > 0 && (!best || score > best.score)) best = { key: s.key, score }
  }
  return best?.key ?? filled[0].key
}
