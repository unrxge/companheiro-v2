'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// A zero-length WAV. Playing it inside the tap is what lets iOS play the real
// audio a moment later, once it has been fetched.
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='

/** If nothing audible has started this long after the audio claims to play, say so. */
const SILENT_AFTER_MS = 6000

type Key = number | string
type State = { key: Key; phase: 'loading' | 'playing' | 'unavailable' } | null

export interface ReadAloudContext {
  energy?: string | null
  movement?: string | null
  hour?: number
  /** A saved check-in and which companion reply this is (from 0): lets the audio play while it arrives. */
  checkInId?: string | null
  replyIndex?: number
}

/**
 * Reads text aloud in the companion's voice (/api/read-aloud). There is no
 * fallback to the browser's built-in voice, by choice: when the voice cannot
 * be reached the caller is told so (`phase: 'unavailable'`) and says it.
 *
 * Two ways in. When the reply belongs to a saved check-in the audio element
 * is pointed straight at the server and plays as the speech is generated,
 * which is a second or two instead of the length of the whole reply. Without
 * that, or if it fails, the words are sent and the whole recording awaited.
 */
export function useReadAloud() {
  const [state, setState] = useState<State>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cacheRef = useRef(new Map<string, string>())
  // Bumped on every start/stop so anything that lands late knows it was superseded.
  const runRef = useRef(0)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const quiet = useCallback(() => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current)
    watchdogRef.current = null
    const audio = audioRef.current
    if (!audio) return
    audio.onended = null
    audio.onerror = null
    audio.onplaying = null
    audio.pause()
    // Dropping the source is what tells the browser to stop downloading.
    audio.removeAttribute('src')
    audio.load()
  }, [])

  const stop = useCallback(() => {
    runRef.current++
    quiet()
    setState(null)
  }, [quiet])

  useEffect(() => {
    const cache = cacheRef.current
    const run = runRef
    return () => {
      run.current++
      quiet()
      cache.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [quiet])

  const toggle = useCallback(async (text: string, key: Key, context: ReadAloudContext = {}) => {
    const wasActive = state?.key === key && state.phase !== 'unavailable'
    stop()
    if (wasActive) return
    const run = ++runRef.current
    const current = () => runRef.current === run

    const audio = audioRef.current ?? (audioRef.current = new Audio())
    const fail = () => { if (current()) { quiet(); setState({ key, phase: 'unavailable' }) } }

    // "Playing" is only believed once the playhead has actually moved: an
    // element can report that it is playing and produce nothing.
    const watch = () => {
      if (watchdogRef.current) clearTimeout(watchdogRef.current)
      watchdogRef.current = setTimeout(() => {
        if (current() && !audio.ended && audio.currentTime < 0.2) fail()
      }, SILENT_AFTER_MS)
    }
    const arm = () => {
      audio.onended = () => { if (current()) { quiet(); setState(null) } }
      audio.onplaying = () => { if (current()) { setState({ key, phase: 'playing' }); watch() } }
    }

    // The slower way: send the words, wait for the whole recording.
    const whole = async () => {
      try {
        let url = cacheRef.current.get(text)
        if (!url) {
          const res = await fetch('/api/read-aloud', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, context: { energy: context.energy, movement: context.movement, hour: context.hour } }),
          })
          if (!res.ok) throw new Error(String(res.status))
          url = URL.createObjectURL(await res.blob())
          cacheRef.current.set(text, url)
        }
        if (!current()) return
        arm()
        audio.onerror = fail
        audio.src = url
        await audio.play()
      } catch {
        fail()
      }
    }

    setState({ key, phase: 'loading' })

    const cached = cacheRef.current.get(text)
    if (!cached && context.checkInId && typeof context.replyIndex === 'number') {
      const q = new URLSearchParams({ c: context.checkInId, i: String(context.replyIndex), n: String(text.trim().length) })
      if (typeof context.hour === 'number') q.set('hour', String(context.hour))
      arm()
      let fellBack = false
      const fallBack = () => {
        if (fellBack || !current()) return
        fellBack = true
        audio.onerror = null
        void whole()
      }
      // Not saved yet, or a browser that will not play a stream: use the slower way.
      audio.onerror = fallBack
      audio.src = `/api/read-aloud?${q}`
      audio.play().catch(fallBack)
      return
    }

    if (!cached) {
      audio.src = SILENCE
      audio.play().catch(() => {})
    }
    await whole()
  }, [state, stop, quiet])

  return { activeKey: state?.key ?? null, phase: state?.phase ?? null, toggle, stop }
}
