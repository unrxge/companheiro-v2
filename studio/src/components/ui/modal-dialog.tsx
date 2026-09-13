'use client'

import { AnimatePresence, motion as m } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { IconButton } from '@/components/ui/icon-button'
import { radius, shell, type as typeRoles, type Theme } from '@/lib/design-tokens'

/**
 * Centred dialog: dark backdrop, container panel, chrome-less header, optional
 * footer. Theme comes from the app provider; the old `theme` prop is accepted
 * and ignored so callers migrate at their own pace.
 */
export function ModalDialog({
  onClose,
  title,
  subtitle,
  headerActions,
  footer,
  maxWidth = '560px',
  children,
}: {
  theme?: Theme
  onClose: () => void
  title: string
  subtitle?: React.ReactNode
  headerActions?: React.ReactNode
  footer?: React.ReactNode
  maxWidth?: string
  children: React.ReactNode
}) {
  const { t } = useTheme()

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 70,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
          backgroundColor: 'rgba(10, 9, 8, 0.82)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <m.div
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: t.containerBg,
            boxShadow: t.containerShadow,
            borderRadius: radius.container,
            maxWidth,
            width: '100%',
            maxHeight: '88dvh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '20px 24px', borderBottom: `1px solid ${t.divider}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexShrink: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ ...typeRoles.h2, fontSize: 20, color: t.textPrimary }}>{title}</h2>
              {subtitle && <div style={{ display: 'flex', gap: 8, marginTop: 8, ...typeRoles.small, fontSize: 12, color: t.textMuted, flexWrap: 'wrap' }}>{subtitle}</div>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {headerActions}
              <IconButton onClick={onClose} ariaLabel="Close" tone="card">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </IconButton>
            </div>
          </div>

          <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>{children}</div>

          {footer && <div style={{ padding: '16px 24px', borderTop: `1px solid ${t.divider}`, flexShrink: 0 }}>{footer}</div>}
        </m.div>
      </m.div>
    </AnimatePresence>
  )
}

export { shell as modalShell }
