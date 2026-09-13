// studio/src/lib/studio/media/waveform.ts — the 24-sample envelope a recording
// block draws (lane E). Decoded in the browser with decodeAudioData; the file
// never goes anywhere for analysis. `envelopeFromSamples` is pure (tsx tests).

export const ENVELOPE_BARS = 24

/**
 * Peak-normalised RMS per bar, 0..1. A silent buffer yields all zeros; a bar with
 * no samples (very short clips) reads 0. Peak normalisation keeps a quiet
 * recording readable — the shape matters, not the gain.
 */
export function envelopeFromSamples(samples: ArrayLike<number>, bars: number = ENVELOPE_BARS): number[] {
  const n = samples.length
  const out = new Array<number>(bars).fill(0)
  if (n === 0 || bars <= 0) return out
  const per = n / bars
  let peak = 0
  for (let b = 0; b < bars; b++) {
    const start = Math.floor(b * per)
    const end = Math.min(n, Math.max(start + 1, Math.floor((b + 1) * per)))
    let sum = 0
    let count = 0
    for (let i = start; i < end; i++) {
      const v = samples[i]
      sum += v * v
      count++
    }
    const rms = count > 0 ? Math.sqrt(sum / count) : 0
    out[b] = rms
    if (rms > peak) peak = rms
  }
  if (peak <= 0) return out
  return out.map((v) => Math.round((v / peak) * 1000) / 1000)
}

/** Mix every channel of an AudioBuffer down to one Float32Array. */
export function mixDown(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels
  const length = buffer.length
  if (channels === 1) return buffer.getChannelData(0)
  const out = new Float32Array(length)
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) out[i] += data[i] / channels
  }
  return out
}

type AudioContextCtor = typeof AudioContext
function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

export interface DecodedAudio {
  envelope: number[]
  duration_s: number
}

/**
 * Decode a recorded/picked audio blob and measure it: the 24-bar envelope and
 * the duration in seconds (rounded to 1/100). Throws when the browser cannot
 * decode the container.
 */
export async function analyseAudio(blob: Blob, bars: number = ENVELOPE_BARS): Promise<DecodedAudio> {
  const Ctor = audioContextCtor()
  if (!Ctor) throw new Error('no audio context')
  const ctx = new Ctor()
  try {
    const bytes = await blob.arrayBuffer()
    const buffer = await new Promise<AudioBuffer>((resolve, reject) => {
      // The promise form is not universal (older Safari), so use the callback form everywhere.
      const p = ctx.decodeAudioData(bytes, resolve, (e) => reject(e ?? new Error('decode failed')))
      if (p && typeof (p as Promise<AudioBuffer>).then === 'function') {
        ;(p as Promise<AudioBuffer>).then(resolve, reject)
      }
    })
    return {
      envelope: envelopeFromSamples(mixDown(buffer), bars),
      duration_s: Math.round(buffer.duration * 100) / 100,
    }
  } finally {
    void ctx.close().catch(() => undefined)
  }
}

/** `0:42` · `12:05` · `1:02:09` — no unit words, no rounding up. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}
