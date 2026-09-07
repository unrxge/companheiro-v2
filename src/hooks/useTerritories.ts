'use client'

import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_SLOTS, territoryHue, territoryLabel, territoryShort, type TerritorySlot } from '@/lib/territories'

/** The user's territory slots, with label helpers bound to them. */
export function useTerritories() {
  const [slots, setSlots] = useState<TerritorySlot[]>(DEFAULT_SLOTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/idea-lab/territories')
      .then((r) => r.json())
      .then((d) => {
        if (alive && Array.isArray(d.slots)) setSlots(d.slots)
      })
      .catch(() => {})
      .finally(() => alive && setLoaded(true))
    return () => {
      alive = false
    }
  }, [])

  const save = useCallback((next: TerritorySlot[]) => {
    setSlots(next)
    return fetch('/api/idea-lab/territories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots: next }),
    }).catch((err) => console.error('Failed to save territories:', err))
  }, [])

  return {
    slots,
    loaded,
    save,
    label: (key: string | null | undefined) => territoryLabel(key, slots),
    short: (key: string | null | undefined) => territoryShort(key, slots),
    hue: (key: string | null | undefined) => territoryHue(key, slots),
  }
}
