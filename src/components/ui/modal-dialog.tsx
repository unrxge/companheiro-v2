'use client'

import { motion, AnimatePresence } from 'motion/react'
import { cardPalette, type CardTheme } from '@/lib/card-theme'

export function ModalDialog({
  theme,
  onClose,
  title,
  subtitle,
  headerActions,
  footer,
  maxWidth = '560px',
  children,
}: {
  theme: CardTheme
  onClose: () => void
  title: string
  subtitle?: React.ReactNode
  headerActions?: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: string
  children: React.ReactNode
}) {
  const c = cardPalette[theme]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          backgroundColor: 'rgba(10, 9, 8, 0.82)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: c.containerBg,
            boxShadow: c.containerShadow,
            borderRadius: '24px',
            maxWidth,
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '20px 24px',
              borderBottom: `1px solid ${c.divider}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '16px',
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2
                style={{
                  fontFamily: 'var(--font-geist-sans)',
                  fontWeight: 700,
                  fontSize: '19px',
                  color: c.textPrimary,
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}
              >
                {title}
              </h2>
              {subtitle && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', fontSize: '11px', color: c.textMuted }}>
                  {subtitle}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              {headerActions}
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: c.textMuted,
                  transition: 'color 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = c.textPrimary
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = c.textMuted
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>{children}</div>

          {footer && (
            <div style={{ padding: '16px 24px', borderTop: `1px solid ${c.divider}`, flexShrink: 0 }}>{footer}</div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
