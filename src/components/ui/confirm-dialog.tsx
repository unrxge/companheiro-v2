'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion as m } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { DangerButton, GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { radius, type as typeRoles } from '@/lib/design-tokens'

interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type Ask = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Ask | null>(null)

/**
 * Replaces window.confirm(). `const confirm = useConfirm()` then
 * `if (await confirm({ title: 'Delete this idea?', danger: true })) …`.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTheme()
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const ask = useCallback<Ask>((o) => {
    setOpts(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setOpts(null)
  }

  const value = useMemo(() => ask, [ask])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {opts && (
          <m.div
            key="confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => settle(false)}
            role="presentation"
            style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(10, 9, 8, 0.78)', backdropFilter: 'blur(6px)' }}
          >
            <m.div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              style={{ backgroundColor: t.containerBg, boxShadow: t.containerShadow, borderRadius: radius.card, padding: 24, width: '100%', maxWidth: 400 }}
            >
              <h2 id="confirm-title" style={{ ...typeRoles.h2, fontSize: 20, color: t.textPrimary }}>{opts.title}</h2>
              {opts.body && <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary, marginTop: 10 }}>{opts.body}</p>}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
                <GhostButton onClick={() => settle(false)}>{opts.cancelLabel ?? 'Keep it'}</GhostButton>
                {opts.danger ? (
                  <DangerButton onClick={() => settle(true)}>{opts.confirmLabel ?? 'Delete'}</DangerButton>
                ) : (
                  <PrimaryButton onClick={() => settle(true)}>{opts.confirmLabel ?? 'Confirm'}</PrimaryButton>
                )}
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext)
  if (ask) return ask
  // Outside the provider (tests, stories): fall back to the native dialog.
  return async (o) => (typeof window !== 'undefined' ? window.confirm(o.title) : false)
}
