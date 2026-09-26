// src/lib/studio/layout/constants.ts — layout constants (7.0) plus the two
// rounding helpers every layout module shares. World px. Pure; isomorphic.

export const U = 8
/** column width */
export const W = 320
/** gutter */
export const G = 24
/** 3W + 2G */
export const FULL = 3 * W + 2 * G
/** 2W + G */
export const WIDE = 2 * W + G
/** between blocks in a column */
export const ROW_GAP = 24
/** between bands */
export const BAND_GAP = 48
/** concept → since */
export const SINCE_GAP = 8
/** bbox → arrivals column */
export const ARRIVAL_GAP = 48
export const ARRIVAL_COL_STEP = 344
export const ARRIVAL_MAX_BELOW = 384

/** Skyline avoidance: how far an obstacle is grown on each side before testing intersection (7.2). */
export const AVOID_INSET = 8
/** Upper bound on skyline drops for one rect (7.2). */
export const AVOID_MAX_ITERATIONS = 500

/** Nearest multiple of U (D-001: x, y, w are multiples of 8). */
export function snap8(v: number): number {
  return Math.round(v / U) * U
}

/** Next multiple of U at or above v (D-001: heights round UP). */
export function ceil8(v: number): number {
  return Math.ceil(v / U) * U
}
