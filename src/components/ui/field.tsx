'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { fonts, radius } from '@/lib/design-tokens'

interface CommonProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  /** Fraunces at 16px for the person's own words; default is Geist. */
  voice?: boolean
  /** No box: bare text on whatever surface sits beneath. */
  bare?: boolean
  style?: React.CSSProperties
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void
  onFocus?: () => void
  onBlur?: () => void
  autoFocus?: boolean
}

function useFieldStyle(bare: boolean, voice: boolean, focused: boolean): React.CSSProperties {
  const { t } = useTheme()
  return {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: bare ? 'transparent' : t.inputBg,
    border: bare ? 'none' : `1px solid ${focused ? t.ember : t.inputBorder}`,
    borderRadius: bare ? 0 : radius.field,
    padding: bare ? 0 : '11px 14px',
    fontFamily: voice ? fonts.display : fonts.ui,
    fontSize: voice ? 16 : 15,
    fontVariationSettings: voice ? '"opsz" 24, "SOFT" 30' : undefined,
    lineHeight: 1.55,
    color: t.textPrimary,
    outline: 'none',
    transition: 'border-color 0.15s ease',
  }
}

export function TextField({ value, onChange, placeholder, disabled, ariaLabel, voice = false, bare = false, style, onKeyDown, onFocus, onBlur, autoFocus, type = 'text' }: CommonProps & { type?: 'text' | 'url' | 'email' | 'password' }) {
  const [focused, setFocused] = useState(false)
  const s = useFieldStyle(bare, voice, focused)
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
      onFocus={() => { setFocused(true); onFocus?.() }}
      onBlur={() => { setFocused(false); onBlur?.() }}
      style={{ ...s, ...style }}
    />
  )
}

/** Auto-growing textarea. `maxHeight` caps growth and scrolls inside. */
export function TextArea({ value, onChange, placeholder, disabled, ariaLabel, voice = false, bare = false, style, onKeyDown, onFocus, onBlur, autoFocus, minRows = 1, maxHeight = 420 }: CommonProps & { minRows?: number; maxHeight?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [focused, setFocused] = useState(false)
  const s = useFieldStyle(bare, voice, focused)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`
  }, [value, maxHeight])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      rows={minRows}
      spellCheck
      onKeyDown={onKeyDown}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus={autoFocus}
      onFocus={() => { setFocused(true); onFocus?.() }}
      onBlur={() => { setFocused(false); onBlur?.() }}
      style={{ ...s, resize: 'none', overflowY: 'auto', maxHeight, ...style }}
    />
  )
}
