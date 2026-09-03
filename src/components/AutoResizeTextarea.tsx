'use client'

import { useEffect, useRef, useState } from 'react'

interface AutoResizeTextareaProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  minRows?: number
  className?: string
  style?: React.CSSProperties
}

export default function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  minRows = 1,
  className,
  style,
}: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [lang, setLang] = useState<string>('en')

  useEffect(() => {
    // Use the browser's preferred language for spell checking.
    // navigator.language returns e.g. "en-GB", "pt-PT", "fr-FR".
    setLang(navigator.language || 'en')
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={minRows}
      lang={lang}
      spellCheck
      className={className}
      style={{ resize: 'none', overflowY: 'auto', maxHeight: '420px', ...style }}
    />
  )
}
