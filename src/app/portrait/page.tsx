'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { GhostButton } from '@/components/ui/buttons'
import { Pill } from '@/components/ui/pill'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { formatDateShort } from '@/lib/dates'
import { type as typeRoles } from '@/lib/design-tokens'
import { Working } from '@/components/ui/working'
import { KIND_LABELS, KIND_HUE, DECAY_DAYS } from '@/lib/portrait-kinds'
import { alpha } from '@/lib/design-tokens'
import { usePhone } from '@/lib/use-phone'
import { ExampleTour } from '@/components/studio/work/example-tour'
import { useExampleTour } from '@/lib/examples/use-example-tour'
import { PORTRAIT_DEMO, portraitShows, portraitTourSteps, type PortraitDemo } from '@/lib/page-tours'

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()

/** The Portrait's walk: the invented patterns a stage shows (lib/page-tours.ts). */
function demoEntries(which: 'none' | 'first-once' | 'first' | 'all'): PortraitEntry[] {
  if (which === 'none') return []
  const all = PORTRAIT_DEMO.entries.map((e, i) => ({
    id: e.id, kind: e.kind, statement: e.statement,
    reinforcement_count: e.count, last_reinforced_at: daysAgo(2 + i), created_at: daysAgo(41 + i * 6),
    seen_in: Array.from({ length: e.checkIns }, (_, k) => daysAgo(2 + k * 9)),
  }))
  if (which === 'all') return all
  const first = all[0]
  return which === 'first' ? [first] : [{ ...first, reinforcement_count: 1, created_at: daysAgo(2), seen_in: [daysAgo(2)] }]
}

interface PortraitEntry {
  id: string
  kind: 'processing_pattern' | 'recurring_theme' | 'creative_pattern' | 'guidance_note'
  statement: string
  reinforcement_count: number
  last_reinforced_at: string
  created_at?: string
  /** Dates of the check-ins this was noticed in, newest first. */
  seen_in?: string[]
}

type Order = 'reinforced' | 'recent'
const ORDER_KEY = 'portrait-order'
const ORDERS: { key: Order; label: string }[] = [
  { key: 'reinforced', label: 'Most reinforced' },
  { key: 'recent', label: 'Most recent' },
]

// Most reinforced: what has come up most often, ties broken by what was seen
// last. Most recent: what the companion picked up newest.
function sortEntries(list: PortraitEntry[], order: Order): PortraitEntry[] {
  const firstSeen = (e: PortraitEntry) => e.created_at ?? e.last_reinforced_at
  return [...list].sort((a, b) =>
    order === 'recent'
      ? firstSeen(b).localeCompare(firstSeen(a))
      : b.reinforcement_count - a.reinforcement_count || b.last_reinforced_at.localeCompare(a.last_reinforced_at)
  )
}

/** Rows a section shows before it folds, and how many each "Show more" adds. */
const PAGE_SIZE = 4
/** Days left before retirement at which a row starts saying it is fading. */
const FADING_WITHIN_DAYS = 45

function daysUntilRetired(lastReinforcedAt: string): number {
  const elapsed = (Date.now() - new Date(lastReinforcedAt).getTime()) / 86_400_000
  return Math.max(0, Math.ceil(DECAY_DAYS - elapsed))
}

/** Folds a long section: the last rows fade into the card rather than stopping at a hard edge. */
const FADE = 'linear-gradient(to bottom, #000 calc(100% - 64px), transparent 100%)'
const FADE_STYLE: React.CSSProperties = { maskImage: FADE, WebkitMaskImage: FADE }

