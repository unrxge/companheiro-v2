'use client'

// studio/src/components/talk/talk-drawer.tsx — the talk drawer (8.1). One drawer,
// segmented `talk | direction talk`; the copied Thread (align left); history with
// `before` paging on scroll-up; the composer with dictation; one request, one
// stream. On the meta frame the arrival rows go straight into the store (they are
// already persisted, so `store.set`, never `applyPatch` — nothing is marked dirty),
// the compass rows merge in, the catch line renders after the reply, and the since
// payload is recomputed locally. Nothing is placed for the person; nothing in the
// compass becomes active here.
//
// `TalkPanel` is the whole content minus the drawer header so the phone talk bar
// can mount the same conversation as a bottom sheet. `useSuggestDone(entryId)` is
// the "you said this was done — tick it?" signal for commitment blocks (lane C):
// the store has no field for it, so it lives here as a tiny external store.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { Thread, type ThreadMessage } from '@/components/conversation/thread'
import { DrawerHeader } from '@/components/canvas/drawers/drawer'
import { canvasType, line, motionSpec } from '@/lib/studio/canvas-tokens'
import { useCatches, useProject, useStore } from '@/lib/studio/hooks'
import { api } from '@/lib/studio/api-client'
import { readTextStream } from '@/lib/stream-client'
import type { Catch, CompassEntry, TalkEntry, TalkKind, TalkMeta } from '@/lib/studio/types'
import { TALK_COPY } from '@/lib/studio/talk/prompts'
import { CatchLine } from '@/components/talk/catch-line'
import { TalkComposer, type TalkInput } from '@/components/talk/talk-composer'

// ── suggest-done: commitments the person said were done → "tick it?" ────────

let suggestIds: ReadonlySet<string> = new Set()
const suggestListeners = new Set<() => void>()
const notifySuggest = () => { for (const fn of suggestListeners) fn() }

export const suggestDone = {
  get: (): ReadonlySet<string> => suggestIds,
  add(ids: readonly string[]) {
    if (ids.length === 0) return
    suggestIds = new Set([...suggestIds, ...ids])
    notifySuggest()
  },
  /** The person ticked (or let go of) the commitment: the hint is gone. */
  clear(id: string) {
    if (!suggestIds.has(id)) return
    const next = new Set(suggestIds)
    next.delete(id)
    suggestIds = next
    notifySuggest()
  },
  reset() {
    if (suggestIds.size === 0) return
    suggestIds = new Set()
    notifySuggest()
  },
}

const subscribeSuggest = (fn: () => void) => {
  suggestListeners.add(fn)
  return () => { suggestListeners.delete(fn) }
}

/** True when talk heard the person say this commitment was done and nobody has ticked it yet. */
export function useSuggestDone(entryId: string): boolean {
  return useSyncExternalStore(subscribeSuggest, () => suggestIds.has(entryId), () => false)
}

// ── helpers ─────────────────────────────────────────────────────────────────

const PAGE = 40

function mergeCompass(current: CompassEntry[], incoming: CompassEntry[]): CompassEntry[] {
  if (incoming.length === 0) return current
  const byId = new Map(current.map((e) => [e.id, e]))
  for (const e of incoming) byId.set(e.id, e)
  return [...byId.values()]
}

// ── the panel ───────────────────────────────────────────────────────────────

