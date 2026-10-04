'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { tokensFor, type Theme, type Tokens } from '@/lib/design-tokens'

interface ThemeContextValue {
  theme: Theme
  /** Resolved tokens for the current theme. */
  t: Tokens
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * App-wide container theme (light bone / dark coal). It follows the device's
 * own light or dark setting, and changes with it while the app is open. There
 * is nothing to switch inside the app.
 */
export function ThemeProvider({ children, defaultTheme = 'light' }: { children: React.ReactNode; defaultTheme?: Theme }) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const follow = () => setTheme(mq.matches ? 'dark' : 'light')
    follow()
    mq.addEventListener('change', follow)
    return () => mq.removeEventListener('change', follow)
  }, [])

  const value = useMemo<ThemeContextValue>(() => ({ theme, t: tokensFor(theme) }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

const fallback: ThemeContextValue = { theme: 'light', t: tokensFor('light') }

/** Read the app theme. Works outside the provider too (returns light). */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? fallback
}
