'use client'

// studio/src/components/canvas/blocks/text/commitment.tsx — the commitment
// block (6.2, D-052, D-053). The block holds only `{ entry_id }`; the words,
// status and resolution are the compass entry in store.compass. A 16 px
// verdant checkbox (data-no-drag) marks it done through
// api.compass.decide(entry, resolve done) — the one accent the type is allowed
// (D-043); `let go` lives in the dock. Text in `words`; meta `said 9 sep · from
// talk`; done = line-through at 0.6; let go = meta `let go 12 sep`; a verdant
// meta line `you said this was done — tick it?` while the entry is flagged.
// While pending the eyebrow adds `· PROPOSED` (the shell's) and the checkbox
// waits: only active commitments resolve (compass.ts). Editing in place (the
// words) is `correct`, allowed on active entries only, so a proposed
// commitment is never activated by a stray edit.
//
// "tick it?" adapter: CanvasState has no field for TalkApplied.suggest_done_ids
// and store.ts is frozen, so this module keeps a tiny session set. Lane G can
// feed it either way without importing this file:
//   window.dispatchEvent(new CustomEvent('studio:suggest-done', { detail: { ids } }))
// or, importing, markSuggestDone(ids). Ticking or letting go clears the flag.
//
// A library-made commitment starts with entry_id '' and no route creates a
// compass entry directly (gate note): it reads as an honest empty state.

import { useCallback, useState, useSyncExternalStore } from 'react'
import { Check } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { api } from '@/lib/studio/api-client'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { useCanvasStore, useStore } from '@/lib/studio/hooks'
import type { CanvasStore } from '@/lib/studio/store'
import type { CompassEntry } from '@/lib/studio/types'
import { useActions } from '@/components/canvas/actions'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'
import { shortDate } from '@/components/canvas/blocks/fallback-block'
import { endEditing, InlineTextarea } from '@/components/canvas/blocks/text/note'

export const COMMITMENT_EMPTY = 'a commitment comes from talk — say what you’ll do there and it lands here'
export const SUGGEST_DONE_LINE = 'you said this was done — tick it?'
export const SUGGEST_DONE_EVENT = 'studio:suggest-done'

// ── "tick it?" session flags ───────────────────────────────────────────────

const suggested = new Set<string>()
const suggestListeners = new Set<() => void>()
const notifySuggest = () => {
  for (const fn of suggestListeners) fn()
}

/** Flag compass entry ids the person said were done (TalkApplied.suggest_done_ids). */
export function markSuggestDone(ids: string[]): void {
  let changed = false
  for (const id of ids) {
    if (id && !suggested.has(id)) {
      suggested.add(id)
      changed = true
    }
  }
  if (changed) notifySuggest()
}

export function clearSuggestDone(id: string): void {
  if (suggested.delete(id)) notifySuggest()
}

export function isSuggestDone(id: string): boolean {
  return suggested.has(id)
}

const subscribeSuggest = (fn: () => void) => {
  suggestListeners.add(fn)
  return () => {
    suggestListeners.delete(fn)
  }
}

export function useSuggestDone(entryId: string): boolean {
  const get = useCallback(() => suggested.has(entryId), [entryId])
  return useSyncExternalStore(subscribeSuggest, get, () => false)
}

if (typeof window !== 'undefined') {
  window.addEventListener(SUGGEST_DONE_EVENT, (e) => {
    const detail = (e as CustomEvent<{ ids?: unknown }>).detail
    const ids = Array.isArray(detail?.ids) ? detail.ids.filter((x): x is string => typeof x === 'string') : []
    markSuggestDone(ids)
  })
}

// ── compass entry helpers (shared with the dock) ───────────────────────────

export function useCommitmentEntry(entryId: string): CompassEntry | undefined {
  return useCanvasStore((s) => (entryId ? s.compass.find((e) => e.id === entryId) : undefined))
}

/** Replace (or add) one entry in store.compass. */
export function mergeEntry(store: CanvasStore, entry: CompassEntry): void {
  store.set((s) => {
    const i = s.compass.findIndex((e) => e.id === entry.id)
    s.compass = i === -1 ? [...s.compass, entry] : s.compass.map((e) => (e.id === entry.id ? entry : e))
  })
}

export function canResolve(entry: CompassEntry | undefined): entry is CompassEntry {
  return !!entry && entry.kind === 'commitment' && entry.status === 'active' && !entry.resolution
}

export function canCorrect(entry: CompassEntry | undefined): entry is CompassEntry {
  return !!entry && entry.kind === 'commitment' && entry.status === 'active' && !entry.resolution
}

