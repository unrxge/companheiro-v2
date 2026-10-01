'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// A zero-length WAV. Playing it inside the tap is what lets iOS play the real
// audio a moment later, once it has been fetched.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

type Key = number | string
type State = { key: Key; phase: 'loading' | 'playing' | 'unavailable' } | null

/**
 * Reads text aloud in the companion's voice (/api/read-aloud). There is no
 * fallback to the browser's built-in voice, by choice: when the voice cannot
 * be reached the caller is told so (`phase: 'unavailable'`) and says it.
 * Audio already fetched is kept for the life of the page, so replaying a
 * reply costs nothing.
 */
export function useReadAloud() {
  const [state, setState] = useState<State>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cacheRef = useRef(new Map<string, string>())
  // Bumped on every start/stop so a fetch that lands late knows it was superseded.
  const runRef = useRef(0)

  const stop = useCallback(() => {
    runRef.current++
    audioRef.current?.pause()
    setState(null)
  }, [])

  useEffect(() => {
    const cache = cacheRef.current
    const run = runRef
    return () => {
      run.current++
      audioRef.current?.pause()
      cache.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  const toggle = useCallback(async (text: string, key: Key) => {
    const wasActive = state?.key === key && state.phase !== 'unavailable'
    stop()
    if (wasActive) return
    const run = ++runRef.current
    const current = () => runRef.current === run

    const audio = audioRef.current ?? (audioRef.current = new Audio())
    // Cleared while the silent unlock clip plays: its ending is not the reply's.
    audio.onended = null

    setState({ key, phase: 'loading' })
    try {
      let url = cacheRef.current.get(text)
      if (!url) {
        audio.src = SILENCE
        audio.play().catch(() => {})
        const res = await fetch('/api/read-aloud', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        })
        if (!res.ok) throw new Error(String(res.status))
        url = URL.createObjectURL(await res.blob())
        cacheRef.current.set(text, url)
      }
      if (!current()) return
      audio.src = url
      audio.onended = () => { if (current()) setState(null) }
      await audio.play()
      if (current()) setState({ key, phase: 'playing' })
    } catch {
      if (current()) setState({ key, phase: 'unavailable' })
    }
  }, [state, stop])

  return { activeKey: state?.key ?? null, phase: state?.phase ?? null, toggle, stop }
}