export default function PortraitPage() {
  const { t } = useTheme()
  const confirm = useConfirm()

  const [entries, setEntries] = useState<PortraitEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [retiringId, setRetiringId] = useState<string | null>(null)
  const [shown, setShown] = useState<Partial<Record<PortraitEntry['kind'], number>>>({})
  const [order, setOrder] = useState<Order>('reinforced')
  // The first visit: where a pattern comes from, played with an invented check-in.
  const phone = usePhone()
  const [demoStage, setDemoStage] = useState<PortraitDemo | null>(null)
  const [walked, setWalked] = useState(false)
  const walkSteps = useMemo(() => portraitTourSteps(), [])

  useEffect(() => {
    try {
      if (localStorage.getItem(ORDER_KEY) === 'recent') setOrder('recent')
    } catch { /* no stored choice */ }
  }, [])

  const chooseOrder = (next: Order) => {
    setOrder(next)
    setShown({})
    try { localStorage.setItem(ORDER_KEY, next) } catch { /* not remembered, still applied */ }
  }

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
    const ok = await confirm({ title: 'Forget this?', body: 'The companion stops carrying it. It can only come back if it is noticed again.', confirmLabel: 'Forget', danger: true })
    if (!ok) return
    setRetiringId(id)
    try {
      const res = await fetch('/api/portrait/retire', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id))
      }
    } catch (err) {
      console.error('Failed to retire entry:', err)
    } finally {
      setRetiringId(null)
    }
  }

  const walk = useExampleTour(!isLoading, 'portrait')
  const demo = portraitShows(demoStage)
  const showing = demoStage !== null
  const shownEntries = showing ? demoEntries(demo.entries) : entries
  const grouped = (Object.keys(KIND_LABELS) as PortraitEntry['kind'][])
    .map((kind) => ({ kind, items: showing ? shownEntries.filter((e) => e.kind === kind) : sortEntries(shownEntries.filter((e) => e.kind === kind), order) }))
    .filter((g) => g.items.length > 0)

  return (
    <PageShell mood="violet" intensity={0.85} maxWidth={860}>
      <PageHeader eyebrow="Companheiro" title="My portrait" subtitle="What the companion has noticed about you over time. It shapes how it approaches you, never its voice." />

      <Container>
        <p data-tour="portrait-intro" style={{ ...typeRoles.small, color: t.textSecondary, marginBottom: 18 }}>
          Each line shows how many times it has been noticed, and since when. One that has not come up in a while starts to fade, and retires on its own at {DECAY_DAYS} days. Forget any of them at any time.
        </p>

        {/* The walk's invented check-in: the part a pattern was noticed in lights up. */}
        {showing && demo.checkIn && (
          <div data-tour="portrait-checkin" style={{ marginBottom: 20 }}>
            <Card>
              <p style={{ ...typeRoles.small, fontSize: 11, fontWeight: 600, color: t.textMuted, letterSpacing: '0.04em' }}>CHECK-IN · {PORTRAIT_DEMO.checkIn.day.toUpperCase()}</p>
              <p style={{ ...typeRoles.quote, fontSize: 16, color: t.textPrimary, marginTop: 8 }}>
                {PORTRAIT_DEMO.checkIn.before}
                <span style={{
                  borderRadius: 4, padding: '0 2px',
                  background: demo.caught ? alpha(t.ember, 0.18) : 'transparent',
                  boxShadow: demo.caught ? `inset 0 -2px 0 ${t.ember}` : 'none',
                  transition: 'background-color 900ms ease, box-shadow 900ms ease',
                }}>{PORTRAIT_DEMO.checkIn.caught}</span>
                {PORTRAIT_DEMO.checkIn.after}
              </p>
            </Card>
          </div>
        )}

        {isLoading ? (
          <Working size="sm" label="Loading…" patientNote={null} color={t.textMuted} />
        ) : shownEntries.length === 0 ? (
          showing ? null : (
          <Card>
            <p style={{ ...typeRoles.ui, color: t.textSecondary }}>
              Nothing here yet. As you check in, develop ideas and write, the companion may notice a pattern worth keeping. When it does, it shows up here, and you can forget it at any time.
            </p>
          </Card>
          )
        ) : (
          <div data-tour="portrait-list" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div role="group" aria-label="Order patterns by" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {ORDERS.map((o) => (
                <Pill key={o.key} size="md" selected={order === o.key} onClick={() => chooseOrder(o.key)}>{o.label}</Pill>
              ))}
            </div>
            {grouped.map(({ kind, items }) => {
              const limit = shown[kind] ?? PAGE_SIZE
              const visible = items.slice(0, limit)
              const remaining = items.length - visible.length
              return (
                <Card key={kind}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: t[KIND_HUE[kind]] }} />
                    <Eyebrow>{KIND_LABELS[kind]}</Eyebrow>
                  </div>
                  <div style={remaining > 0 ? FADE_STYLE : undefined}>
                    {visible.map((entry, index) => {
                      const left = daysUntilRetired(entry.last_reinforced_at)
                      return (
                        <div key={entry.id} data-tour={entry.id === PORTRAIT_DEMO.entries[0].id ? 'portrait-entry' : undefined} style={{ padding: '16px 0', borderBottom: index < visible.length - 1 ? `1px solid ${t.divider}` : 'none' }}>
                          <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary }}>{entry.statement}</p>
                          {/* The forget action sits in the detail line, so the statement keeps the full width on a phone. */}
                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginTop: 6 }}>
                            <p style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted, flex: 1, minWidth: 0 }}>
                              Noticed {entry.reinforcement_count === 1 ? 'once' : `${entry.reinforcement_count} times`}
                              {entry.reinforcement_count > 1 && entry.created_at && <> · since {formatDateShort(entry.created_at)}</>}
                              {' · '}{entry.reinforcement_count > 1 ? 'last ' : ''}{formatDateShort(entry.last_reinforced_at)}
                              {entry.seen_in && entry.seen_in.length > 0 && (
                                <> · {entry.seen_in.length === 1 ? '1 check-in' : `${entry.seen_in.length} check-ins`}</>
                              )}
                              {left <= FADING_WITHIN_DAYS && <> · Fading, retires in {left} {left === 1 ? 'day' : 'days'}</>}
                            </p>
                            <button
                              data-tour={entry.id === PORTRAIT_DEMO.entries[0].id ? 'portrait-forget' : undefined}
                              onClick={() => { if (!showing) handleRetire(entry.id) }}
                              disabled={retiringId === entry.id}
                              style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted, background: 'none', border: 'none', padding: '6px 0 6px 8px', margin: '-6px 0', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2, whiteSpace: 'nowrap', flexShrink: 0, opacity: retiringId === entry.id ? 0.5 : 1 }}
                            >
                              {retiringId === entry.id ? 'Forgetting…' : 'Forget this'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {remaining > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                      <GhostButton size="sm" onClick={() => setShown((prev) => ({ ...prev, [kind]: limit + PAGE_SIZE }))}>
                        Show {Math.min(PAGE_SIZE, remaining)} more · {remaining} left
                      </GhostButton>
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        )}
      </Container>
      {walk.due && !walked && (
        <ExampleTour
          steps={walkSteps}
          phone={phone}
          label="A short walk round your portrait"
          onStep={(st) => {
            if (st.key === walkSteps[0].key) walk.markSeen()
            setDemoStage((st.stage as PortraitDemo) ?? null)
          }}
          onDone={() => { setDemoStage(null); setWalked(true); walk.markSeen() }}
        />
      )}
    </PageShell>
  )
}