/** Resolve (done / let go) optimistically; the server row wins, an error restores the old one. */
export async function resolveCommitment(store: CanvasStore, entry: CompassEntry, resolution: 'done' | 'let_go'): Promise<void> {
  if (!canResolve(entry)) return
  const now = new Date().toISOString()
  mergeEntry(store, { ...entry, resolution, resolved_at: now })
  clearSuggestDone(entry.id)
  try {
    const { entry: saved } = await api.compass.decide(entry.id, { action: 'resolve', resolution })
    mergeEntry(store, saved)
  } catch (e) {
    mergeEntry(store, entry)
    console.error('studio: commitment resolve failed', e)
  }
}

/** Correct the words of an active commitment (D-058 `correct`); the proposed statement is kept server-side. */
export async function correctCommitment(store: CanvasStore, entry: CompassEntry, statement: string): Promise<void> {
  const text = statement.trim()
  if (!canCorrect(entry) || !text || text === entry.statement) return
  mergeEntry(store, { ...entry, statement: text })
  try {
    const { entry: saved } = await api.compass.decide(entry.id, { action: 'correct', statement: text })
    mergeEntry(store, saved)
  } catch (e) {
    mergeEntry(store, entry)
    console.error('studio: commitment correct failed', e)
  }
}

/** `said 9 sep · from talk` (+ ` · let go 12 sep`). */
export function commitmentMeta(entry: CompassEntry): string {
  const parts = [`said ${shortDate(entry.created_at)}`]
  if (entry.source_entry_id) parts.push('from talk')
  if (entry.resolution === 'let_go') parts.push(`let go ${shortDate(entry.resolved_at)}`)
  return parts.join(' · ')
}

// ── the checkbox ───────────────────────────────────────────────────────────

export function CommitmentCheckbox({ done, enabled, dim, busy, onTick }: { done: boolean; enabled: boolean; dim: boolean; busy: boolean; onTick: () => void }) {
  const { t } = useTheme()
  return (
    <button
      type="button"
      data-no-drag
      role="checkbox"
      aria-checked={done}
      aria-label={done ? 'done' : 'mark done'}
      disabled={!enabled || busy}
      onClick={(e) => {
        e.stopPropagation()
        onTick()
      }}
      style={{
        width: 16,
        height: 16,
        flexShrink: 0,
        marginTop: 4,
        padding: 0,
        borderRadius: 4,
        border: `1px solid ${t.verdant}`,
        backgroundColor: done ? t.verdant : 'transparent',
        color: t.cardBg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: enabled && !busy ? 'pointer' : 'default',
        opacity: dim ? 0.5 : 1,
        boxSizing: 'border-box',
      }}
    >
      {done && <Check size={12} strokeWidth={2.25} />}
    </button>
  )
}

/** The block's content (checkbox + words + meta), shared with the phone sheet. */
export function CommitmentBody({ entry, editing = false, blockId }: { entry: CompassEntry | undefined; editing?: boolean; blockId: string }) {
  const { t } = useTheme()
  const store = useStore()
  const actions = useActions()
  const suggest = useSuggestDone(entry?.id ?? '')
  const [busy, setBusy] = useState(false)

  if (!entry) {
    return <p style={{ ...canvasType.words, color: t.textMuted, margin: 0 }}>{COMMITMENT_EMPTY}</p>
  }

  const done = entry.resolution === 'done'
  const letGo = entry.resolution === 'let_go'
  const pending = entry.status === 'pending'
  const tickable = canResolve(entry)

  const tick = async () => {
    if (!tickable) return
    setBusy(true)
    try {
      await resolveCommitment(store, entry, 'done')
    } finally {
      setBusy(false)
    }
  }

  const editable = editing && canCorrect(entry)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <CommitmentCheckbox done={done} enabled={tickable} dim={pending || letGo} busy={busy} onTick={() => void tick()} />
      <div style={{ minWidth: 0, flex: 1 }}>
        {editable ? (
          <InlineTextarea
            initial={entry.statement}
            typeStyle={canvasType.words}
            color={t.textPrimary}
            ariaLabel="commitment"
            singleLine
            onCommit={(v) => {
              void correctCommitment(store, entry, v)
              endEditing(store, blockId)
              void actions
            }}
          />
        ) : (
          <p
            style={{
              ...canvasType.words,
              color: t.textPrimary,
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              textDecoration: done ? 'line-through' : 'none',
              opacity: done ? 0.6 : 1,
            }}
          >
            {entry.statement}
          </p>
        )}
        <div style={{ ...canvasType.meta, color: t.textMuted, marginTop: 6 }}>{commitmentMeta(entry)}</div>
        {suggest && !entry.resolution && (
          <div style={{ ...canvasType.meta, color: t.verdant, marginTop: 4 }}>{SUGGEST_DONE_LINE}</div>
        )}
      </div>
    </div>
  )
}

export function CommitmentBlock({ block, editing }: BlockRendererProps<'commitment'>) {
  const entry = useCommitmentEntry(block.content.entry_id)
  return <CommitmentBody entry={entry} editing={editing} blockId={block.id} />
}
