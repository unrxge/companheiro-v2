// src/lib/studio/registry.ts — one TypeSpec per block type (D-011…D-014,
// region per 7.2, library copy from the brief's block table). Pure data; no React.
// Object class and accent come from canvas-tokens so the two never disagree.

import { accent, objectClass } from '@/lib/studio/canvas-tokens'
import { LIBRARY_TYPES, type BlockType, type Handle, type Registry, type TypeSpec } from '@/lib/studio/types'

/** Auto-height types: E/W and the four corners change width only (D-012). */
const WIDTH_HANDLES: readonly Handle[] = ['e', 'w', 'ne', 'nw', 'se', 'sw']
/** Fixed-size types: all eight (D-012). */
const ALL_HANDLES: readonly Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
/** Divider: width only (D-012). */
const EW_HANDLES: readonly Handle[] = ['e', 'w']
/** Image: corners only, aspect locked (6.3). */
const CORNER_HANDLES: readonly Handle[] = ['ne', 'nw', 'se', 'sw']
const NO_HANDLES: readonly Handle[] = []

/** Height is the content's for auto-height types; the DB floor is 8 (check w >= 8 and h >= 8). */
const MIN_H = 8
/** An upper bound only so resize maths has a number to clamp against. */
const NO_MAX = 8192

type Partial13 = Omit<TypeSpec, 'class' | 'accent'>

