'use client'

// studio/src/components/compass/compass-drawer.tsx — the full compass (8.7,
// D-052, D-053, D-058; lane D). Sections in order: waiting (confirm · correct ·
// reject) · to mark (right · wrong) · refusals · non-negotiables · open
// commitments (done · let go) · drift · faded · forgotten (restore) · where you
// said the companion was wrong. Every verb goes through api.compass.decide /
// api.catches.mark and updates store.compass / store.catches. Nothing scores
// anything; the only number is `n waiting`. DrawerHost renders the header.

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { api, ApiError } from '@/lib/studio/api-client'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { splitCompass } from '@/lib/studio/compass-split'
import { useCatches, useCompass, useStore } from '@/lib/studio/hooks'
import type { AnyBlock, Catch, CompassDecideRequest, CompassEntry } from '@/lib/studio/types'
import { CatchRow } from '@/components/compass/catch-row'
import { EntryRow } from '@/components/compass/entry-row'
import { ProposalRow } from '@/components/compass/proposal-row'

const byReinforcement = (a: CompassEntry, b: CompassEntry) =>
  b.reinforcement_count - a.reinforcement_count || a.created_at.localeCompare(b.created_at)
const byCreated = (a: { created_at: string }, b: { created_at: string }) => a.created_at.localeCompare(b.created_at)

/** The decide / mark verbs, bound to the store: optimistic-free (the server's row is the truth), with the store updated from the response. */
export function useCompassVerbs() {
  const store = useStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const decide = useCallback(
    async (entryId: string, req: CompassDecideRequest) => {
      setBusy(true)
      setError(null)
      try {
        const { entry } = await api.compass.decide(entryId, req)
        store.set((s) => {
          const next = s.compass.filter((e) => e.id !== entryId)
          if (entry.status !== 'rejected') next.push(entry)
          s.compass = next
          // rejecting a commitment soft-deletes its block server-side (D-052); mirror it so the card leaves at once
          if (entry.status === 'rejected' && entry.block_id) {
            const b = s.blocks.get(entry.block_id)
            if (b && !b.deleted_at) {
              s.blocks.set(b.id, { ...b, deleted_at: new Date().toISOString() } as AnyBlock)
              const sel = new Set(s.selection)
              sel.delete(b.id)
              s.selection = sel
              if (s.primary === b.id) s.primary = null
            }
          }
        }, entry.block_id ? [entry.block_id] : undefined)
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'that did not go through')
        throw e
      } finally {
        setBusy(false)
      }
    },
    [store]
  )

  const mark = useCallback(
    async (catchId: string, m: 'right' | 'wrong') => {
      setBusy(true)
      setError(null)
      try {
        const { catch: saved } = await api.catches.mark(catchId, { mark: m })
        store.set((s) => {
          s.catches = s.catches.map((c) => (c.id === catchId ? saved : c))
        })
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'that did not go through')
        throw e
      } finally {
        setBusy(false)
      }
    },
    [store]
  )

  return { decide, mark, busy, error }
}

/** Refetch entries + catches once on mount (the bundle may be minutes old; no caching by design). */
export function useCompassRefresh(): void {
  const store = useStore()
  useEffect(() => {
    let alive = true
    const projectId = store.get().project.id
    api.compass
      .list(projectId)
      .then(({ entries, catches }) => {
        if (!alive) return
        store.set((s) => {
          s.compass = entries.filter((e) => e.status !== 'rejected')
          s.catches = catches
        })
      })
      .catch((e) => console.warn('studio: compass refresh failed', e))
    return () => {
      alive = false
    }
  }, [store])
}

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  const { t } = useTheme()
  return (
    <section style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...canvasType.eyebrow, color: t.textMuted, paddingBottom: 4 }}>{title}</div>
      {hint && <div style={{ ...canvasType.meta, color: t.textMuted, paddingBottom: 8 }}>{hint}</div>}
      {children}
    </section>
  )
}

export interface CompassGroups {
  pending: CompassEntry[]
  toMark: Catch[]
  refusals: CompassEntry[]
  nonNegotiables: CompassEntry[]
  openCommitments: CompassEntry[]
  drift: CompassEntry[]
  faded: CompassEntry[]
  forgotten: CompassEntry[]
  wrong: Catch[]
}

