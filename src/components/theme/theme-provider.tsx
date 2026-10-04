'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { THEME_STORAGE_KEY, tokensFor, type Theme, type Tokens } from '@/lib/design-tokens'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
  /** Resolved tokens for the current theme. */
  t: Tokens
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * App-wide container theme (light bone / dark coal). One provider, one storage
 * key — the same key the per-page `useCardTheme` hook already used, so the
 * person's existing preference carries over untouched.
 */
export function ThemeProvider({ children, defaultTheme = 'light' }: { children: React.ReactNode; defaultTheme?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
      if (stored === 'light' || stored === 'dark') setThemeState(stored)
    } catch {
      /* storage unavailable — keep default */
    }
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light'
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({ theme, toggle, setTheme, t: tokensFor(theme) }), [theme, toggle, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

const fallback: ThemeContextValue = {
  theme: 'light',
  toggle: () => {},
  setTheme: () => {},
  t: tokensFor('light'),
}

/** Read the app theme. Works outside the provider too (returns light). */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? fallback
}
