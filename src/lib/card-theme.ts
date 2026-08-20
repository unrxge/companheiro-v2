// Palette for opaque card surfaces on the app's always-dark shell.
// Light: white/off-white cards for high contrast against the dark shell.
// Dark: a distinct dark grey, separate from the shell background, for legible layering.
export type CardTheme = 'light' | 'dark'

export const cardPalette = {
  light: {
    cardBg: '#f7f6f3',
    cardBgInner: '#ffffff',
    textPrimary: '#171613',
    textSecondary: '#6f6d68',
    textMuted: '#9b9891',
    divider: '#e7e4de',
    inputBg: '#f0eee9',
    inputBorder: '#dedad2',
    shadow: '0 16px 40px rgba(10, 10, 9, 0.35)',
  },
  dark: {
    cardBg: '#1a1a18',
    cardBgInner: '#232321',
    textPrimary: '#e8e6e0',
    textSecondary: '#a8a6a0',
    textMuted: '#6a6866',
    divider: '#2c2a27',
    inputBg: '#1c1c1a',
    inputBorder: '#2a2825',
    shadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
  },
} as const
