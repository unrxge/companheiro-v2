'use client'

import { useEffect, useState } from 'react'

/**
 * Is this a phone? Asked of the device, not the window: a touch screen whose
 * short side is under 600 CSS pixels and which is clearly taller than wide.
 *
 * - A tablet's short side starts at 600 (iPad mini: 744), so it is never one.
 * - A foldable opened flat is near square (the first Galaxy Fold: 717 × 512),
 *   which the shape test lets through as a small tablet. Folded shut, its
 *   cover screen is a phone's (344 × 882) and is treated as one; the answer
 *   follows the fold as it opens and closes.
 * - A narrow browser window on a computer has a mouse, so it is never one.
 *
 * This is for what a phone should not be asked to do (arranging the canvas).
 * Layout that only depends on room uses a width media query instead.
 */
const PHONE_SHORT_SIDE = 600
const PHONE_SHAPE = 1.5

/** The size half of the question: is a touch screen this big a phone's? */
export function phoneSized(width: number, height: number): boolean {
  const short = Math.min(width, height)
  const long = Math.max(width, height)
  return short > 0 && short < PHONE_SHORT_SIDE && long / short > PHONE_SHAPE
}

export function isPhone(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  if (!window.matchMedia('(pointer: coarse)').matches) return false
  return phoneSized(window.screen.width, window.screen.height)
}

/** False on the server and on the first paint, then the device's answer. */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const check = () => setPhone(isPhone())
    check()
    const pointer = window.matchMedia('(pointer: coarse)')
    window.addEventListener('resize', check)
    pointer.addEventListener?.('change', check)
    return () => {
      window.removeEventListener('resize', check)
      pointer.removeEventListener?.('change', check)
    }
  }, [])
  return phone
}

/**
 * True where nothing can hover (a touch screen of any size). Controls that a
 * mouse reveals by resting on a card are simply shown there; without this
 * they stay invisible, and an invisible button can still be pressed.
 */
export function useNoHover(): boolean {
  const [none, setNone] = useState(false)
  useEffect(() => {
    const q = window.matchMedia('(hover: none)')
    const check = () => setNone(q.matches)
    check()
    q.addEventListener?.('change', check)
    return () => q.removeEventListener?.('change', check)
  }, [])
  return none
}
