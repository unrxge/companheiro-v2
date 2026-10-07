'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { GhostButton } from '@/components/ui/buttons'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { formatDateAsRelative } from '@/lib/dates'
import { type as typeRoles } from '@/lib/design-tokens'
import { Working } from '@/components/ui/working'
import { KIND_LABELS, KIND_HUE, DECAY_DAYS } from '@/lib/portrait-kinds'

interface PortraitEntry {
  id: string
  kind: 'processing_pattern' | 'recurring_theme' | 'creative_pattern' | 'guidance_note'
  statement: string
  reinforcement_count: number
  last_reinforced_at: string
  /** Dates of the check-ins this was noticed in, newest first. */
  seen_in?: string[]
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

  const grouped = (Object.keys(KIND_LABELS) as PortraitEntry['kind'][])
    .map((kind) => ({ kind, items: entries.filter((e) => e.kind === kind) }))
    .filter((g) => g.items.length > 0)

  return (
    <PageShell mood="violet" intensity={0.85} maxWidth={860}>
      <PageHeader eyebrow="Companheiro" title="My portrait" subtitle="What the companion has noticed about you over time. It shapes how it approaches you, never its voice." />

      <Container>
        <p style={{ ...typeRoles.small, color: t.textSecondary, maxWidth: '58ch', marginBottom: 18 }}>
          Each line has been reinforced the number of times shown. One that has not come up in a while starts to fade, and retires on its own at {DECAY_DAYS} days. Forget any of them at any time.
        </p>

        {isLoading ? (
          <Working size="sm" label="Loading…" patientNote={null} color={t.textMuted} />
        ) : entries.length === 0 ? (
          <Card>
            <p style={{ ...typeRoles.ui, color: t.textSecondary }}>
              Nothing here yet. As you check in, develop ideas, write and zoom out, the companion may notice a pattern worth keeping. When it does, it shows up here, and you can forget it at any time.
            </p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
                        <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '16px 0', borderBottom: index < visible.length - 1 ? `1px solid ${t.divider}` : 'none' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary }}>{entry.statement}</p>
                            <p style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted, marginTop: 4 }}>
                              Reinforced {entry.reinforcement_count}× · last {formatDateAsRelative(entry.last_reinforced_at)}
                              {left <= FADING_WITHIN_DAYS && <> · Fading, retires in {left} {left === 1 ? 'day' : 'days'}</>}
                            </p>
                            {entry.seen_in && entry.seen_in.length > 0 && (
                              <p style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                                Noticed in {entry.seen_in.length === 1 ? 'a check-in' : `${entry.seen_in.length} check-ins`}: {entry.seen_in.slice(0, 3).map((d) => formatDateAsRelative(d)).join(', ')}{entry.seen_in.length > 3 ? '…' : ''}
                              </p>
                            )}
                          </div>
                          <GhostButton size="sm" onClick={() => handleRetire(entry.id)} disabled={retiringId === entry.id} loading={retiringId === entry.id} loadingLabel="Forgetting…">Forget this</GhostButton>
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
    </PageShell>
  )
}
