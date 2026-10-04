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

export interface CheckInRecord {
  energy: 'low' | 'medium' | 'high'
  arc: Arc
  weather: string | null
  entry: string | null
  /** Localised HH:MM, shown in the hover tooltip. */
  time: string
}

/** Max check-ins shown per day in the strip. */
export const MAX_CHECKINS_PER_DAY = 3

const ENERGY_INTENSITY = { low: 0.55, medium: 0.8, high: 1 } as const

/** Mood + intensity for the shell from the most recent check-in. */
export function atmosphereFromCheckIns(checkIns: StoredCheckIn[]): { mood: Mood; intensity: number } {
  const latest = checkIns[0]
  if (!latest || !latest.arc_texture) return { mood: 'neutral', intensity: 0.8 }
  return { mood: arcHue[latest.arc_texture] ?? 'neutral', intensity: ENERGY_INTENSITY[latest.energy] ?? 0.8 }
}

/** Per-day seconds from `/api/write/activity`, keyed by the same local date string it was posted with. */
export interface WritingActivityRow {
  date: string
  seconds: number
}

/**
 * Last `days` calendar days as WeatherStrip input.
 * Each day carries up to MAX_CHECKINS_PER_DAY entries in chronological order.
 */
export function weatherDays(checkIns: StoredCheckIn[], days = 30, writingActivity: WritingActivityRow[] = []): WeatherDay[] {
  // Collect all check-ins per calendar day, sorted oldest → newest
  const byDay = new Map<string, StoredCheckIn[]>()
  for (const c of checkIns) {
    const key = c.created_at.slice(0, 10)
    const arr = byDay.get(key) ?? []
    arr.push(c)
    byDay.set(key, arr)
  }
  for (const [key, arr] of byDay) {
    byDay.set(key, arr.sort((a, b) => a.created_at.localeCompare(b.created_at)))
  }

  const writingByDay = new Map<string, number>()
  for (const a of writingActivity) writingByDay.set(a.date, a.seconds)

  const out: WeatherDay[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = localDateKey(d)
    const dayCheckIns = byDay.get(key) ?? []

    // Primary values from the latest check-in (backward compat)
    const latest = dayCheckIns[dayCheckIns.length - 1]

    // Cap and convert to CheckInRecord array
    const records: CheckInRecord[] = dayCheckIns
      .slice(-MAX_CHECKINS_PER_DAY) // keep the last N (most recent, if over cap)
      .filter((c): c is StoredCheckIn & { arc_texture: Arc } => c.arc_texture !== null)
      .map((c) => ({
        energy: c.energy,
        arc: c.arc_texture,
        weather: c.inner_weather ?? null,
        entry: c.raw_entry ?? null,
        time: new Date(c.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      }))

    out.push({
      date: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      energy: latest?.energy ?? null,
      arc: latest?.arc_texture ?? null,
      weather: latest?.inner_weather ?? null,
      entry: latest?.raw_entry ?? null,
      writingMinutes: Math.round((writingByDay.get(key) ?? 0) / 60),
      checkIns: records.length > 0 ? records : undefined,
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
