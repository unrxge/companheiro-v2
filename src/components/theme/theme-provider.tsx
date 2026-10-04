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
 * App-wide container theme (light bone / dark coal). It starts from the
 * device's setting; the toggle overrides it, and that choice is stored under
 * the same key the per-page `useCardTheme` hook used, so existing preferences
 * carry over untouched.
 */
export function ThemeProvider({ children, defaultTheme = 'light' }: { children: React.ReactNode; defaultTheme?: Theme }) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme)

  // Until the person picks one with the toggle, it follows the device's own
  // light or dark setting, and changes with it. A choice made here is kept.
  useEffect(() => {
    const chosen = (): Theme | null => {
      try {
        const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
        return stored === 'light' || stored === 'dark' ? stored : null
      } catch {
        return null
      }
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = () => setThemeState(chosen() ?? (mq.matches ? 'dark' : 'light'))
    follow()
    mq.addEventListener('change', follow)
    return () => mq.removeEventListener('change', follow)
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
