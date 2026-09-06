'use client'

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { Pill } from '@/components/ui/pill'
import { arcHue, fonts, radius, type Arc } from '@/lib/design-tokens'
import type { Energy } from '@/components/widgets/weather-strip'

const ARCS: Arc[] = ['Breakaway', 'Beginning', 'Expansion', 'Integration']
const ENERGIES: Energy[] = ['low', 'medium', 'high']

export interface Signals {
  energy: Energy
  inner_weather: string
  arc_texture: Arc
}

/**
 * The three signals extracted from a check-in, shown back as small cards the
 * person can correct. Tap Energy or Arc to pick; the weather word is edited
 * in place. This is both the transparency moment and the data-quality fix.
 */
export function SignalCards({ signals, onChange }: { signals: Signals; onChange?: (next: Signals) => void }) {
  const { t } = useTheme()
  const [editing, setEditing] = useState<'energy' | 'arc' | 'weather' | null>(null)
  const editable = !!onChange
  const cell: React.CSSProperties = {
    backgroundColor: t.cardBg,
    boxShadow: t.shadow,
    borderRadius: radius.field,
    padding: '10px 12px',
    minWidth: 0,
    border: 'none',
    textAlign: 'left',
    font: 'inherit',
    color: 'inherit',
    cursor: editable ? 'pointer' : 'default',
  }
  const k: React.CSSProperties = { fontFamily: fonts.ui, fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.textMuted, margin: 0 }
  const v: React.CSSProperties = { fontFamily: fonts.display, fontSize: 16, lineHeight: 1.25, color: t.textPrimary, marginTop: 4, fontVariationSettings: '"opsz" 32, "SOFT" 40' }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <button type="button" style={cell} onClick={() => editable && setEditing(editing === 'energy' ? null : 'energy')} aria-label="Energy">
          <p style={k}>Energy</p>
          <p style={v}>{signals.energy}</p>
        </button>
        <button type="button" style={cell} onClick={() => editable && setEditing(editing === 'weather' ? null : 'weather')} aria-label="Inner weather">
          <p style={k}>Weather</p>
          <p style={{ ...v, fontStyle: 'italic' }}>{signals.inner_weather}</p>
        </button>
        <button type="button" style={cell} onClick={() => editable && setEditing(editing === 'arc' ? null : 'arc')} aria-label="Arc texture">
          <p style={k}>Arc</p>
          <p style={{ ...v, color: t[arcHue[signals.arc_texture]] }}>{signals.arc_texture}</p>
        </button>
      </div>
      {editable && editing === 'energy' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {ENERGIES.map((e) => (
            <Pill key={e} hue="neutral" selected={signals.energy === e} onClick={() => { onChange!({ ...signals, energy: e }); setEditing(null) }} size="md">
              {e}
            </Pill>
          ))}
        </div>
      )}
      {editable && editing === 'arc' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          {ARCS.map((a) => (
            <Pill key={a} hue={arcHue[a]} selected={signals.arc_texture === a} onClick={() => { onChange!({ ...signals, arc_texture: a }); setEditing(null) }} size="md">
              {a}
            </Pill>
          ))}
        </div>
      )}
      {editable && editing === 'weather' && (
        <input
          autoFocus
          value={signals.inner_weather}
          onChange={(e) => onChange!({ ...signals, inner_weather: e.target.value })}
          onBlur={() => setEditing(null)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') setEditing(null) }}
          aria-label="Inner weather"
          style={{ marginTop: 10, width: '100%', boxSizing: 'border-box', backgroundColor: t.inputBg, border: `1px solid ${t.ember}`, borderRadius: radius.field, padding: '9px 12px', fontFamily: fonts.display, fontStyle: 'italic', fontSize: 15, color: t.textPrimary, outline: 'none' }}
        />
      )}
    </div>
  )
}
