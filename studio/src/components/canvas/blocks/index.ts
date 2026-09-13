// studio/src/components/canvas/blocks/index.ts — registerAll() (lane A): calls the
// three register files once. Idempotent so HMR and a second CanvasProvider mount
// never double-register.

import { registerTextBlocks } from '@/components/canvas/blocks/text/register'
import { registerRichBlocks } from '@/components/canvas/blocks/rich/register'
import { registerMediaBlocks } from '@/components/canvas/blocks/media/register'

let done = false

export function registerAll(): void {
  if (done) return
  done = true
  registerTextBlocks()
  registerRichBlocks()
  registerMediaBlocks()
}

export { registerBlock, getRegistration, getRenderer, isRegistered } from '@/components/canvas/blocks/registry'
export type { BlockRendererProps, BlockSettingsProps, BlockSheetProps, BlockRegistration, BlockOf } from '@/components/canvas/blocks/registry'
