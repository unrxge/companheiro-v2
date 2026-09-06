// ─────────────────────────────────────────────────────────────────────────────
// Companheiro design tokens — "Inner Weather"
//
// The whole visual system lives here. Pages never hard-code a colour, radius,
// font or shadow; they import from this file (usually via `useTheme()`).
//
// Three layers, always:
//   shell      — constant ink + atmosphere (never toggles)
//   container  — bone (light) or coal (dark), calm, never coloured
//   card       — paper, the only place text lives; colour appears only in widgets
//
// `tokensFor(theme)` returns the same keys the old `cardPalette[theme]` had
// (containerBg, cardBg, textPrimary, …) so migrating a page is an import swap.
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react'

export type Theme = 'light' | 'dark'
export type Hue = 'ember' | 'verdant' | 'violet' | 'ochre' | 'tide'
export type Mood = Hue | 'neutral'

// ── Shell ────────────────────────────────────────────────────────────────────
export const shell = {
  ink: '#0d0c0b',
  ink2: '#171512',
  text: '#ece9e2',
  muted: '#8a857c',
  line: 'rgba(236,233,226,0.14)',
  fill: 'rgba(236,233,226,0.06)',
  fillHover: 'rgba(236,233,226,0.12)',
  /** Static fallback for surfaces that cannot host the animated Atmosphere. */
  background: 'radial-gradient(ellipse at 50% 0%, #171512 0%, #0d0c0b 65%)',
} as const

// ── Surfaces + text, per theme ───────────────────────────────────────────────
const surfaces = {
  light: {
    containerBg: '#ece8de',
    containerShadow: '0 30px 70px rgba(0, 0, 0, 0.45)',
    cardBg: '#fbfaf7',
    cardBgInner: '#f3f0e9',
    textPrimary: '#1a1815',
    textSecondary: '#5f5b54',
    textMuted: '#807b72',
    divider: '#dfdad0',
    inputBg: '#f1eee7',
    inputBorder: '#dcd7cc',
    shadow: '0 12px 28px rgba(26, 24, 21, 0.10)',
    /** Ink-on-paper inversion for the Quiet button. */
    inverseBg: '#1a1815',
    inverseText: '#fbfaf7',
  },
  dark: {
    containerBg: '#161412',
    containerShadow: '0 30px 70px rgba(0, 0, 0, 0.6)',
    cardBg: '#231f1b',
    cardBgInner: '#2a2620',
    textPrimary: '#ece9e2',
    textSecondary: '#aaa59c',
    textMuted: '#7d786f',
    divider: '#352f29',
    inputBg: '#1c1916',
    inputBorder: '#352f29',
    shadow: '0 12px 28px rgba(0, 0, 0, 0.45)',
    inverseBg: '#ece9e2',
    inverseText: '#0d0c0b',
  },
} as const

// ── Meaning palette (validated for colour-vision separation, both themes) ───
const meaning = {
  light: { ember: '#d2552f', verdant: '#2f9e6b', violet: '#6f5fd8', ochre: '#c9932a', tide: '#3b8bd0', danger: '#d13f3f' },
  dark: { ember: '#e0674a', verdant: '#39a875', violet: '#8a7cea', ochre: '#bf8a30', tide: '#4f9ad6', danger: '#e05656' },
} as const

export type MeaningKey = keyof typeof meaning.light

/** hex → rgba string at the given alpha. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

// ── Atmosphere hue fields (shell only — high chroma allowed here, nowhere else)
export const atmosphereHues: Record<Mood, [string, string, string]> = {
  ember: ['#6f2a1a', '#3a2a1a', '#1e3b5c'],
  verdant: ['#2d5a3a', '#1e3b5c', '#3a2a1a'],
  violet: ['#3a2a6a', '#1e3b5c', '#2d3a5a'],
  ochre: ['#5a3f14', '#6f2a1a', '#2d3a2a'],
  tide: ['#1e3b5c', '#2d5a3a', '#3a2a6a'],
  neutral: ['#2a2622', '#1a1816', '#22201c'],
}

// ── Vocabulary → hue ─────────────────────────────────────────────────────────
export type Arc = 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration'
export const arcHue: Record<Arc, Hue> = {
  Breakaway: 'ember',
  Beginning: 'verdant',
  Expansion: 'violet',
  Integration: 'ochre',
}

export type BoardColumn = 'queue' | 'active' | 'completed'
export const columnHue: Record<BoardColumn, Hue> = {
  queue: 'ochre',
  active: 'verdant',
  completed: 'violet',
}

/** The six steps every piece walks. `stage` in the DB maps onto these. */
export const PIECE_JOURNEY = ['concept', 'write', 'test', 'shape', 'post', 'reflect'] as const
export type JourneyStep = (typeof PIECE_JOURNEY)[number]
export const JOURNEY_LABELS: Record<JourneyStep, string> = {
  concept: 'Concept',
  write: 'Write',
  test: 'Test',
  shape: 'Shape',
  post: 'Post',
  reflect: 'Reflect',
}
/** DB `pieces.stage` → journey step. */
export function journeyStepFromStage(stage: string | null | undefined): JourneyStep {
  switch (stage) {
    case 'queued':
    case 'conceptualising':
      return 'concept'
    case 'writing':
      return 'write'
    case 'translating':
      return 'shape'
    case 'executing':
      return 'post'
    case 'posted':
      return 'reflect'
    default:
      return 'write'
  }
}