export function groupCompass(entries: CompassEntry[], catches: Catch[], now: Date = new Date()): CompassGroups {
  const split = splitCompass(entries, now)
  const active = split.active
  return {
    pending: [...split.pending].sort(byCreated),
    toMark: catches.filter((c) => c.mark === null).sort(byCreated),
    refusals: active.filter((e) => e.kind === 'refusal').sort(byReinforcement),
    nonNegotiables: active.filter((e) => e.kind === 'non_negotiable').sort(byReinforcement),
    openCommitments: split.openCommitments.filter((e) => !split.faded.includes(e)).sort(byCreated),
    drift: active.filter((e) => e.kind === 'drift').sort(byReinforcement),
    faded: [...split.faded].sort(byReinforcement),
    forgotten: [...split.dormant].sort(byCreated).reverse(),
    wrong: catches.filter((c) => c.mark === 'wrong').sort(byCreated).reverse(),
  }
}

/** The sections, shared by the drawer and the phone sheet. */
export function CompassSections({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTheme()
  const compass = useCompass()
  const catches = useCatches()
  const { decide, mark, busy, error } = useCompassVerbs()
  const g = useMemo(() => groupCompass(compass, catches), [compass, catches])

  const nothing =
    g.pending.length + g.toMark.length + g.refusals.length + g.nonNegotiables.length + g.openCommitments.length + g.drift.length + g.faded.length + g.forgotten.length + g.wrong.length === 0

  const onDecide = useCallback(
    async (id: string, req: CompassDecideRequest) => {
      if (readOnly) return
      try {
        await decide(id, req)
      } catch {
        // the error line below says it
      }
    },
    [decide, readOnly]
  )
  const onMark = useCallback(
    async (id: string, m: 'right' | 'wrong') => {
      if (readOnly) return
      try {
        await mark(id, m)
      } catch {
        // the error line below says it
      }
    },
    [mark, readOnly]
  )

  if (nothing) {
    return <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>nothing here yet — it fills from what you say in talk</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {error && <div style={{ ...canvasType.meta, color: t.ember }}>{error}</div>}

      {g.pending.length > 0 && (
        <Section title={g.pending.length === 1 ? '1 waiting' : `${g.pending.length} waiting`} hint="heard in talk; nothing holds until you say so">
          {g.pending.map((e) => (
            <ProposalRow key={e.id} entry={e} onDecide={onDecide} busy={busy || readOnly} />
          ))}
        </Section>
      )}

      {g.toMark.length > 0 && (
        <Section title="to mark">
          {g.toMark.map((c) => (
            <CatchRow key={c.id} item={c} onMark={readOnly ? undefined : onMark} busy={busy} />
          ))}
        </Section>
      )}

      {g.refusals.length > 0 && (
        <Section title="refusals">
          {g.refusals.map((e) => (
            <EntryRow key={e.id} entry={e} verbs={readOnly ? [] : ['forget']} onDecide={onDecide} busy={busy} />
          ))}
        </Section>
      )}

      {g.nonNegotiables.length > 0 && (
        <Section title="non-negotiables">
          {g.nonNegotiables.map((e) => (
            <EntryRow key={e.id} entry={e} verbs={readOnly ? [] : ['forget']} onDecide={onDecide} busy={busy} />
          ))}
        </Section>
      )}

      {g.openCommitments.length > 0 && (
        <Section title="open commitments">
          {g.openCommitments.map((e) => (
            <EntryRow key={e.id} entry={e} verbs={readOnly ? [] : ['done', 'let go']} onDecide={onDecide} busy={busy} />
          ))}
        </Section>
      )}

      {g.drift.length > 0 && (
        <Section title="drift" hint="where what you said pulled against something you hold">
          {g.drift.map((e) => (
            <EntryRow key={e.id} entry={e} verbs={readOnly ? [] : ['forget']} onDecide={onDecide} busy={busy} />
          ))}
        </Section>
      )}

      {g.faded.length > 0 && (
        <Section title="faded" hint="not heard for a while; saying it again brings it back">
          {g.faded.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              verbs={readOnly ? [] : e.kind === 'commitment' && !e.resolution ? ['done', 'let go'] : ['forget']}
              onDecide={onDecide}
              busy={busy}
              muted
            />
          ))}
        </Section>
      )}

      {g.forgotten.length > 0 && (
        <Section title="forgotten">
          {g.forgotten.map((e) => (
            <EntryRow key={e.id} entry={e} verbs={readOnly ? [] : ['restore']} onDecide={onDecide} busy={busy} muted />
          ))}
        </Section>
      )}

      {g.wrong.length > 0 && (
        <Section title="where you said the companion was wrong">
          {g.wrong.map((c) => (
            <CatchRow key={c.id} item={c} />
          ))}
        </Section>
      )}
    </div>
  )
}

export function CompassDrawer() {
  useCompassRefresh()
  return (
    <div style={{ padding: '16px 20px 32px' }}>
      <CompassSections />
    </div>
  )
}
