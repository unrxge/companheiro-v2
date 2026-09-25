'use client'

// studio/src/components/work/lock-modal.tsx — the write-lock's own dialog.
//
// Picks a duration and locks the companion to Reflect for that stretch,
// everywhere, including the main app — extend-only, the same commitment
// device either app offers, on the same underlying setting.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { Portal } from '@/components/ui/portal'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { radius } from '@/lib/design-tokens'

export function LockModal({
  open, busy, onClose, onConfirm,
}: {
  open: boolean
  busy: boolean
  onClose: () => void
  onConfirm: (minutes: number) => void
}) {
  const { t } = useTheme()
  const [hours, setHours] = useState(0)
  const [minutes, setMinutes] = useState(30)

  if (!open) return null
  const total = hours * 60 + minutes

  return (
    <Portal>
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 95, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(10,9,8,0.78)', backdropFilter: 'blur(6px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lock the companion to reflect-only"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380, padding: 24, borderRadius: radius.card,
          background: t.containerBg, boxShadow: t.containerShadow,
        }}
      >
        <h2 style={{ ...canvasType.headingMd, fontSize: 19, color: t.textPrimary, margin: 0 }}>
          Lock to reflect-only
        </h2>
        <p style={{ ...canvasType.small, color: t.textSecondary, margin: '10px 0 0' }}>
          For this long, Suggest is off everywhere — this app and the main one, since it&rsquo;s the same
          setting. It cannot be shortened or cleared early; that restriction is the entire point.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18 }}>
          <NumberField label="Hours" value={hours} max={12} onChange={setHours} />
          <NumberField label="Minutes" value={minutes} max={55} step={5} onChange={setMinutes} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <GhostButton size="sm" onClick={onClose}>Never mind</GhostButton>
          <PrimaryButton size="sm" onClick={() => onConfirm(total)} disabled={busy || total <= 0}>
            {busy ? 'Locking…' : `Lock for ${hours ? `${hours}h ` : ''}${minutes}m`}
          </PrimaryButton>
        </div>
      </div>
    </div>
    </Portal>
  )
}

function NumberField({
  label, value, max, step = 1, onChange,
}: {
  label: string
  value: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  const { t } = useTheme()
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <span style={{ ...canvasType.chip, color: t.textMuted }}>{label}</span>
      <input
        type="number"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
        style={{
          ...canvasType.body, color: t.textPrimary, background: t.inputBg,
          border: `1px solid ${t.inputBorder}`, borderRadius: radius.field,
          padding: '8px 10px', outline: 'none', width: '100%', boxSizing: 'border-box',
        }}
      />
    </label>
  )
}
