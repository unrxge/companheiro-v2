// Shared helpers for turning stored check-ins into atmosphere + weather strip.
import type { Arc, Mood } from '@/lib/design-tokens'
import { arcHue } from '@/lib/design-tokens'
import type { WeatherDay } from '@/components/widgets/weather-strip'

export interface StoredCheckIn {
  id: string
  created_at: string
  raw_entry: string
  energy: 'low' | 'medium' | 'high'
  inner_weather: string
  arc_texture: Arc | null
}

const ENERGY_INTENSITY = { low: 0.55, medium: 0.8, high: 1 } as const

/** Mood + intensity for the shell from the most recent check-in. */
export function atmosphereFromCheckIns(checkIns: StoredCheckIn[]): { mood: Mood; intensity: number } {
  const latest = checkIns[0]
  if (!latest || !latest.arc_texture) return { mood: 'neutral', intensity: 0.8 }
  return { mood: arcHue[latest.arc_texture] ?? 'neutral', intensity: ENERGY_INTENSITY[latest.energy] ?? 0.8 }
}

/** Last `days` calendar days as WeatherStrip input (one bar per day, latest check-in wins). */
export function weatherDays(checkIns: StoredCheckIn[], days = 30): WeatherDay[] {
  const byDay = new Map<string, StoredCheckIn>()
  for (const c of checkIns) {
    const key = c.created_at.slice(0, 10)
    const prev = byDay.get(key)
    if (!prev || prev.created_at < c.created_at) byDay.set(key, c)
  }
  const out: WeatherDay[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = localDateKey(d)
    const c = byDay.get(key)
    out.push({
      date: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      energy: c?.energy ?? null,
      arc: c?.arc_texture ?? null,
      weather: c?.inner_weather ?? null,
      entry: c?.raw_entry ?? null,
    })
  }
  return out
}

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
