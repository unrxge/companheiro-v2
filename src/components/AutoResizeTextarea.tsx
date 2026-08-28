'use client'

import { useEffect, useRef } from 'react'

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
      className={className}
      style={{ resize: 'none', overflowY: 'auto', maxHeight: '420px', ...style }}
    />
  )
}
