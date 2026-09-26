'use client'

import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { getDictationLang } from '@/lib/settings'
import {
  isWordToken,
  joinText,
  settleSentences,
  splitWords,
  stripRecognizerPunctuation,
  wordsUnchanged,
} from '@/lib/dictation-text'

interface UseDictationOptions {
  /** Called with each punctuated, word-validated stretch of speech once it's settled for good. */
  onAppend: (text: string) => void
  /** Returns the last N chars of existing text — used as punctuation context. */
  getContext?: () => string
}

interface UseDictationReturn {
  isRecording: boolean
  /**
   * Everything spoken that hasn't been settled yet: the open sentence (with
   * provisional punctuation that may still change) plus the words still being
   * heard. Append it to your display value to show it live.
   */
  interimText: string
  handleRecordToggle: () => void
  stopRecording: () => void
  /**
   * Call from onChange when the user types manually: whatever interimText was
   * showing is now part of their text, so the hook lets go of it.
   */
  clearInterim: () => void
  /**
   * Hand back everything still unsettled, as shown, and stop listening.
   * None of it will reach onAppend afterwards, so a sender can take its text
   * plus this and clear the box without stray words landing in it a second
   * later. With `keepListening` the mic stays on and whatever is said next
   * starts afresh.
   */
  finish: (options?: { keepListening?: boolean }) => string
}

// How dictation is punctuated, and why it works this way.
//
// The recognizer marks a result "final" at every pause. Punctuating each of
// those on its own (as this hook used to) turns every thinking pause into a
// full stop: the model is handed "so what I keep coming back to is" with
// nothing after it and, reasonably, ends the sentence there.
//
// Instead the hook keeps an open stretch of raw words that grows across
// pauses. Each time the speaker pauses, the whole open stretch is punctuated
// again from scratch, so a break the model guessed at a moment ago is undone
// as soon as the next words show the thought carried on. Pauses never reach
// the model at all; only the words do. A sentence is written into the text
// for good once enough speech has followed it that the model has seen where
// the thought went next; the last sentence stays open until the speaker
// stops, when everything left is punctuated once more, as a finished thought,
// and settled.

// Quiet after a final result before re-punctuating the open stretch.
const PASS_DELAY_MS = 700
// Don't let the unpunctuated words run on too far while someone talks
// without pausing: past this many, punctuate straight away.
const PASS_EAGER_WORDS = 40
// A sentence is only settled once at least this many words follow it.
const SETTLE_AFTER_WORDS = 6

// Browsers end continuous recognition on their own after a stretch of
// silence (Chrome after several seconds, Safari sooner). Pauses are part of
// thinking out loud, so recognition is restarted until the person stops it,
// unless it keeps failing straight away or nothing has been heard for a long
// time.
const RESTART_DELAY_MS = 250
const MAX_QUICK_RESTARTS = 5
const QUICK_RESTART_WINDOW_MS = 15_000
const MAX_SILENCE_MS = 5 * 60_000
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'])

