// Legacy palette module. Everything here now resolves to the Inner Weather
// tokens in design-tokens.ts so any page not yet migrated still renders in
// the approved palette. New code imports from design-tokens / useTheme().
import { shell, tokensFor } from '@/lib/design-tokens'

export type CardTheme = 'light' | 'dark'

export const shellBackground = shell.background

// Brand accent (ember). Prefer `useTheme().t.ember` in new code.
export const accentColor = tokensFor('light').ember

export const cardPalette = {
  light: tokensFor('light'),
  dark: tokensFor('dark'),
} as const
