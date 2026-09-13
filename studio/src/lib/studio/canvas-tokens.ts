// studio/src/lib/studio/canvas-tokens.ts — canvas-only tokens. Extends design-tokens.ts; never re-declares shell/surfaces.
import { alpha, fonts, radius, shell, type Theme, type Tokens } from '@/lib/design-tokens'
import type { BlockType, Hue, ObjectClass } from '@/lib/studio/types'

export const grid = {
  U: 8,
  step: (k: number) => (k < 0.5 ? 64 : k < 1.5 ? 32 : 8),
  fade: (k: number) => Math.max(0, Math.min(1, (k - 0.25) / 0.25)),
  dotRadiusPx: 1,
  dotAlpha: { light: 0.16, dark: 0.10 } as Record<Theme, number>,
} as const

export const geometry = {
  topBarH: 48, railW: 48, libraryPanelW: 280, rightDockW: 320,
  drawerW: 420, draftDrawerW: 760, contextBarH: 32, zoomPillH: 28, talkPillH: 44,
  stageRadiusTop: radius.container,          // 28
  paperPadding: 16, captionInset: 16, frameBarH: 48, frameInnerPad: 16,
  eyebrowH: 16, eyebrowGap: 8,
  handlePx: 8, handleHitPx: 16, markerPx: 8,
} as const

export const radii = {
  block: 12, frame: 16, panel: 16, media: 10, tile: 8, swatch: 6, contextBar: 10, handle: 0, pill: 999,
} as const

export const line = {
  chrome: shell.line,                                   // rgba(236,233,226,0.14) — docks, panels, drawer edges
  chromeSoft: 'rgba(236,233,226,0.08)',                 // rows inside panels
  onPaper: (t: Tokens) => alpha(t.textPrimary, 0.12),   // rows inside cards, divider block
  hover: (t: Tokens) => alpha(t.textPrimary, 0.14),     // hover ring on blocks
  frame: (t: Tokens) => alpha(t.textPrimary, 0.18),     // dashed 4/4
  link: (t: Tokens) => alpha(t.textPrimary, 0.35),
  arrival: (t: Tokens) => alpha(t.tide, 0.7),           // dashed 3/3 outline while unplaced
} as const

export const pencil = {
  selection: (t: Tokens) => t.tide,
  selectionHover: (t: Tokens) => alpha(t.tide, 0.45),
  marquee: (t: Tokens) => ({ stroke: t.tide, fill: alpha(t.tide, 0.08) }),
  guide: (t: Tokens) => t.ember,                        // ember is the system's pencil (D-043)
  strike: (t: Tokens) => t.ember,
  marker: (t: Tokens) => t.tide,                        // arrival dot
  labelPill: { bg: 'rgba(13,12,11,0.88)', text: (t: Tokens) => t.ember, padding: '2px 5px', radius: 4 },
} as const

export const glass = {
  bg: 'rgba(13,12,11,0.74)',
  filter: 'blur(18px) saturate(1.1)',
  text: shell.text, muted: shell.muted,
  rowHover: shell.fill, rowActive: shell.fillHover,
} as const

export const shadow = {
  rest: 'none', hover: 'none',
  drag: '0 12px 28px rgba(0,0,0,0.45)',
  drawer: '-24px 0 60px rgba(0,0,0,0.5)',
} as const

/** Meaning palette on blocks: colour only where it carries meaning. */
export const accent: Record<BlockType, Hue | null> = {
  concept: null, since: null, update: null, timeline: null, draft: 'violet', anchor: 'ochre', note: null,
  reference: null, commitment: 'verdant', compass: null, frame: null, heading: null, divider: null,
  image: null, gallery: null, recording: null, palette: null,
}

export const objectClass: Record<BlockType, ObjectClass> = {
  concept: 'paper', since: 'paperless', update: 'paper', timeline: 'paper', draft: 'paper', anchor: 'paperless',
  note: 'paper', reference: 'paper', commitment: 'paper', compass: 'paper', frame: 'paperless', heading: 'paperless',
  divider: 'paperless', image: 'media', gallery: 'media', recording: 'paper', palette: 'paper',
}

export const canvasType = {
  eyebrow:  { fontFamily: fonts.mono, fontWeight: 500, fontSize: 10, lineHeight: '16px', letterSpacing: '0.1em', textTransform: 'uppercase' as const },
  meta:     { fontFamily: fonts.mono, fontWeight: 400, fontSize: 11, lineHeight: 1.4, fontVariantNumeric: 'tabular-nums' as const },
  label:    { fontFamily: fonts.mono, fontWeight: 400, fontSize: 10, lineHeight: 1.2, letterSpacing: '0.08em', textTransform: 'uppercase' as const },
  body:     { fontFamily: fonts.ui, fontWeight: 400, fontSize: 15, lineHeight: 1.55 },
  small:    { fontFamily: fonts.ui, fontWeight: 400, fontSize: 13, lineHeight: 1.5 },
  words:    { fontFamily: fonts.ui, fontWeight: 500, fontSize: 16, lineHeight: 1.5, letterSpacing: '-0.01em' },   // the person's own words
  title:    { fontFamily: fonts.ui, fontWeight: 600, fontSize: 18, lineHeight: 1.25, letterSpacing: '-0.015em' },
  conceptTitle: { fontFamily: fonts.display, fontWeight: 600, fontSize: 22, lineHeight: 1.15, letterSpacing: '-0.02em' },
  conceptBody:  { fontFamily: fonts.display, fontWeight: 500, fontSize: 17, lineHeight: 1.45, letterSpacing: '-0.015em' },
  anchor:   { fontFamily: fonts.display, fontWeight: 700, fontSize: 32, lineHeight: 1.1, letterSpacing: '-0.025em', textWrap: 'balance' as const },
  headingLg:{ fontFamily: fonts.display, fontWeight: 700, fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.02em' },
  headingMd:{ fontFamily: fonts.ui, fontWeight: 600, fontSize: 18, lineHeight: 1.2, letterSpacing: '-0.015em' },
  chip:     { fontFamily: fonts.mono, fontWeight: 400, fontSize: 10, lineHeight: 1.2 },
} as const

export const motionSpec = {
  ease: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  hoverMs: 150, panelMs: 220, arrivalEnterMs: 600, tidyMs: 320, strikeMs: 300, drawerMs: 260,
  markerPulse: { from: 0.6, to: 1, periodMs: 2400 },
  atmosphereIntensity: 0.5,
} as const

export const zIndex = { world: 0, overlay: 10, chrome: 20, contextBar: 21, drawer: 30, dialog: 40 } as const
