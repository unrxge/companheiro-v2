// studio/src/lib/studio/media/recorder.ts — MediaRecorder + live SpeechRecognition
// running together (lane E; brief: there is NO server-side transcription). The
// person's own voice is transcribed as their words while it records, in the
// dictation language from settings. The `reference` toggle disables recognition:
// a reference is never listened to, so it never gets a transcript (D-059).

import { getDictationLang } from '@/lib/settings'

export interface RecordingResult {
  blob: Blob
  /** Base mime without codec parameters, e.g. 'audio/webm' (what the bucket accepts). */
  mime: string
  ext: string
  duration_s: number
  /** null when `reference`, when recognition is unavailable, or when nothing was heard. */
  transcript: string | null
  own_voice: boolean
}

export interface RecorderHandle {
  /** Stop and resolve with the file, its duration and the transcript. */
  stop(): Promise<RecordingResult>
  /** Stop and throw everything away. */
  cancel(): void
  /** Flip the reference toggle mid-take: turning it on drops what was heard so far and stops listening. */
  setReference(v: boolean): void
  /** Seconds since the take started. */
  elapsed(): number
  /** Live text: final segments so far plus the current interim words. */
  transcriptSoFar(): string
  readonly recognising: boolean
}

export interface RecorderOptions {
  reference?: boolean
  lang?: string
  /** Fires with the live transcript (final + interim) whenever it changes. */
  onTranscript?: (text: string) => void
  /** Fires roughly 10×/s with a 0..1 input level for the live meter. */
  onLevel?: (level: number) => void
}

interface RecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error?: string }) => void) | null
  start(): void
  stop(): void
  abort(): void
}
interface RecognitionEventLike {
  resultIndex: number
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>
}
type RecognitionCtor = new () => RecognitionLike

const MIME_CANDIDATES: Array<{ full: string; base: string; ext: string }> = [
  { full: 'audio/webm;codecs=opus', base: 'audio/webm', ext: 'webm' },
  { full: 'audio/webm', base: 'audio/webm', ext: 'webm' },
  { full: 'audio/mp4', base: 'audio/mp4', ext: 'm4a' },
  { full: 'audio/ogg;codecs=opus', base: 'audio/ogg', ext: 'ogg' },
]

export function isRecordingSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function'
  )
}

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function isRecognitionSupported(): boolean {
  return recognitionCtor() !== null
}

function pickMime(): { full: string; base: string; ext: string } {
  for (const c of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(c.full)) return c
    } catch {
      // keep looking
    }
  }
  return { full: '', base: 'audio/webm', ext: 'webm' }
}

/** Base mime + extension for a picked audio file (a reference from disk). */
export function audioFileKind(file: Blob): { mime: string; ext: string } | null {
  const type = (file.type || '').toLowerCase().split(';')[0].trim()
  const known: Record<string, string> = {
    'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
    'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg',
  }
  const ext = known[type]
  if (!ext) return null
  const mime = type === 'audio/x-m4a' ? 'audio/mp4' : type === 'audio/mp3' ? 'audio/mpeg' : type === 'audio/x-wav' || type === 'audio/wave' ? 'audio/wav' : type
  return { mime, ext }
}

/**
 * Ask for the microphone and start a take. Recognition runs alongside unless
 * `reference` is on. Resolves once the stream is live.
 */
