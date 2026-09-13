'use client'

// studio/src/components/canvas/blocks/media/recording.tsx — the recording block
// (lane E, 6.2): a 32 px round play button, the title, the duration, a 24-bar
// waveform of 2 px hairlines (played part in tide), and under it on cardBgInner
// either `YOUR VOICE · TRANSCRIBED` + the transcript excerpt or `REFERENCE · NOT
// LISTENED TO` + the person's note. Empty → record a take with recorder.ts (own
// voice transcribed live) or choose a reference file. The shell draws the eyebrow.
//
// D-059: the asset id and url stay in this file and the store; only the title,
// note and an own-voice transcript are readable elsewhere.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { FileAudio, Mic, Pause, Play, Square } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { alpha } from '@/lib/design-tokens'
import { canvasType, line, motionSpec } from '@/lib/studio/canvas-tokens'
import { useAsset, useInteractive, useStore } from '@/lib/studio/hooks'
import { isRecognitionSupported, isRecordingSupported, startRecording, type RecorderHandle } from '@/lib/studio/media/recorder'
import { AUDIO_ACCEPT, commitBlockContent, pickFiles, refreshAssetUrls, uploadAudio, uploadAudioFile } from '@/lib/studio/media/upload'
import { analyseAudio, ENVELOPE_BARS, formatDuration } from '@/lib/studio/media/waveform'
import type { AssetView } from '@/lib/studio/types'
import type { BlockOf, BlockRendererProps } from '@/components/canvas/blocks/registry'
import { ChipButton, errorMessage, MediaStatus } from '@/components/canvas/blocks/media/image'

// ── waveform ───────────────────────────────────────────────────────────────

export function Waveform({
  envelope,
  played = 0,
  height = 32,
  onSeek,
}: {
  envelope: number[] | null | undefined
  /** 0..1 of the take already heard. */
  played?: number
  height?: number
  onSeek?: (fraction: number) => void
}) {
  const { t } = useTheme()
  const bars = envelope && envelope.length === ENVELOPE_BARS ? envelope : new Array<number>(ENVELOPE_BARS).fill(0)
  const rest = alpha(t.textPrimary, 0.35)
  return (
    <div
      data-no-drag={onSeek ? '' : undefined}
      role={onSeek ? 'slider' : undefined}
      aria-label={onSeek ? 'position' : undefined}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? 100 : undefined}
      aria-valuenow={onSeek ? Math.round(played * 100) : undefined}
      onClick={
        onSeek
          ? (e) => {
              e.stopPropagation()
              const r = e.currentTarget.getBoundingClientRect()
              if (r.width > 0) onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
            }
          : undefined
      }
      onPointerDown={onSeek ? (e) => e.stopPropagation() : undefined}
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        height,
        width: '100%',
        cursor: onSeek ? 'pointer' : undefined,
      }}
    >
      {bars.map((v, i) => {
        const heard = (i + 0.5) / bars.length <= played
        const h = Math.max(2, Math.round(Math.min(1, Math.max(0, v)) * height))
        return <i key={i} style={{ display: 'block', width: 2, height: h, backgroundColor: heard ? t.tide : rest, borderRadius: 1, flexShrink: 0 }} />
      })}
    </div>
  )
}

// ── player ─────────────────────────────────────────────────────────────────

export interface AudioPlayer {
  playing: boolean
  time: number
  duration: number
  toggle: () => void
  seek: (fraction: number) => void
}

/** A hidden <audio> for one signed url; `onExpired` fires once when the url no longer loads. */
export function useAudioPlayer(src: string | null, duration_s: number | null | undefined, onExpired?: () => void): AudioPlayer {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(duration_s ?? 0)
  const expiredRef = useRef(onExpired)
  expiredRef.current = onExpired

  useEffect(() => {
    setDuration(duration_s ?? 0)
  }, [duration_s])

  useEffect(() => {
    if (!src || typeof Audio === 'undefined') {
      ref.current = null
      return
    }
    const el = new Audio()
    el.preload = 'metadata'
    el.src = src
    const onTime = () => setTime(el.currentTime)
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration)
    }
    const onEnd = () => {
      setPlaying(false)
      setTime(0)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onErr = () => {
      setPlaying(false)
      expiredRef.current?.()
    }
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('durationchange', onMeta)
    el.addEventListener('ended', onEnd)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('error', onErr)
    ref.current = el
    return () => {
      el.pause()
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('durationchange', onMeta)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('error', onErr)
      el.removeAttribute('src')
      el.load()
      ref.current = null
      setPlaying(false)
    }
  }, [src])

  const toggle = useCallback(() => {
    const el = ref.current
    if (!el) return
    if (el.paused) void el.play().catch(() => setPlaying(false))
    else el.pause()
  }, [])

  const seek = useCallback(
    (fraction: number) => {
      const el = ref.current
      if (!el) return
      const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration
      if (d > 0) {
        el.currentTime = fraction * d
        setTime(el.currentTime)
      }
    },
    [duration]
  )

  return { playing, time, duration, toggle, seek }
}

