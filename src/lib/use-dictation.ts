'use client'

import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import { getDictationLang } from '@/lib/settings'

interface UseDictationOptions {
  /** Called with each transcribed, punctuated stretch of speech. */
  onAppend: (text: string) => void
  /** Returns the last N chars of existing text, given to the model as context. */
  getContext?: () => string
}

interface UseDictationReturn {
  isRecording: boolean
  /** True while recorded speech is still being turned into words. */
  isTranscribing: boolean
  /** Kept for the pages that show it; always empty, words are never shown half-heard. */
  interimText: string
  /** Why the last recording produced nothing, if it failed. */
  error: string | null
  /** How loud the microphone is right now, 0 to 1. Read it in an animation
   *  frame, never into state: it changes sixty times a second. */
  getLevel: () => number
  handleRecordToggle: () => void
  /**
   * Stops, and resolves once everything recorded has been appended, with the
   * words that arrived after the stop: a Send pressed mid-sentence adds them
   * to what it read from the box, since the box's state may not have caught up.
   */
  stopRecording: () => Promise<string>
  /** Call from onChange when the user types manually, to clear stale interim. */
  clearInterim: () => void
}

// Dictation the way Handy (github.com/cjpais/Handy) and Superwhisper work:
// record the audio, and only when the person stops hand the whole clip to a
// proper transcription model (/api/transcribe), which returns it punctuated.
//
// The browser's own SpeechRecognition did the opposite: a result for every
// word, each one a re-render of the whole page, and on phones (iOS above all)
// continuous recognition resends its ever-growing transcript until the page
// freezes. Here nothing changes on screen while the person speaks.
//
// A long recording is cut into segments so each upload stays small; they are
// transcribed in order while the person carries on talking.
const SEGMENT_MS = 60_000
// Shorter than this is a tap, not speech: transcription models invent words
// out of silence ("Thank you for watching").
const MIN_SEGMENT_MS = 500

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const t of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t
  }
  return ''
}

export function useDictation({ onAppend, getContext }: UseDictationOptions): UseDictationReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recordingRef = useRef(false)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const stoppedRef = useRef<(() => void) | null>(null)
  // Words appended since stopRecording was called, or null when not stopping.
  const tailRef = useRef<string[] | null>(null)

  const onAppendRef = useRef(onAppend)
  const getContextRef = useRef(getContext)
  useLayoutEffect(() => {
    onAppendRef.current = onAppend
    getContextRef.current = getContext
  })

  const transcribe = (blob: Blob, ms: number) => {
    if (ms < MIN_SEGMENT_MS || blob.size < 1000) return
    setPending((n) => n + 1)
    // Uploaded at once, appended in order.
    const lang = getDictationLang()
    const request = (async () => {
      const form = new FormData()
      form.append('audio', blob)
      form.append('lang', lang)
      form.append('seconds', String(Math.round(ms / 1000)))
      const res = await fetch('/api/transcribe', { method: 'POST', body: form })
      if (!res.ok) throw new Error(res.status === 503 ? 'Dictation is not available right now.' : 'That could not be heard. Please try again.')
      const data = await res.json()
      return (data.text as string) ?? ''
    })()
    queueRef.current = queueRef.current.then(async () => {
      try {
        const text = (await request).trim()
        if (text) {
          tailRef.current?.push(text)
          onAppendRef.current(text)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That could not be heard. Please try again.')
      } finally {
        setPending((n) => n - 1)
      }
    })
  }

  const audioRef = useRef<{ ctx: AudioContext; analyser: AnalyserNode; buf: Uint8Array<ArrayBuffer> } | null>(null)

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    audioRef.current?.ctx.close().catch(() => {})
    audioRef.current = null
  }

  // Stable, so a meter's animation loop is not restarted by every render.
  const getLevel = useCallback(() => {
    const a = audioRef.current
    if (!a) return 0
    a.analyser.getByteTimeDomainData(a.buf)
    let sum = 0
    for (let i = 0; i < a.buf.length; i++) { const v = (a.buf[i] - 128) / 128; sum += v * v }
    return Math.min(1, Math.sqrt(sum / a.buf.length) * 4)
  }, [])

  // One MediaRecorder per segment, so every upload is a complete file.
  const startSegment = (stream: MediaStream) => {
    const mime = pickMime()
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32_000 }) : new MediaRecorder(stream)
    const chunks: Blob[] = []
    const startedAt = Date.now()
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    recorder.onstop = () => {
      stoppedRef.current?.()
      stoppedRef.current = null
      transcribe(new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' }), Date.now() - startedAt)
      if (recordingRef.current && streamRef.current) startSegment(streamRef.current)
      else releaseMic()
    }
    recorderRef.current = recorder
    recorder.start()
    segmentTimerRef.current = setTimeout(() => {
      if (recorder.state === 'recording') recorder.stop()
    }, SEGMENT_MS)
  }

  const startRecording = async () => {
    if (recordingRef.current) return
    setError(null)
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record.')
      return
    }
    recordingRef.current = true
    setIsRecording(true)
    // Made inside the press, before any await: iOS only allows sound then.
    let ctx: AudioContext | null = null
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      ctx = AC ? new AC() : null
    } catch { ctx = null }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (!recordingRef.current) { stream.getTracks().forEach((t) => t.stop()); ctx?.close().catch(() => {}); return }
      streamRef.current = stream
      if (ctx) {
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(stream).connect(analyser)
        audioRef.current = { ctx, analyser, buf: new Uint8Array(analyser.fftSize) }
      }
      startSegment(stream)
    } catch {
      ctx?.close().catch(() => {})
      recordingRef.current = false
      setIsRecording(false)
      setError('The microphone could not be opened.')
    }
  }

  const stopRecording = async (): Promise<string> => {
    const tail: string[] = []
    tailRef.current = tail
    recordingRef.current = false
    setIsRecording(false)
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current)
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      // onstop transcribes the last segment and releases the mic.
      await new Promise<void>((resolve) => {
        stoppedRef.current = resolve
        recorder.stop()
      })
    } else releaseMic()
    await queueRef.current
    if (tailRef.current === tail) tailRef.current = null
    return tail.join(' ')
  }

  // Leaving the page never leaves the microphone open.
  useEffect(() => () => {
    recordingRef.current = false
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current)
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
    releaseMic()
  }, [])

  const handleRecordToggle = () => {
    if (recordingRef.current) void stopRecording()
    else void startRecording()
  }

  // Nothing to clear any more: interim words are never shown.
  const clearInterim = () => {}

  return {
    isRecording,
    isTranscribing: pending > 0,
    interimText: '',
    error,
    getLevel,
    handleRecordToggle,
    stopRecording,
    clearInterim,
  }
}
