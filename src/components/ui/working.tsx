'use client'

import { useEffect, useState } from 'react'
import { motion as m, useReducedMotion } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { type as typeRoles } from '@/lib/design-tokens'

/**
 * Three dots that rise and fade in turn: the app's one sign that something is
 * happening in the background. Sized in em so it sits inside any line of text
 * or button label and takes that text's colour. Reduced motion keeps a slow
 * fade, since a completely still indicator reads as frozen.
 */
export function WorkingDots({ color = 'currentColor', size = '0.34em' }: { color?: string; size?: string }) {
  const reduce = useReducedMotion() ?? false
  return (
    <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', gap: `calc(${size} * 0.7)`, height: '1em', verticalAlign: 'middle' }}>
      {[0, 1, 2].map((i) => (
        <m.span
          key={i}
          style={{ width: size, height: size, borderRadius: '50%', backgroundColor: color, display: 'block' }}
          initial={{ opacity: 0.25, y: 0 }}
          animate={reduce ? { opacity: [0.25, 0.9, 0.25] } : { opacity: [0.25, 1, 0.25], y: ['0em', '-0.18em', '0em'] }}
          transition={{ duration: reduce ? 2.4 : 1.1, repeat: Infinity, ease: 'easeInOut', delay: i * (reduce ? 0.4 : 0.16) }}
        />
      ))}
    </span>
  )
}

/**
 * A line saying what is being worked on, with the dots beside it. After
 * `patientAfter` seconds a quieter second line says it is still going, so a
 * long model call never looks like a hang.
 */
export function Working({
  label,
  patientNote = 'Still working. This one can take a little while.',
  patientAfter = 12,
  color,
  size = 'md',
  style,
}: {
  label: string
  patientNote?: string | null
  patientAfter?: number
  color?: string
  size?: 'sm' | 'md'
  style?: React.CSSProperties
}) {
  const { t } = useTheme()
  const [patient, setPatient] = useState(false)
  useEffect(() => {
    if (!patientNote) return
    const id = window.setTimeout(() => setPatient(true), patientAfter * 1000)
    return () => window.clearTimeout(id)
  }, [patientNote, patientAfter])

  const textColor = color ?? t.textSecondary
  const role = size === 'sm' ? typeRoles.small : typeRoles.ui
  return (
    <div role="status" aria-live="polite" style={style}>
      <p style={{ ...role, color: textColor, display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
        <WorkingDots color={t.ember} />
        <span>{label}</span>
      </p>
      {patient && patientNote && (
        <m.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          style={{ ...typeRoles.small, color: t.textMuted, margin: '6px 0 0' }}
        >
          {patientNote}
        </m.p>
      )}
    </div>
  )
}
