// Where everything on each example's canvas stands when a new account first
// opens it: the arrangement the owner left by hand, read from their account
// on 2026-10-18 with scripts/example-layout.mjs and written here as the
// default (the person's decision). Anyone can still drag things about; that is
// kept in their own browser (layout.ts) and laid over this.
//
// Coordinates are the board's own units: x from the world's left edge, y from
// where the cards rest. They only line up with the cards because an example's
// cards are drawn at one fixed size whatever the window (EXAMPLE_FRAME), the
// size they had when this was arranged.

import type { Edit } from '@/lib/examples/layout'

/** The window an example's cards are sized for, so this arrangement holds on every screen. */
export const EXAMPLE_FRAME = { w: 1440, h: 900 } as const

export interface Arrangement {
  /** By the id's own part (after `example-<key>--`): where it stands. */
  spots: Record<string, readonly [number, number]>
  /** Widths, names and how many rows a list shows, as they were left. */
  edits: Record<string, Edit>
}

export const ARRANGED: Record<string, Arrangement> = {
  writer: {
    spots: {
      'item-1': [467, 184],
      'thread-mia': [2519, 714],
      'thread-notebook': [1823, 723],
      'thread-unsaid': [1161, 726],
    },
    edits: {
    },
  },
  songwriter: {
    spots: {
      'item-1': [426, 189],
      'item-2': [2345, 689],
      'item-3': [866, 661],
      'thread-hands': [1620, 689],
      'thread-radio': [2000, 677],
      'thread-tuning': [2940, 687],
    },
    edits: {
      'item-1': { w: 291, rows: 12 },
    },
  },
  series: {
    spots: {
      'item-1': [893, 707],
      'item-2': [2288, 701],
      'thread-map': [1901, 703],
      'thread-silence': [1382, 752],
      'thread-sodium': [1711, 880],
    },
    edits: {
      'item-1': { title: "Color mood" },
      'item-2': { w: 318, rows: 7 },
    },
  },
  studio: {
    spots: {
      'item-1': [2006, 873],
      'item-2': [1452, 700],
      'thread-handwriting': [1846, 722],
      'thread-regulars': [1131, 678],
      'thread-tile': [2262, 683],
    },
    edits: {
      'item-1': { title: "Brand tones" },
      'item-2': { w: 298, rows: 7 },
    },
  },
  director: {
    spots: {
      'item-1': [883, 716],
      'item-2': [471, 184],
      'item-3': [1349, 732],
      'item-4': [1666, 656],
      'item-5': [2221, 813],
      'item-6': [971, 892],
      'thread-arriving': [1770, 1133],
      'thread-marks': [2401, 666],
      'thread-workshop': [2071, 669],
    },
    edits: {
      'item-1': { w: 258, title: "...mood? TBC w/ client" },
      'item-2': { w: 260, rows: 8 },
      'item-3': { w: 347 },
      'item-4': { w: 274 },
      'item-5': { w: 250 },
    },
  },
}
