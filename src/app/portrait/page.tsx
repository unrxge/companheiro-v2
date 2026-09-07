'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow, Divider } from '@/components/shell/page-shell'
import { DangerButton, GhostButton } from '@/components/ui/buttons'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Pill } from '@/components/ui/pill'
import { FacetCloud } from '@/components/widgets'
import { formatDateAsRelative } from '@/lib/dates'
import { type as typeRoles } from '@/lib/design-tokens'

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

const KIND_HUE: Record<PortraitEntry['kind'], 'tide' | 'ochre' | 'ember' | 'verdant'> = {
  processing_pattern: 'tide',
  recurring_theme: 'ochre',
  creative_pattern: 'ember',
  guidance_note: 'verdant',
}

const DECAY_DAYS = 150

export default function PortraitPage() {
  const { t } = useTheme()
  const confirm = useConfirm()

  const [entries, setEntries] = useState<PortraitEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [retiringId, setRetiringId] = useState<string | null>(null)
  const [selected, setSelected] = useState<PortraitEntry | null>(null)
  const [view, setView] = useState<'facets' | 'list'>('facets')

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
    const ok = await confirm({ title: 'Forget this?', body: 'The companion stops carrying it. It can only come back if it is noticed and confirmed again.', confirmLabel: 'Forget', danger: true })
    if (!ok) return
    setRetiringId(id)
    try {
      const res = await fetch('/api/portrait/retire', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id))
        if (selected?.id === id) setSelected(null)
      }
    } catch (err) {
      console.error('Failed to retire entry:', err)
    } finally {
      setRetiringId(null)
    }
  }

  const facets = useMemo(() => {
    const max = Math.max(1, ...entries.map((e) => e.reinforcement_count))
    const now = Date.now()
    return entries.map((e) => {
      const days = (now - new Date(e.last_reinforced_at).getTime()) / 86_400_000
      return {
        id: e.id,
        statement: e.statement,
        weight: e.reinforcement_count / max,
        freshness: Math.max(0, 1 - days / DECAY_DAYS),
        onClick: () => setSelected(e),
      }
    })
  }, [entries])

  const grouped = (Object.keys(KIND_LABELS) as PortraitEntry['kind'][])
    .map((kind) => ({ kind, items: entries.filter((e) => e.kind === kind) }))
    .filter((g) => g.items.length > 0)

  return (
    <PageShell mood="violet" intensity={0.85} maxWidth={860}>
      <PageHeader eyebrow="Companheiro" title="My portrait" subtitle="Only what you have confirmed. It shapes how the companion approaches you, never its voice." />

      <Container>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
          <p style={{ ...typeRoles.small, color: t.textSecondary, maxWidth: '58ch' }}>
            Size is how often a facet has been reinforced. Fading means it has not come up in a while and will retire on its own at {DECAY_DAYS} days. Tap one to see it, or forget it.
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <Pill hue="neutral" selected={view === 'facets'} onClick={() => setView('facets')} size="md">Facets</Pill>
            <Pill hue="neutral" selected={view === 'list'} onClick={() => setView('list')} size="md">List</Pill>
          </div>
        </div>

        {isLoading ? (
          <p style={{ ...typeRoles.small, color: t.textMuted }}>Loading…</p>
        ) : entries.length === 0 ? (
          <Card>
            <p style={{ ...typeRoles.ui, color: t.textSecondary }}>
              Nothing confirmed yet. As you check in, develop ideas, write and zoom out, the system may occasionally ask if a pattern it has noticed feels true. What you confirm shows up here.
            </p>
          </Card>
        ) : view === 'facets' ? (
          <Card padding="32px 24px">
            <FacetCloud facets={facets} />
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {grouped.map(({ kind, items }) => (
              <Card key={kind}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: t[KIND_HUE[kind]] }} />
                  <Eyebrow>{KIND_LABELS[kind]}</Eyebrow>
                </div>
                {items.map((entry, index) => (
                  <div key={entry.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '16px 0', borderBottom: index < items.length - 1 ? `1px solid ${t.divider}` : 'none' }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary }}>{entry.statement}</p>
                      <p style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted, marginTop: 4 }}>
                        Reinforced {entry.reinforcement_count}× · last {formatDateAsRelative(entry.last_reinforced_at)}
                      </p>
                    </div>
                    <GhostButton size="sm" onClick={() => handleRetire(entry.id)} disabled={retiringId === entry.id} loading={retiringId === entry.id} loadingLabel="Forgetting…">Forget this</GhostButton>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        )}
      </Container>

      {selected && (
        <ModalDialog
          onClose={() => setSelected(null)}
          title={KIND_LABELS[selected.kind]}
          subtitle={<span>Reinforced {selected.reinforcement_count}× · last {formatDateAsRelative(selected.last_reinforced_at)}</span>}
          maxWidth="520px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <GhostButton onClick={() => setSelected(null)}>Close</GhostButton>
              <DangerButton onClick={() => handleRetire(selected.id)} loading={retiringId === selected.id} loadingLabel="Forgetting…">Forget this</DangerButton>
            </div>
          }
        >
          <Card>
            <p style={{ ...typeRoles.quote, color: t.textPrimary }}>{selected.statement}</p>
            <Divider style={{ margin: '16px 0 12px' }} />
            <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted }}>
              This facet adapts which questions the companion asks and when it challenges you. It never changes its tone.
            </p>
          </Card>
        </ModalDialog>
      )}
    </PageShell>
  )
}
