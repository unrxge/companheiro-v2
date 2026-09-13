'use client'

// studio/src/components/canvas/links/links-layer.tsx — STUB (lane A, 11.1).
// Lane D replaces the body with the world-space SVG of hairline links (D-023);
// the exported names and the LinksApi shape stay. Lane B mounts it inside
// [data-world] and calls the ref API during drags.

import { forwardRef, useImperativeHandle } from 'react'
import type { Point } from '@/lib/studio/types'

export interface LinksApi {
  /** Shift the endpoints of every link touching `ids` by `d` (world px) during a drag. */
  updateFor(ids: Set<string>, d: Point): void
  /** Redraw every link from the store. */
  redraw(): void
}

export const LinksLayer = forwardRef<LinksApi, { children?: never }>(function LinksLayer(_props, ref) {
  useImperativeHandle(ref, () => ({ updateFor() {}, redraw() {} }), [])
  return (
    <svg
      data-links
      aria-hidden
      width={1}
      height={1}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
    />
  )
})
