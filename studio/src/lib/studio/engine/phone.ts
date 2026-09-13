// studio/src/lib/studio/engine/phone.ts — D-039. The canvas is never arranged on
// a phone: it is read there. iPads (744 px and up) stay in builder mode, because
// a tablet with a pencil is a desk.

export const PHONE_MAX = 720
export const COARSE_MAX = 740

export function isPhone(): boolean {
  if (typeof window === 'undefined') return false
  const w = window.innerWidth
  if (w < PHONE_MAX) return true
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  return coarse && w < COARSE_MAX
}
