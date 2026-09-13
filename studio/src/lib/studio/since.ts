// studio/src/lib/studio/since.ts — STUB (lane A, 11.1). Lane G replaces the
// body with 8.8; the exported signature stays.

import type { SincePayload } from '@/lib/studio/types'

export function sinceSentence(
  _p: SincePayload,
  _now: Date,
  _firstOpen: boolean
): { lines: string[]; dots: boolean[] } {
  return { lines: ['first time here'], dots: [false] }
}