export function RoundButton({
  onClick,
  ariaLabel,
  children,
  size = 32,
  disabled = false,
}: {
  onClick: () => void
  ariaLabel: string
  children: ReactNode
  size?: number
  disabled?: boolean
}) {
  const { t } = useTheme()
  return (
    <button
      type="button"
      data-no-drag
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: 'none',
        backgroundColor: t.inverseBg,
        color: t.inverseText,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        flexShrink: 0,
        opacity: disabled ? 0.4 : 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  )
}

/** The eyebrow + text panel under the waveform: `YOUR VOICE · TRANSCRIBED` or `REFERENCE · NOT LISTENED TO`. */
export function TranscriptPanel({ asset, note, clampLines }: { asset: AssetView; note: string; clampLines?: number }) {
  const { t } = useTheme()
  const own = asset.own_voice
  const text = own ? asset.transcript?.trim() ?? '' : note.trim()
  const empty = own ? 'nothing was heard' : 'no note yet'
  return (
    <div style={{ backgroundColor: t.cardBgInner, borderRadius: 10, padding: 12 }}>
      <div style={{ ...canvasType.eyebrow, color: t.textMuted, height: 16, marginBottom: 6 }}>
        {own ? 'your voice · transcribed' : 'reference · not listened to'}
      </div>
      <div
        style={{
          ...canvasType.small,
          color: text ? t.textPrimary : t.textMuted,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          ...(clampLines
            ? { display: '-webkit-box', WebkitLineClamp: clampLines, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }
            : {}),
        }}
      >
        {text || empty}
      </div>
    </div>
  )
}

// ── the block ──────────────────────────────────────────────────────────────

export function RecordingBlock({ block, phone }: BlockRendererProps<'recording'>) {
  const { t } = useTheme()
  const store = useStore()
  const interactive = useInteractive()
  const asset = useAsset(block.content.asset_id || null)
  const refreshed = useRef(false)
  const player = useAudioPlayer(asset?.url ?? null, asset?.duration_s, () => {
    if (!asset || refreshed.current) return
    refreshed.current = true
    void refreshAssetUrls(store, asset.id)
  })

  if (!block.content.asset_id) {
    if (!interactive || phone) {
      return <MediaStatus>nothing recorded yet</MediaStatus>
    }
    return <RecordTake block={block} />
  }

  if (!asset) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Title title={block.content.title} />
        <MediaStatus>this recording is not available</MediaStatus>
      </div>
    )
  }

  const duration = player.duration || asset.duration_s || 0
  const played = duration > 0 ? Math.min(1, player.time / duration) : 0
  const meta = player.playing || player.time > 0 ? `${formatDuration(player.time)} / ${formatDuration(duration)}` : formatDuration(duration)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <RoundButton onClick={player.toggle} ariaLabel={player.playing ? 'pause' : 'play'}>
          {player.playing ? <Pause size={14} strokeWidth={1.5} /> : <Play size={14} strokeWidth={1.5} style={{ marginLeft: 1 }} />}
        </RoundButton>
        <div style={{ minWidth: 0, flex: 1 }}>
          <Title title={block.content.title} />
          <div style={{ ...canvasType.meta, color: t.textMuted, marginTop: 2 }}>{meta}</div>
        </div>
      </div>
      <Waveform envelope={asset.envelope} played={played} onSeek={player.seek} />
      <TranscriptPanel asset={asset} note={block.content.note} clampLines={6} />
    </div>
  )
}