export function TalkPanel({
  dictate = false,
  phone = false,
}: {
  dictate?: boolean
  /** Phone sheet: the composer takes the safe area into account. */
  phone?: boolean
}) {
  const { t } = useTheme()
  const store = useStore()
  const project = useProject()
  const catches = useCatches()
  const projectId = project.id

  const [kind, setKind] = useState<TalkKind>('talk')
  const [entries, setEntries] = useState<TalkEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [reply, setReply] = useState('')
  const [awaitingMeta, setAwaitingMeta] = useState(false)
  const [failed, setFailed] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const busy = streaming || awaitingMeta

  // history on open and on segment change
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setEntries([])
    setHasMore(false)
    setFailed(false)
    stickToBottom.current = true
    api.talk
      .history(projectId, { kind, limit: PAGE })
      .then(({ entries: rows }) => {
        if (cancelled) return
        setEntries(rows)
        setHasMore(rows.length === PAGE)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [projectId, kind])

  // keep the newest in view while it streams, unless the person scrolled up
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickToBottom.current) return
    el.scrollTop = el.scrollHeight
  }, [entries, reply, loading, streaming])

  const loadMore = useCallback(async () => {
    const el = scrollRef.current
    const first = entries[0]
    if (!hasMore || loadingMore || !first || !el) return
    setLoadingMore(true)
    const prevHeight = el.scrollHeight
    try {
      const { entries: older } = await api.talk.history(projectId, { kind, before: first.created_at, limit: PAGE })
      setEntries((cur) => [...older, ...cur])
      setHasMore(older.length === PAGE)
      requestAnimationFrame(() => {
        const node = scrollRef.current
        if (node) node.scrollTop += node.scrollHeight - prevHeight
      })
    } catch {
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }, [entries, hasMore, loadingMore, projectId, kind])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (el.scrollTop < 40) void loadMore()
  }

  /** The meta frame: arrivals + compass rows into the store, the since payload recomputed, the catch listed. */
  const applyMeta = useCallback((meta: TalkMeta, text: string, at: string) => {
    const touched = meta.blocks.map((b) => b.id)
    const pendingAdded = meta.compass.filter((e) => e.status === 'pending' && meta.applied.compass_pending_ids.includes(e.id)).length
    store.set((s) => {
      for (const b of meta.blocks) s.blocks.set(b.id, b)      // persisted rows: never dirty
      s.compass = mergeCompass(s.compass, meta.compass)
      if (meta.catch) s.catches = [meta.catch, ...s.catches.filter((c) => c.id !== meta.catch!.id)]
      s.since = {
        ...s.since,
        last_said: { text: text.slice(0, 140), at, kind },
        arrived_since: s.since.arrived_since + meta.blocks.length,
        waiting: s.since.waiting + meta.blocks.length,
        compass_pending: s.since.compass_pending + pendingAdded,
        catches_unmarked: s.since.catches_unmarked + (meta.catch ? 1 : 0),
      }
    }, touched)
    suggestDone.add(meta.applied.suggest_done_ids)
  }, [store, kind])

  const send = useCallback(async (text: string, input: TalkInput) => {
    if (busy) return
    const now = new Date().toISOString()
    const tempId = `pending-${now}`
    const optimistic: TalkEntry = {
      id: tempId, project_id: projectId, kind, role: 'person', input, text,
      reply_to: null, catch_id: null, sorted_at: null, truncated: false, created_at: now,
    }
    stickToBottom.current = true
    setFailed(false)
    setEntries((cur) => [...cur, optimistic])
    setReply('')
    setStreaming(true)
    setAwaitingMeta(true)

    let replyText = ''
    let meta: TalkMeta | null = null
    try {
      const res = await api.talk.send(projectId, { text, input, kind })
      const out = await readTextStream<TalkMeta>(res, (visible) => { replyText = visible; setReply(visible) })
      replyText = out.text
      meta = out.meta
    } catch {
      setEntries((cur) => cur.filter((e) => e.id !== tempId))
      setFailed(true)
      setStreaming(false)
      setAwaitingMeta(false)
      setReply('')
      return
    }

    setStreaming(false)
    const personId = meta?.person_entry_id ?? tempId
    const companionId = meta?.companion_entry_id ?? `reply-${now}`
    const at = new Date().toISOString()
    const next: TalkEntry[] = []
    if (replyText) {
      next.push({
        id: companionId, project_id: projectId, kind, role: 'companion', input: null, text: replyText,
        reply_to: personId, catch_id: null, sorted_at: null, truncated: meta?.truncated ?? false, created_at: at,
      })
    }
    if (meta?.catch) {
      next.push({
        id: meta.catch.spoken_entry_id ?? `catch-${meta.catch.id}`, project_id: projectId, kind: 'talk', role: 'companion', input: null,
        text: meta.catch.sentence, reply_to: personId, catch_id: meta.catch.id, sorted_at: null, truncated: false, created_at: at,
      })
    }
    setEntries((cur) => [
      ...cur.map((e) => (e.id === tempId ? { ...e, id: personId, sorted_at: meta ? at : null } : e)),
      ...next,
    ])
    setReply('')
    if (meta) applyMeta(meta, text, now)
    setAwaitingMeta(false)
  }, [busy, projectId, kind, applyMeta])

  const onMarked = useCallback((marked: Catch) => {
    store.set((s) => {
      const had = s.catches.some((c) => c.id === marked.id)
      s.catches = had ? s.catches.map((c) => (c.id === marked.id ? marked : c)) : [marked, ...s.catches]
      s.since = { ...s.since, catches_unmarked: Math.max(0, s.since.catches_unmarked - 1) }
    })
  }, [store])

  // unmarked catches leave the thread and render as CatchLine (sentence + marks); marked ones read as plain lines
  const catchById = useMemo(() => new Map(catches.map((c) => [c.id, c])), [catches])
  const { messages, openCatches } = useMemo(() => {
    const msgs: ThreadMessage[] = []
    const open: Catch[] = []
    for (const e of entries) {
      if (e.role === 'companion' && e.catch_id) {
        const c = catchById.get(e.catch_id)
        if (c && !c.mark) { open.push(c); continue }
      }
      msgs.push({ role: e.role === 'person' ? 'user' : 'assistant', content: e.text })
    }
    if (streaming || reply) msgs.push({ role: 'assistant', content: reply })
    return { messages: msgs, openCatches: open }
  }, [entries, catchById, streaming, reply])

  const empty = !loading && entries.length === 0 && !streaming

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div role="radiogroup" aria-label="kind of talk" style={{ display: 'flex', gap: 16, padding: '12px 20px 0', flexShrink: 0 }}>
        {(['talk', 'direction'] as const).map((k) => {
          const on = k === kind
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => { if (!busy) setKind(k) }}
              style={{
                ...canvasType.label,
                color: on ? t.textPrimary : t.textMuted,
                background: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${on ? t.textPrimary : 'transparent'}`,
                padding: '4px 0 6px',
                cursor: busy ? 'default' : 'pointer',
                transition: `color ${motionSpec.hoverMs}ms ease, border-color ${motionSpec.hoverMs}ms ease`,
              }}
            >
              {k === 'talk' ? TALK_COPY.segTalk : TALK_COPY.segDirection}
            </button>
          )
        })}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 22 }}
      >
        {hasMore && (
          <button
            type="button"
            onClick={() => void loadMore()}
            disabled={loadingMore}
            style={{ ...canvasType.label, color: t.textMuted, background: 'transparent', border: 'none', padding: 0, cursor: loadingMore ? 'default' : 'pointer', alignSelf: 'flex-start' }}
          >
            {loadingMore ? '…' : TALK_COPY.earlier}
          </button>
        )}
        {loading && <p style={{ ...canvasType.meta, color: t.textMuted, margin: 0 }}>…</p>}
        {empty && (
          <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>
            {kind === 'talk' ? TALK_COPY.empty : TALK_COPY.emptyDirection}
          </p>
        )}
        {!loading && (
          <Thread messages={messages} streaming={streaming} align="left">
            {openCatches.map((c) => (
              <CatchLine key={c.id} catch={c} onMarked={onMarked} />
            ))}
          </Thread>
        )}
        {failed && <p style={{ ...canvasType.meta, color: t.textMuted, margin: 0 }}>{TALK_COPY.failed}</p>}
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: phone ? '12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px)' : '12px 20px 16px',
          borderTop: `1px solid ${line.onPaper(t)}`,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <TalkComposer
          onSend={(text, input) => void send(text, input)}
          disabled={busy}
          autoDictate={dictate}
          placeholder={kind === 'talk' ? TALK_COPY.placeholder : TALK_COPY.placeholderDirection}
          autoFocus={!dictate && !phone}
        />
        <div aria-live="polite" style={{ ...canvasType.chip, color: t.textMuted, minHeight: 12 }}>
          {awaitingMeta ? TALK_COPY.listening : ''}
        </div>
      </div>
    </div>
  )
}

/** Mounted chromeless by DrawerHost: owns its header. `dictate` opens already listening (the pill's hold). */
export function TalkDrawer({ dictate = false }: { dictate?: boolean }) {
  return (
    <>
      <DrawerHeader eyebrow="talk" title="talk" />
      <TalkPanel dictate={dictate} />
    </>
  )
}
