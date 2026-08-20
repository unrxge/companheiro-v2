'use client'

import { motion } from 'motion/react'

export function IconButton({
  href,
  onClick,
  ariaLabel,
  children,
}: {
  href?: string
  onClick?: () => void
  ariaLabel: string
  children: React.ReactNode
}) {
  const style: React.CSSProperties = {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: '1px solid rgba(232, 230, 224, 0.14)',
    backgroundColor: 'rgba(232, 230, 224, 0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  }

  if (href) {
    return (
      <motion.a
        href={href}
        aria-label={ariaLabel}
        title={ariaLabel}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.93 }}
        style={style}
      >
        {children}
      </motion.a>
    )
  }

  return (
    <motion.button
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.93 }}
      style={style}
    >
      {children}
    </motion.button>
  )
}
