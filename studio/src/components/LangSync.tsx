'use client'

import { useEffect } from 'react'

// Sets document.documentElement.lang to the browser's preferred language
// after hydration, so the OS spell checker uses the right dictionary.
// The HTML element starts as lang="en" (SSR safe), then this corrects it.
export default function LangSync() {
  useEffect(() => {
    const lang = navigator.language || 'en'
    document.documentElement.lang = lang
  }, [])

  return null
}