export const toneHue: Record<string, Hue> = {
  grounded: 'verdant',
  restless: 'ochre',
  tender: 'ember',
  expansive: 'violet',
  urgent: 'ember',
}

// ── Scales ───────────────────────────────────────────────────────────────────
export const radius = { field: 10, widget: 16, card: 22, container: 28 } as const
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 } as const
export const widths = { page: 1180, reading: 680, conversation: 620 } as const
export const motion = {
  enter: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
  enterMs: 600,
  hoverMs: 150,
  atmosphereS: 52,
} as const

export const fonts = {
  /** Fraunces — only for the person's words and the companion's words. */
  display: 'var(--font-fraunces), "Iowan Old Style", "Palatino Linotype", Georgia, serif',
  /** Geist — everything the interface says. */
  ui: 'var(--font-geist-sans), Inter, system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace',
} as const

/** Type roles. Colour is applied by the caller from the theme. */
export const type: Record<'display' | 'h2' | 'h3' | 'quote' | 'ui' | 'small' | 'eyebrow' | 'mono', CSSProperties> = {
  display: {
    fontFamily: fonts.display,
    fontWeight: 400,
    fontSize: 'clamp(30px, 5vw, 44px)',
    lineHeight: 1.02,
    letterSpacing: '-0.02em',
    fontVariationSettings: '"opsz" 144, "SOFT" 40',
    margin: 0,
  },
  h2: {
    fontFamily: fonts.display,
    fontWeight: 400,
    fontSize: 'clamp(22px, 3vw, 28px)',
    lineHeight: 1.1,
    letterSpacing: '-0.015em',
    fontVariationSettings: '"opsz" 96, "SOFT" 30',
    margin: 0,
  },
  h3: {
    fontFamily: fonts.ui,
    fontWeight: 600,
    fontSize: '15px',
    lineHeight: 1.3,
    letterSpacing: '-0.01em',
    margin: 0,
  },
  quote: {
    fontFamily: fonts.display,
    fontStyle: 'italic',
    fontWeight: 400,
    fontSize: '20px',
    lineHeight: 1.35,
    letterSpacing: '-0.01em',
    fontVariationSettings: '"opsz" 48, "SOFT" 60',
    margin: 0,
  },
  ui: { fontFamily: fonts.ui, fontWeight: 400, fontSize: '15px', lineHeight: 1.55, margin: 0 },
  small: { fontFamily: fonts.ui, fontWeight: 400, fontSize: '13px', lineHeight: 1.5, margin: 0 },
  eyebrow: {
    fontFamily: fonts.ui,
    fontWeight: 600,
    fontSize: '11px',
    lineHeight: 1.2,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    margin: 0,
  },
  mono: { fontFamily: fonts.mono, fontWeight: 400, fontSize: '13px', lineHeight: 1.5, fontVariantNumeric: 'tabular-nums', margin: 0 },
}

// ── Resolved token set for a theme ───────────────────────────────────────────
type Widen<T> = { [K in keyof T]: string }

export type Tokens = Widen<(typeof surfaces)['light']> &
  Widen<(typeof meaning)['light']> & {
    theme: Theme
    /** 12–18% tints of each meaning colour, for pills and rings. */
    soft: Record<MeaningKey, string>
    hue: (h: Hue | MeaningKey) => string
  }

export function tokensFor(theme: Theme): Tokens {
  const s = surfaces[theme]
  const m = meaning[theme]
  const tint = theme === 'light' ? 0.13 : 0.17
  const soft = Object.fromEntries(
    (Object.keys(m) as MeaningKey[]).map((k) => [k, alpha(m[k], tint)])
  ) as Record<MeaningKey, string>
  return {
    ...s,
    ...m,
    theme,
    soft,
    hue: (h) => m[h],
  }
}

export const THEME_STORAGE_KEY = 'companheiro-card-theme'
