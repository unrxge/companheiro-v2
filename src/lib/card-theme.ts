// The page background is a constant dark shell — it never toggles, and the
// header text sits directly on it (no separate header box).
export type CardTheme = 'light' | 'dark'

export const shellBackground = 'radial-gradient(ellipse at top, #161412 0%, #0f0e0d 70%)'

// Below the header, a "container" panel sits on the shell and holds the
// cards — this is what toggles between light and dark.
export const cardPalette = {
  light: {
    containerBg: '#edebe4',
    containerShadow: '0 24px 60px rgba(0, 0, 0, 0.4)',
    cardBg: '#ffffff',
    cardBgInner: '#f5f3ef',
    textPrimary: '#171613',
    textSecondary: '#6f6d68',
    textMuted: '#9b9891',
    divider: '#e3e0d8',
    inputBg: '#f0eee9',
    inputBorder: '#dedad2',
    shadow: '0 12px 28px rgba(23, 22, 19, 0.1)',
  },
  dark: {
    containerBg: '#141311',
    containerShadow: '0 24px 60px rgba(0, 0, 0, 0.55)',
    cardBg: '#211f1c',
    cardBgInner: '#28251f',
    textPrimary: '#e8e6e0',
    textSecondary: '#a8a6a0',
    textMuted: '#6a6866',
    divider: '#332f2a',
    inputBg: '#1c1a17',
    inputBorder: '#332f2a',
    shadow: '0 12px 28px rgba(0, 0, 0, 0.45)',
  },
} as const
