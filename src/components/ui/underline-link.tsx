'use client'

import Link from 'next/link'
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
    // The words are 12px, which is too little to press. The `before` is an
    // unseen 10px above and below them, so the link is a finger's height
    // without taking any more room on the page.
    className: "group relative inline-block before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']",
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

  // A page of this app: move there without reloading the whole document.
  if (href?.startsWith('/')) {
    return (
      <Link href={href} onClick={onClick} {...sharedProps}>
        {children}
        {underline}
      </Link>
    )
  }

  return (
    <a href={href} onClick={onClick} {...sharedProps}>
      {children}
      {underline}
    </a>
  )
}
