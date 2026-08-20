// Three-layer palette matching the reference: a constant black header block,
// a container area beneath it, and bright/opaque cards floating on the container.
export type CardTheme = 'light' | 'dark'

// Header is always black — it doesn't participate in the light/dark toggle.
export const headerPalette = {
  bg: '#0a0a09',
  shadow: '0 10px 28px rgba(0, 0, 0, 0.4)',
}

export const cardPalette = {
  light: {
    containerBg: '#edebe4',
    cardBg: '#ffffff',
    cardBgInner: '#f5f3ef',
    textPrimary: '#171613',
    textSecondary: '#6f6d68',
    textMuted: '#9b9891',
    divider: '#ece9e2',
    inputBg: '#f0eee9',
    inputBorder: '#dedad2',
    shadow: '0 12px 28px rgba(23, 22, 19, 0.1)',
  },
  dark: {
    containerBg: '#141311',
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
