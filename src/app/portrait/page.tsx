'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface PortraitEntry {
  id: string
  kind: 'processing_pattern' | 'recurring_theme' | 'creative_pattern' | 'guidance_note'
  statement: string
  reinforcement_count: number
  last_reinforced_at: string
}

const KIND_LABELS: Record<PortraitEntry['kind'], string> = {
  processing_pattern: 'How you process things',
  recurring_theme: 'What keeps recurring',
  creative_pattern: 'How you develop ideas',
  guidance_note: 'What kind of guidance works',
}

export default function PortraitPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<PortraitEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [retiringId, setRetiringId] = useState<string | null>(null)

  useEffect(() => {
    fetchEntries()
  }, [])

  const fetchEntries = async () => {
    try {
      const res = await fetch('/api/portrait/list')
      const data = await res.json()
      setEntries(data.entries || [])
    } catch (err) {
      console.error('Failed to fetch portrait:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRetire = async (id: string) => {
    setRetiringId(id)
    try {
      const res = await fetch('/api/portrait/retire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id))
      }
    } catch (err) {
      console.error('Failed to retire entry:', err)
    } finally {
      setRetiringId(null)
    }
  }

  const grouped = (Object.keys(KIND_LABELS) as PortraitEntry['kind'][])
    .map((kind) => ({ kind, items: entries.filter((e) => e.kind === kind) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="min-h-screen bg-[#111110] flex flex-col">
      <div className="flex-1 px-6 py-12 max-w-2xl mx-auto w-full">
        <div className="space-y-8">
          <div>
            <button
              onClick={() => router.push('/home')}
              className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] transition-colors mb-3"
            >
              ← Home
            </button>
            <h1 className="text-3xl font-light text-[#e8e6e1] mb-2">My Portrait</h1>
            <p className="text-sm text-[#4a4946]">
              What the system has come to understand about you — only things you&apos;ve confirmed.
              Nothing here shapes tone, only how it approaches you. Retire anything that no longer fits.
            </p>
          </div>

          {isLoading ? (
            <p className="text-sm text-[#3d3c39]">Loading...</p>
          ) : entries.length === 0 ? (
            <p className="text-base text-[#6a6866] leading-relaxed">
              Nothing confirmed yet. As you check in, develop ideas, and zoom out over time, the
              system may occasionally ask if a pattern it&apos;s noticed feels true — what you confirm
              shows up here.
            </p>
          ) : (
            <div className="space-y-6">
              {grouped.map(({ kind, items }) => (
                <div key={kind} className="space-y-3">
                  <h2 className="text-xs text-[#4a4946] uppercase tracking-widest">
                    {KIND_LABELS[kind]}
                  </h2>
                  <div className="space-y-2">
                    {items.map((entry) => (
                      <div
                        key={entry.id}
                        className="bg-[#161614] border border-[#1f1f1d] rounded p-4 flex items-start justify-between gap-4"
                      >
                        <p className="text-base text-[#d4d2cd] leading-relaxed flex-1">
                          {entry.statement}
                        </p>
                        <button
                          onClick={() => handleRetire(entry.id)}
                          disabled={retiringId === entry.id}
                          className="text-xs text-[#6b6966] hover:text-red-300 transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          {retiringId === entry.id ? 'Retiring...' : 'Forget this'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
