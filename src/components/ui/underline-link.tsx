'use client'

import { accentColor } from '@/lib/card-theme'

export function UnderlineLink({
  href,
  children,
  color,
  onClick,
  style,
}: {
  href?: string
  children: React.ReactNode
  color: string
  onClick?: () => void
  style?: React.CSSProperties
}) {
  const sharedProps = {
    className: 'group relative inline-block',
    style: {
      color,
      fontSize: '12px',
      cursor: 'pointer',
      transition: 'color 0.2s ease',
      background: 'none',
      border: 'none',
      padding: 0,
      ...style,
    } as React.CSSProperties,
  }

  const underline = (
    <span
      className="absolute -bottom-0.5 left-0 h-px w-0 transition-all duration-300 ease-out group-hover:w-full"
      style={{ backgroundColor: accentColor }}
    />
  )

  if (onClick && !href) {
    return (
      <button onClick={onClick} {...sharedProps}>
        {children}
        {underline}
      </button>
    )
  }

  return (
    <a href={href} onClick={onClick} {...sharedProps}>
      {children}
      {underline}
    </a>
  )
}
