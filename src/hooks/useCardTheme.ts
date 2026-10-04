'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CardTheme } from '@/lib/card-theme'

const STORAGE_KEY = 'companheiro-card-theme'

export function useCardTheme(defaultTheme: CardTheme = 'light') {
  const [theme, setTheme] = useState<CardTheme>(defaultTheme)

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') setTheme(stored)
  }, [])

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: CardTheme = prev === 'light' ? 'dark' : 'light'
      window.localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  return { theme, toggle }
}
