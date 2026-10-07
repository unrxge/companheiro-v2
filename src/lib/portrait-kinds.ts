// Shared by the portrait page and past check-ins, so a pattern is named and
// coloured the same way wherever it shows.
export type PortraitKind = 'processing_pattern' | 'recurring_theme' | 'creative_pattern' | 'guidance_note'

export const KIND_LABELS: Record<PortraitKind, string> = {
  processing_pattern: 'How you process things',
  recurring_theme: 'What keeps recurring',
  creative_pattern: 'How you develop ideas',
  guidance_note: 'What kind of guidance works',
}

export const KIND_HUE: Record<PortraitKind, 'tide' | 'ochre' | 'ember' | 'verdant'> = {
  processing_pattern: 'tide',
  recurring_theme: 'ochre',
  creative_pattern: 'ember',
  guidance_note: 'verdant',
}

/** A pattern nothing has reinforced for this long leaves the portrait. */
export const DECAY_DAYS = 150
