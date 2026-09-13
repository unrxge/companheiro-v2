'use client'

import { motion as m } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'

/**
 * The check-in mic, kept exactly as minimal: a circle with a dot; recording
 * inverts it to a square. Used everywhere dictation exists so every mic
 * in the app is the same object.
 */
export function MicButton({
  recording,
  onToggle,
  disabled = false,
  size = 64,
  onShell = false,
}: {
  recording: boolean
  onToggle: () => void
  disabled?: boolean
  size?: number
  /** Sits directly on the dark shell rather than on a card. */
  onShell?: boolean
}) {
  const { t } = useTheme()
  const idleBg = onShell ? '#1c1916' : t.inputBg
  const idleBorder = onShell ? '#352f29' : t.inputBorder
  const idleDot = onShell ? '#aaa59c' : t.textSecondary
  const glyph = Math.round(size * 0.24)
  return (
    <m.button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={recording ? 'Stop recording' : 'Start recording'}
      aria-pressed={recording}
      whileHover={disabled ? {} : { scale: 1.04 }}
      whileTap={disabled ? {} : { scale: 0.96 }}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: recording ? '#ece9e2' : idleBg,
        border: `1.5px solid ${recording ? 'transparent' : idleBorder}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.3 : 1,
        boxShadow: t.shadow,
        transition: 'background-color 0.25s ease, border-color 0.25s ease',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'block',
          width: glyph,
          height: glyph,
          borderRadius: recording ? 3 : '50%',
          backgroundColor: recording ? '#0d0c0b' : idleDot,
          transition: 'border-radius 0.2s ease, background-color 0.2s ease',
        }}
      />
    </m.button>
  )
}
