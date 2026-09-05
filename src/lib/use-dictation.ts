'use client'

import { useState, useRef, useLayoutEffect } from 'react'

interface UseDictationOptions {
  /** Called with each punctuated, word-validated segment as it's confirmed. */
  onAppend: (text: string) => void
  /** Returns the last N chars of existing text — used as punctuation context. */
  getContext?: () => string
}

interface UseDictationReturn {
  isRecording: boolean
  /** Raw in-flight words — append to your display value to show them live. */
  interimText: string
  handleRecordToggle: () => void
  stopRecording: () => void
  /** Call from onChange when the user types manually, to clear stale interim. */
  clearInterim: () => void
}

// Verify the model only inserted punctuation — no word changes accepted.
function wordsUnchanged(raw: string, candidate: string): boolean {
  const strip = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim()
  return strip(raw) === strip(candidate)
}

export function useDictation({ onAppend, getContext }: UseDictationOptions): UseDictationReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [interimText, setInterimText] = useState('')
  const interimTextRef = useRef('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const punctuationQueueRef = useRef<Promise<void>>(Promise.resolve())

  // Keep refs to callbacks so async closures always see the latest values.
  const onAppendRef = useRef(onAppend)
  const getContextRef = useRef(getContext)
  useLayoutEffect(() => {
    onAppendRef.current = onAppend
    getContextRef.current = getContext
  })

  const punctuateAndAppend = (raw: string) => {
    punctuationQueueRef.current = punctuationQueueRef.current.then(async () => {
      const context = getContextRef.current?.() ?? ''
      let punctuated = raw
      try {
        const res = await fetch('/api/punctuate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: raw, context }),
        })
        if (res.ok) {
          const data = await res.json()
          const candidate = data.text ?? data.punctuated ?? ''
          if (candidate && wordsUnchanged(raw, candidate)) {
            punctuated = candidate
          }
        }
      } catch {
        // fall back to raw
      }
      onAppendRef.current(punctuated)
    })
  }

  const clearInterim = () => {
    interimTextRef.current = ''
    setInterimText('')
  }

  const commitInterim = () => {
    const pending = interimTextRef.current.trim()
    if (pending) punctuateAndAppend(pending)
    clearInterim()
  }

  const startRecording = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const API = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!API) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new API()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onstart = () => setIsRecording(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          punctuateAndAppend(transcript.trim())
          interimTextRef.current = ''
          setInterimText('')
        } else {
          interim += transcript
        }
      }
      if (interim) {
        interimTextRef.current = interim
        setInterimText(interim)
      }
    }
    recognition.onerror = () => { commitInterim(); setIsRecording(false) }
    recognition.onend = () => { commitInterim(); setIsRecording(false) }
    recognitionRef.current = recognition
    recognition.start()
  }

  const stopRecording = () => {
    recognitionRef.current?.stop()
    // onend fires → commitInterim
  }

  const handleRecordToggle = () => {
    if (isRecording) stopRecording()
    else startRecording()
  }

  return { isRecording, interimText, handleRecordToggle, stopRecording, clearInterim }
}