function Title({ title }: { title: string }) {
  const { t } = useTheme()
  const text = title.trim()
  return (
    <div style={{ ...canvasType.title, color: text ? t.textPrimary : t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {text || 'recording'}
    </div>
  )
}

// ── recording a take ───────────────────────────────────────────────────────

type TakeState = { kind: 'idle' } | { kind: 'recording' } | { kind: 'busy'; label: string } | { kind: 'error'; message: string }

export function RecordTake({ block }: { block: BlockOf<'recording'> }) {
  const { t } = useTheme()
  const store = useStore()
  const [state, setState] = useState<TakeState>({ kind: 'idle' })
  const [reference, setReference] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [live, setLive] = useState('')
  const [levels, setLevels] = useState<number[]>(() => new Array<number>(ENVELOPE_BARS).fill(0))
  const handle = useRef<RecorderHandle | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const alive = useRef(true)
  const supported = isRecordingSupported()
  const canTranscribe = isRecognitionSupported()

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      handle.current?.cancel()
      handle.current = null
      if (timer.current) clearInterval(timer.current)
    }
  }, [])

  const finishWith = async (run: () => Promise<{ asset_id: string; title?: string }>) => {
    try {
      const { asset_id } = await run()
      const liveBlock = (store.get().blocks.get(block.id) as BlockOf<'recording'> | undefined) ?? block
      commitBlockContent(store, liveBlock, { ...liveBlock.content, asset_id })
      if (alive.current) setState({ kind: 'idle' })
    } catch (e) {
      if (alive.current) setState({ kind: 'error', message: errorMessage(e) })
    }
  }

  const begin = async () => {
    if (state.kind !== 'idle' && state.kind !== 'error') return
    try {
      const h = await startRecording({
        reference,
        onTranscript: (text) => {
          if (alive.current) setLive(text)
        },
        onLevel: (level) => {
          if (alive.current) setLevels((prev) => [...prev.slice(1), level])
        },
      })
      handle.current = h
      setLive('')
      setElapsed(0)
      setLevels(new Array<number>(ENVELOPE_BARS).fill(0))
      setState({ kind: 'recording' })
      timer.current = setInterval(() => {
        if (alive.current) setElapsed(h.elapsed())
      }, 250)
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error && e.name === 'NotAllowedError' ? 'the microphone was not allowed' : errorMessage(e) })
    }
  }

  const end = async () => {
    const h = handle.current
    if (!h || state.kind !== 'recording') return
    handle.current = null
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setState({ kind: 'busy', label: 'keeping it' })
    await finishWith(async () => {
      const take = await h.stop()
      if (take.duration_s < 0.5 || take.blob.size === 0) throw new Error('that take was too short')
      const { envelope, duration_s } = await analyseAudio(take.blob).catch(() => ({
        envelope: new Array<number>(ENVELOPE_BARS).fill(0.3),
        duration_s: take.duration_s,
      }))
      const asset = await uploadAudio(store, block.project_id, {
        blob: take.blob,
        mime: take.mime,
        ext: take.ext,
        duration_s,
        envelope,
        own_voice: take.own_voice,
        transcript: take.transcript,
      })
      return { asset_id: asset.id }
    })
  }

  const chooseFile = async () => {
    if (state.kind === 'recording' || state.kind === 'busy') return
    const [file] = await pickFiles(AUDIO_ACCEPT)
    if (!file) return
    setState({ kind: 'busy', label: 'uploading' })
    await finishWith(async () => {
      const asset = await uploadAudioFile(store, block.project_id, file)
      return { asset_id: asset.id }
    })
  }

  const toggleReference = (v: boolean) => {
    setReference(v)
    handle.current?.setReference(v)
    if (v) setLive('')
  }

  const recording = state.kind === 'recording'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <RoundButton
          onClick={() => void (recording ? end() : begin())}
          ariaLabel={recording ? 'stop' : 'record'}
          disabled={!supported || state.kind === 'busy'}
        >
          {recording ? <Square size={12} strokeWidth={1.5} fill="currentColor" /> : <Mic size={14} strokeWidth={1.5} />}
        </RoundButton>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ ...canvasType.title, color: t.textPrimary }}>{recording ? 'recording' : state.kind === 'busy' ? state.label : 'record a take'}</div>
          <div style={{ ...canvasType.meta, color: t.textMuted, marginTop: 2 }}>
            {recording ? formatDuration(elapsed) : supported ? (reference ? 'a reference is not listened to' : canTranscribe ? 'your own voice, transcribed as your words' : 'your own voice') : 'recording is not available in this browser'}
          </div>
        </div>
      </div>

      {recording && <Waveform envelope={levels} />}

      {recording && !reference && (
        <div style={{ backgroundColor: t.cardBgInner, borderRadius: 10, padding: 12, minHeight: 40 }}>
          <div style={{ ...canvasType.small, color: live ? t.textPrimary : t.textMuted, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {live || (canTranscribe ? 'listening' : 'this browser cannot transcribe; the take is still kept')}
          </div>
        </div>
      )}

      {!recording && state.kind !== 'busy' && (
        <label
          data-no-drag
          onPointerDown={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', ...canvasType.small, color: t.textSecondary }}
        >
          <input
            type="checkbox"
            checked={reference}
            onChange={(e) => toggleReference(e.target.checked)}
            style={{ width: 14, height: 14, margin: 0, accentColor: t.textPrimary }}
          />
          this is a reference — not listened to, no transcript
        </label>
      )}

      {recording && (
        <label
          data-no-drag
          onPointerDown={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', ...canvasType.meta, color: t.textMuted }}
        >
          <input type="checkbox" checked={reference} onChange={(e) => toggleReference(e.target.checked)} style={{ width: 12, height: 12, margin: 0, accentColor: t.textPrimary }} />
          keep this as a reference instead
        </label>
      )}

      {!recording && state.kind !== 'busy' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${line.onPaper(t)}`, paddingTop: 10 }}>
          <ChipButton onClick={() => void chooseFile()} icon={<FileAudio size={12} strokeWidth={1.5} />}>
            or choose a file
          </ChipButton>
          <span style={{ ...canvasType.meta, color: t.textMuted, transition: `opacity ${motionSpec.hoverMs}ms ease` }}>kept as a reference</span>
        </div>
      )}

      {state.kind === 'error' && <MediaStatus tone="ember">{state.message}</MediaStatus>}
    </div>
  )
}
