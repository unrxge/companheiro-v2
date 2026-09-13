// studio/src/components/canvas/blocks/rich/register.ts — lane D registers the
// three rich types: draft (card + posture settings + read-only sheet), compass
// (read-only compact + open + the compass sheet) and frame (region + tint /
// collapse settings + a sheet listing what it holds). Called once by
// registerAll(); safe to call again (the registry replaces).

import { registerBlock } from '@/components/canvas/blocks/registry'
import { CompassBlock } from '@/components/canvas/blocks/rich/compass-block'
import { DraftCard } from '@/components/canvas/blocks/rich/draft-card'
import { FrameBlock } from '@/components/canvas/blocks/rich/frame'
import { CompassSettings, DraftSettings, FrameSettings } from '@/components/canvas/blocks/rich/settings'
import { CompassBlockSheet, DraftSheet, FrameSheet } from '@/components/canvas/blocks/rich/sheets'

export function registerRichBlocks(): void {
  // the card owns its first row: the violet dot sits before the eyebrow (6.2)
  registerBlock('draft', { Renderer: DraftCard, Settings: DraftSettings, Sheet: DraftSheet, eyebrow: 'none' })
  registerBlock('compass', { Renderer: CompassBlock, Settings: CompassSettings, Sheet: CompassBlockSheet, eyebrow: 'shell' })
  registerBlock('frame', { Renderer: FrameBlock, Settings: FrameSettings, Sheet: FrameSheet, eyebrow: 'none' })
}