export function useDictation({ onAppend, getContext }: UseDictationOptions): UseDictationReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [interimText, setInterimText] = useState('')

  // The open stretch: raw words (recognizer punctuation stripped) not yet
  // settled, and the latest validated punctuation of the first `words` of them.
  const wordsRef = useRef<string[]>([])
  const punctRef = useRef<{ text: string; words: number } | null>(null)
  // What the recognizer is hearing right now, not yet final.
  const liveRef = useRef('')
  // How many leading open words belong to a session that has ended and must
  // be settled in full.
  const finalizeRef = useRef(0)

  const passTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef<'open' | 'final' | null>(null)
  // Bumped whenever the open stretch is taken away, so a punctuation request
  // already in flight can't write anything back.
  const epochRef = useRef(0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const wantRecordingRef = useRef(false)
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const restartTimesRef = useRef<number[]>([])
  const lastHeardRef = useRef(0)
  // Results below this index were already handed to the caller (they typed
  // over them), so when they turn final they're not added a second time.
  const skipBelowRef = useRef(0)
  const resultsLengthRef = useRef(0)

  // Keep refs to callbacks so async closures always see the latest values.
  const onAppendRef = useRef(onAppend)
  const getContextRef = useRef(getContext)
  useLayoutEffect(() => {
    onAppendRef.current = onAppend
    getContextRef.current = getContext
  })

  const openText = () => {
    const words = wordsRef.current
    const punct = punctRef.current
    return punct ? joinText(punct.text, words.slice(punct.words).join(' ')) : words.join(' ')
  }

  const shownText = () => joinText(openText(), liveRef.current.trim())

  const render = () => setInterimText(shownText())

  const append = (text: string) => {
    if (text.trim()) onAppendRef.current(text.trim())
  }

  const requestPunctuation = async (raw: string, final: boolean): Promise<string | null> => {
    try {
      const res = await fetch('/api/punctuate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: raw, context: getContextRef.current?.() ?? '', final }),
      })
      if (!res.ok) return null
      const data = await res.json()
      const candidate: string = data.text ?? data.punctuated ?? ''
      return candidate && wordsUnchanged(raw, candidate) ? candidate : null
    } catch {
      return null
    }
  }

  const schedulePass = (delay: number) => {
    if (passTimerRef.current) clearTimeout(passTimerRef.current)
    passTimerRef.current = setTimeout(() => {
      passTimerRef.current = null
      void runPass()
    }, delay)
  }

  const runPass = async () => {
    if (inFlightRef.current) return // picked up again when the one in flight lands
    const final = finalizeRef.current > 0
    const n = final ? finalizeRef.current : wordsRef.current.length
    if (n === 0) return
    // Nothing new since the last pass.
    if (!final && punctRef.current?.words === n) return

    const raw = wordsRef.current.slice(0, n).join(' ')
    const epoch = epochRef.current
    inFlightRef.current = final ? 'final' : 'open'
    const punctuated = await requestPunctuation(raw, final)
    if (epoch !== epochRef.current) return
    inFlightRef.current = null
    // Words that arrived while this pass was out; they need one of their own.
    const arrivedSince = wordsRef.current.length > n

    const settle = punctuated ? settleSentences(punctuated, { final, minFollowingWords: SETTLE_AFTER_WORDS }) : null
    if (settle && settle.settledWords <= n) {
      append(settle.settled)
      wordsRef.current = wordsRef.current.slice(settle.settledWords)
      punctRef.current = settle.open ? { text: settle.open, words: n - settle.settledWords } : null
      if (final) finalizeRef.current = Math.max(0, finalizeRef.current - settle.settledWords)
    } else if (final) {
      // Punctuation failed; settle what's there rather than hold it forever —
      // the last good punctuation for the part it covers, raw words after.
      const punct = punctRef.current
      const covered = punct && punct.words <= n ? punct.words : 0
      append(joinText(covered ? punct!.text : '', wordsRef.current.slice(covered, n).join(' ')))
      wordsRef.current = wordsRef.current.slice(n)
      punctRef.current = null
      finalizeRef.current = Math.max(0, finalizeRef.current - n)
    }
    render()

    if (finalizeRef.current > 0) void runPass()
    else if (arrivedSince) schedulePass(PASS_DELAY_MS)
  }

  const addFinal = (transcript: string) => {
    const words = splitWords(stripRecognizerPunctuation(transcript)).filter(isWordToken)
    if (words.length === 0) return
    wordsRef.current = [...wordsRef.current, ...words]
    const unpunctuated = wordsRef.current.length - (punctRef.current?.words ?? 0)
    schedulePass(unpunctuated >= PASS_EAGER_WORDS ? 0 : PASS_DELAY_MS)
  }

  // The session is over: everything open gets punctuated as a finished
  // thought and settled.
  const closeOpenStretch = () => {
    if (liveRef.current.trim()) addFinal(liveRef.current)
    liveRef.current = ''
    if (passTimerRef.current) {
      clearTimeout(passTimerRef.current)
      passTimerRef.current = null
    }
    finalizeRef.current = wordsRef.current.length
    // An open-stretch pass in flight is superseded by the final one.
    if (inFlightRef.current === 'open') {
      epochRef.current++
      inFlightRef.current = null
    }
    render()
    void runPass()
  }

  // Forget the open stretch without settling it (the caller has taken it).
  const dropOpenStretch = () => {
    epochRef.current++
    inFlightRef.current = null
    if (passTimerRef.current) {
      clearTimeout(passTimerRef.current)
      passTimerRef.current = null
    }
    wordsRef.current = []
    punctRef.current = null
    liveRef.current = ''
    finalizeRef.current = 0
    setInterimText('')
  }

  const endSession = () => {
    wantRecordingRef.current = false
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    recognitionRef.current = null
    setIsRecording(false)
    closeOpenStretch()
  }

  const canRestart = () => {
    const now = Date.now()
    if (now - lastHeardRef.current > MAX_SILENCE_MS) return false
    restartTimesRef.current = restartTimesRef.current.filter((t) => now - t < QUICK_RESTART_WINDOW_MS)
    return restartTimesRef.current.length < MAX_QUICK_RESTARTS
  }

  const startRecognition = (): boolean => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const API = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!API) return false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition: any = new API()
    recognition.continuous = true
    recognition.interimResults = true
    // The person's language (Settings), else the browser's — never a hard-coded en-US.
    recognition.lang = getDictationLang()
    skipBelowRef.current = 0
    resultsLengthRef.current = 0

    recognition.onstart = () => setIsRecording(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      if (recognitionRef.current !== recognition) return
      lastHeardRef.current = Date.now()
      restartTimesRef.current = []
      let live = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (i < skipBelowRef.current) continue
        const transcript: string = event.results[i][0].transcript
        if (event.results[i].isFinal) addFinal(transcript)
        else live += transcript
      }
      resultsLengthRef.current = event.results.length
      liveRef.current = live
      render()
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (event: any) => {
      if (FATAL_ERRORS.has(event?.error)) wantRecordingRef.current = false
    }
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return
      // Anything still being heard when the recognizer gave up is kept.
      if (liveRef.current.trim()) addFinal(liveRef.current)
      liveRef.current = ''
      if (!wantRecordingRef.current || !canRestart()) {
        endSession()
        return
      }
      // A pause, not an ending: pick up listening again, keeping the open
      // stretch as it is so the thought can carry on across the gap.
      recognitionRef.current = null
      restartTimesRef.current.push(Date.now())
      render()
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null
        if (!wantRecordingRef.current) return
        if (!startRecognition()) endSession()
      }, RESTART_DELAY_MS)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      return false
    }
    return true
  }

  const startRecording = () => {
    wantRecordingRef.current = true
    lastHeardRef.current = Date.now()
    restartTimesRef.current = []
    if (!startRecognition()) wantRecordingRef.current = false
  }

  const stopRecording = () => {
    wantRecordingRef.current = false
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      // onend fires → endSession → the open stretch is closed out.
    } else if (isRecording || restartTimerRef.current) {
      // Between a silence timeout and the restart: nothing to wait for.
      endSession()
    }
  }

  const handleRecordToggle = () => {
    if (isRecording) stopRecording()
    else startRecording()
  }

  const clearInterim = () => {
    // The in-progress result is part of what the caller took; don't add it
    // again when the recognizer finalizes it.
    skipBelowRef.current = resultsLengthRef.current
    dropOpenStretch()
  }

  const abortRecognition = () => {
    wantRecordingRef.current = false
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        /* already stopped */
      }
    }
  }

  const finish = ({ keepListening = false }: { keepListening?: boolean } = {}) => {
    const text = shownText()
    if (keepListening) {
      clearInterim()
      return text
    }
    abortRecognition()
    setIsRecording(false)
    dropOpenStretch()
    return text
  }

  // Don't leave the microphone on after the screen that opened it has gone.
  useEffect(() => () => abortRecognition(), [])

  return { isRecording, interimText, handleRecordToggle, stopRecording, clearInterim, finish }
}
