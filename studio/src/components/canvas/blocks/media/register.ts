// studio/src/components/canvas/blocks/media/register.ts — registers the four media
// types (lane E). Image and gallery own their first row (no eyebrow, 6.2);
// recording and palette are paper blocks and take the shell's `TYPE · DATE`.
// The exported signature is lane A's (11.1) and stays.

import { registerBlock } from '@/components/canvas/blocks/registry'
import { ImageBlock } from '@/components/canvas/blocks/media/image'
import { GalleryBlock } from '@/components/canvas/blocks/media/gallery'
import { RecordingBlock } from '@/components/canvas/blocks/media/recording'
import { PaletteBlock } from '@/components/canvas/blocks/media/palette'
import { GallerySettings, ImageSettings, PaletteSettings, RecordingSettings } from '@/components/canvas/blocks/media/settings'
import { GallerySheet, ImageSheet, PaletteSheet, RecordingSheet } from '@/components/canvas/blocks/media/sheets'

export function registerMediaBlocks(): void {
  registerBlock('image', { Renderer: ImageBlock, Settings: ImageSettings, Sheet: ImageSheet, eyebrow: 'none' })
  registerBlock('gallery', { Renderer: GalleryBlock, Settings: GallerySettings, Sheet: GallerySheet, eyebrow: 'none' })
  registerBlock('recording', { Renderer: RecordingBlock, Settings: RecordingSettings, Sheet: RecordingSheet, eyebrow: 'shell' })
  registerBlock('palette', { Renderer: PaletteBlock, Settings: PaletteSettings, Sheet: PaletteSheet, eyebrow: 'shell' })
}