export async function startRecording(opts: RecorderOptions = {}): Promise<RecorderHandle> {
  if (!isRecordingSupported()) throw new Error('recording is not available in this browser')
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mime = pickMime()
  const recorder = mime.full ? new MediaRecorder(stream, { mimeType: mime.full }) : new MediaRecorder(stream)
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }

  let reference = opts.reference ?? false
  let finals: string[] = []
  let interim = ''
  let recognition: RecognitionLike | null = null
  let recognising = false
  let stopped = false
  const startedAt = performance.now()

  const emitTranscript = () => {
    const text = [finals.join(' '), interim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    opts.onTranscript?.(text)
  }

  const startRecognition = () => {
    const Ctor = recognitionCtor()
    if (!Ctor || reference || stopped) return
    try {
      const r = new Ctor()
      r.lang = opts.lang ?? getDictationLang()
      r.continuous = true
      r.interimResults = true
      r.onresult = (e) => {
        let live = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i]
          const t = res[0]?.transcript ?? ''
          if (res.isFinal) {
            if (t.trim()) finals.push(t.trim())
          } else {
            live += t
          }
        }
        interim = live.trim()
        emitTranscript()
      }
      r.onerror = (e) => {
        // 'no-speech' and 'aborted' are routine; the recorder keeps going regardless
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') recognising = false
      }
      r.onend = () => {
        // Browsers end recognition on silence; restart while the take is still running.
        if (!stopped && !reference && recognising) {
          try {
            r.start()
          } catch {
            recognising = false
          }
        }
      }
      recognition = r
      recognising = true
      r.start()
    } catch {
      recognition = null
      recognising = false
    }
  }

  const stopRecognition = (drop: boolean) => {
    recognising = false
    const r = recognition
    recognition = null
    if (r) {
      try {
        if (drop) r.abort()
        else r.stop()
      } catch {
        // already ended
      }
    }
    if (drop) {
      finals = []
      interim = ''
      emitTranscript()
    }
  }

  // ── live level meter (optional) ──
  let levelTimer: ReturnType<typeof setInterval> | null = null
  let audioCtx: AudioContext | null = null
  if (opts.onLevel) {
    try {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
      const Ctor = w.AudioContext ?? w.webkitAudioContext
      if (Ctor) {
        audioCtx = new Ctor()
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 512
        source.connect(analyser)
        const data = new Uint8Array(analyser.fftSize)
        levelTimer = setInterval(() => {
          analyser.getByteTimeDomainData(data)
          let sum = 0
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128
            sum += v * v
          }
          opts.onLevel?.(Math.min(1, Math.sqrt(sum / data.length) * 3))
        }, 100)
      }
    } catch {
      audioCtx = null
    }
  }

  const releaseStream = () => {
    if (levelTimer) clearInterval(levelTimer)
    levelTimer = null
    if (audioCtx) void audioCtx.close().catch(() => undefined)
    audioCtx = null
    for (const track of stream.getTracks()) track.stop()
  }

  recorder.start(250)
  startRecognition()

  const finish = (): Promise<Blob> =>
    new Promise((resolve, reject) => {
      if (recorder.state === 'inactive') {
        resolve(new Blob(chunks, { type: mime.base }))
        return
      }
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime.base }))
      recorder.onerror = () => reject(new Error('recording failed'))
      try {
        recorder.stop()
      } catch (e) {
        reject(e instanceof Error ? e : new Error('recording failed'))
      }
    })

  return {
    get recognising() {
      return recognising
    },
    elapsed: () => (performance.now() - startedAt) / 1000,
    transcriptSoFar: () => [finals.join(' '), interim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
    setReference(v) {
      if (v === reference) return
      reference = v
      if (v) stopRecognition(true)
      else if (!stopped) startRecognition()
    },
    async stop() {
      if (stopped) throw new Error('already stopped')
      stopped = true
      const duration_s = Math.round(((performance.now() - startedAt) / 1000) * 100) / 100
      // Let a trailing final result land before reading the transcript.
      stopRecognition(false)
      const blob = await finish()
      releaseStream()
      if (!reference) await new Promise((r) => setTimeout(r, 250))
      const own_voice = !reference
      const text = own_voice ? finals.join(' ').replace(/\s+/g, ' ').trim() : ''
      return { blob, mime: mime.base, ext: mime.ext, duration_s, transcript: own_voice && text ? text : null, own_voice }
    },
    cancel() {
      if (stopped) return
      stopped = true
      stopRecognition(true)
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        // already stopped
      }
      releaseStream()
    },
  }
}