const base: Record<BlockType, Partial13> = {
  concept: {
    autoHeight: true, aspectLocked: false,
    defaultW: 1008, defaultH: 160, minW: 480, maxW: 1200, minH: MIN_H, maxH: NO_MAX,
    handles: WIDTH_HANDLES,
    selectable: true, deletable: false, duplicable: false, editableInPlace: true,
    opens: 'none', region: 'top',
    label: 'concept', holds: "the project's definition and constraints",
  },
  since: {
    autoHeight: true, aspectLocked: false,
    defaultW: 1008, defaultH: 40, minW: 480, maxW: 1200, minH: MIN_H, maxH: NO_MAX,
    handles: NO_HANDLES,
    selectable: false, deletable: false, duplicable: false, editableInPlace: false,
    opens: 'none', region: 'top',
    label: 'since you were here', holds: 'last thing said, blocks arrived from talk, whether the compass has something',
  },
  update: {
    autoHeight: true, aspectLocked: false,
    defaultW: 320, defaultH: 96, minW: 224, maxW: 512, minH: MIN_H, maxH: NO_MAX,
    handles: WIDTH_HANDLES,
    selectable: true, deletable: true, duplicable: true, editableInPlace: true,
    opens: 'none', region: 'column',
    label: 'update', holds: 'a dated entry from talk, or posted directly',
  },
  timeline: {
    autoHeight: true, aspectLocked: false,
    defaultW: 320, defaultH: 240, minW: 288, maxW: 512, minH: MIN_H, maxH: NO_MAX,
    handles: WIDTH_HANDLES,
    selectable: true, deletable: true, duplicable: false, editableInPlace: false,
    opens: 'timeline', region: 'column',
    label: 'timeline', holds: 'updates stacked by date when there are many',
  },
  draft: {
    autoHeight: true, aspectLocked: false,
    defaultW: 320, defaultH: 136, minW: 256, maxW: 448, minH: MIN_H, maxH: NO_MAX,
    handles: WIDTH_HANDLES,
    selectable: true, deletable: true, duplicable: false, editableInPlace: false,
    opens: 'draft', region: 'column',
    label: 'draft', holds: 'a piece of writing: essay, brief, copy, lyrics',
  },
  anchor: {
    autoHeight: true, aspectLocked: false,
    defaultW: 664, defaultH: 88, minW: 192, maxW: 1008, minH: MIN_H, maxH: NO_MAX,
    handles: WIDTH_HANDLES,
    selectable: true, deletable: true, duplicable: true, editableInPlace: true,
    opens: 'none', region: 'wide',
    label: 'anchor line', holds: 'a phrase the project hangs on',
  },
  note: {
    autoHeight: true, aspectLocked: false,
    defaultW: 320, defaultH: 96, minW: 160, maxW: 640, minH: MIN_H, maxH: NO_MAX,
    handles: WIDTH_HANDLES,
    selectable: true, deletable: true, duplicable: true, editableInPlace: true,
    opens: 'none', region: 'grid',
    label: 'note', holds: 'free text',
  },
  reference: {
    autoHeight: true, aspectLocked: false,
    defaultW: 320, defaultH: 112, minW: 192, maxW: 512, minH: MIN_H, maxH: NO_MAX,
    handles: WIDTH_HANDLES,
    selectable: true, deletable: true, duplicable: true, editableInPlace: true,
    opens: 'none', region: 'grid',
    label: 'reference', holds: 'a link and the words you wrote about it',
  },
  commitment: {
    autoHeight: true, aspectLocked: false,
    defaultW: 320, defaultH: 64, minW: 224, maxW: 512, minH: MIN_H, maxH: NO_MAX,
    handles: WIDTH_HANDLES,
    selectable: true, deletable: true, duplicable: false, editableInPlace: true,
    opens: 'none', region: 'column',
    label: 'commitment', holds: 'something you said you would do',
  },
  compass: {
    autoHeight: true, aspectLocked: false,
    defaultW: 320, defaultH: 200, minW: 224, maxW: 384, minH: MIN_H, maxH: NO_MAX,
    handles: WIDTH_HANDLES,
    selectable: true, deletable: false, duplicable: false, editableInPlace: false,
    opens: 'compass', region: 'column',
    label: 'compass', holds: 'refusals, non-negotiables, open commitments, drift',
  },
  frame: {
    autoHeight: false, aspectLocked: false,
    defaultW: 512, defaultH: 384, minW: 128, maxW: NO_MAX, minH: 96, maxH: NO_MAX,
    handles: ALL_HANDLES,
    selectable: true, deletable: true, duplicable: true, editableInPlace: false,
    opens: 'none', region: 'none',
    label: 'frame', holds: 'a named region holding other blocks',
  },
  heading: {
    autoHeight: true, aspectLocked: false,
    defaultW: 384, defaultH: 48, minW: 128, maxW: 1008, minH: MIN_H, maxH: NO_MAX,
    handles: WIDTH_HANDLES,
    selectable: true, deletable: true, duplicable: true, editableInPlace: true,
    opens: 'none', region: 'none',
    label: 'heading', holds: 'structure, typographic only',
  },
  divider: {
    autoHeight: false, aspectLocked: false,
    defaultW: 256, defaultH: 8, minW: 64, maxW: 1920, minH: 8, maxH: 8,
    handles: EW_HANDLES,
    selectable: true, deletable: true, duplicable: true, editableInPlace: false,
    opens: 'none', region: 'none',
    label: 'divider', holds: 'structure, typographic only',
  },
  image: {
    // height = w / aspect + caption (D-013); 240 is the 4:3 estimate before the file is known
    autoHeight: true, aspectLocked: true,
    defaultW: 320, defaultH: 240, minW: 96, maxW: 1200, minH: MIN_H, maxH: NO_MAX,
    handles: CORNER_HANDLES,
    selectable: true, deletable: true, duplicable: true, editableInPlace: false,
    opens: 'lightbox', region: 'media',
    label: 'image', holds: 'one image, for your eyes',
  },
  gallery: {
    autoHeight: false, aspectLocked: false,
    defaultW: 664, defaultH: 400, minW: 192, maxW: NO_MAX, minH: 144, maxH: NO_MAX,
    handles: ALL_HANDLES,
    selectable: true, deletable: true, duplicable: true, editableInPlace: false,
    opens: 'lightbox', region: 'media',
    label: 'gallery', holds: 'several images as a mood board',
  },
  recording: {
    autoHeight: true, aspectLocked: false,
    defaultW: 320, defaultH: 120, minW: 256, maxW: 448, minH: MIN_H, maxH: NO_MAX,
    handles: WIDTH_HANDLES,
    selectable: true, deletable: true, duplicable: true, editableInPlace: false,
    opens: 'none', region: 'media',
    label: 'recording', holds: 'audio, yours or a reference',
  },
  palette: {
    autoHeight: true, aspectLocked: false,
    defaultW: 320, defaultH: 96, minW: 192, maxW: 640, minH: MIN_H, maxH: NO_MAX,
    handles: WIDTH_HANDLES,
    selectable: true, deletable: true, duplicable: true, editableInPlace: false,
    opens: 'none', region: 'media',
    label: 'palette', holds: 'colour swatches',
  },
}

function build(): Registry {
  const out = {} as Registry
  for (const type of Object.keys(base) as BlockType[]) {
    out[type] = { class: objectClass[type], accent: accent[type], ...base[type] }
  }
  return out
}

export const registry: Registry = build()

export function spec(type: BlockType): TypeSpec {
  return registry[type]
}

/** Library tile order — identical to LIBRARY_TYPES in types.ts. */
export const LIBRARY_ORDER: readonly BlockType[] = LIBRARY_TYPES

/** The three permanent blocks every project has (D-061); never in the library. */
export const PERMANENT_TYPES: readonly BlockType[] = ['concept', 'since', 'compass'] as const

export function isPermanent(type: BlockType): boolean {
  return PERMANENT_TYPES.includes(type)
}

export function isLibraryType(type: BlockType): boolean {
  return LIBRARY_TYPES.includes(type)
}

/** Default rect for a fresh block of this type (world px, multiples of 8 for w; h is the estimate). */
export function defaultSize(type: BlockType): { w: number; h: number } {
  const s = registry[type]
  return { w: s.defaultW, h: s.defaultH }
}
