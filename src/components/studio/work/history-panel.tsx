'use client'

// Document history for a piece: earlier versions (kept by the server before
// each editing stretch and before anything reshapes the piece), a read of any
// of them with what has changed since marked, and a restore.

import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { htmlToPlainText } from '@/lib/rich-text'

interface Part {
  id: string
  parent_id: string | null
  position: number
  title: string
  beat: string
  body: string
  is_leaf: boolean
}

interface RevisionMeta {
  id: string
  created_at: string
  reason: 'edit' | 'restructure' | 'remove' | 'restore'
  word_count: number
}

const REASON: Record<RevisionMeta['reason'], string> = {
  edit: 'Before an editing session',
  restructure: 'Before it was shaped into sections',
  remove: 'Before a section was removed',
  restore: 'Before an older version was restored',
}

function when(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / 86400000)
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (diff === 0) return `Today, ${time}`
  if (diff === 1) return `Yesterday, ${time}`
  const date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
  return `${date}, ${time}`
}

const leaves = (parts: Part[]) => parts.filter((p) => p.is_leaf)

/** The old text as spans, with the words that are no longer in the current text marked. */
function markChanged(oldText: string, newText: string): Array<{ text: string; changed: boolean }> {
  const a = oldText.split(/(\s+)/)
  const b = newText.split(/\s+/).filter(Boolean)
  const aw = a.map((tok, i) => ({ tok, i })).filter((x) => x.tok.trim())
  const n = aw.length
  const m = b.length
  if (n * m > 4_000_000) return [{ text: oldText, changed: false }]
  // Longest common subsequence of words; whatever of the old isn't in it has changed since.
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = aw[i].tok === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const kept = new Set<number>()
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (aw[i].tok === b[j]) { kept.add(aw[i].i); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  const out: Array<{ text: string; changed: boolean }> = []
  a.forEach((tok, idx) => {
    const changed = !!tok.trim() && !kept.has(idx)
    const last = out[out.length - 1]
    // Whitespace joins whichever run it sits in, so a changed phrase reads as one highlight.
    if (last && (last.changed === changed || (!tok.trim() && last.changed))) last.text += tok
    else out.push({ text: tok, changed })
  })
  return out
}

export function HistoryPanel({
  nodeId,
  onClose,
  onRestored,
}: {
  /** Any node in the piece; the history is the whole piece's. */
  nodeId: string
  onClose: () => void
  onRestored: () => Promise<void> | void
}) {
  const { t } = useTheme()
  const [list, setList] = useState<RevisionMeta[] | null>(null)
  const [current, setCurrent] = useState<Part[]>([])
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Record<string, Part[]>>({})
  const [confirming, setConfirming] = useState(false)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    fetch(`/api/write/history?node_id=${nodeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.unavailable) { setUnavailable(true); return }
        if (data.error) { setError(data.error); return }
        setList(data.revisions)
        setCurrent(data.current)
        if (data.revisions.length) setSelected(data.revisions[0].id)
      })
      .catch(() => setError('Could not load the history.'))
  }, [nodeId])

  useEffect(() => {
    if (!selected || loaded[selected]) return
    fetch(`/api/write/history?revision_id=${selected}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.revision) setLoaded((prev) => ({ ...prev, [selected]: data.revision.parts as Part[] }))
        else setError('Could not open that version.')
      })
      .catch(() => setError('Could not open that version.'))
  }, [selected, loaded])

  const parts = selected ? loaded[selected] : undefined
  const meta = list?.find((r) => r.id === selected)
  const currentLeaves = useMemo(() => new Map(leaves(current).map((p) => [p.id, htmlToPlainText(p.body)])), [current])
  const addedSince = parts ? leaves(current).filter((p) => !parts.some((q) => q.id === p.id)).length : 0
  const shown = parts ? leaves(parts) : []
  const sameAsNow = !!parts && addedSince === 0 && shown.every((p) => currentLeaves.get(p.id) === htmlToPlainText(p.body))

  const restore = async () => {
    if (!selected) return
    setRestoring(true)
    setError(null)
    try {
      const res = await fetch('/api/write/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision_id: selected }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) { setError(data.error || 'Could not restore that version.'); return }
      await onRestored()
    } catch {
      setError('Could not restore that version.')
    } finally {
      setRestoring(false)
    }
  }

  const footer = meta && parts ? (
    confirming ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span style={{ ...canvasType.small, color: t.textSecondary, flex: '1 1 260px' }}>
          Restore the version from {when(meta.created_at)}? What&rsquo;s here now is kept in this history first
          {addedSince > 0 ? `, and the ${addedSince === 1 ? 'section' : `${addedSince} sections`} added since will be removed.` : '.'}
        </span>
        <GhostButton size="sm" onClick={() => setConfirming(false)} disabled={restoring}>Cancel</GhostButton>
        <PrimaryButton size="sm" onClick={() => void restore()} loading={restoring} loadingLabel="Restoring…">Restore</PrimaryButton>
      </div>
    ) : (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <PrimaryButton size="sm" onClick={() => setConfirming(true)} disabled={sameAsNow}>
          {sameAsNow ? 'Same as now' : 'Restore this version'}
        </PrimaryButton>
      </div>
    )
  ) : undefined

  return (
    <ModalDialog
      onClose={onClose}
      title="Document history"
      subtitle="Earlier versions of this piece, kept before each editing session and before anything reshapes it."
      maxWidth="980px"
      footer={footer}
    >
      <style>{`
        .history-grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
        @media (min-width: 760px) { .history-grid { grid-template-columns: 250px 1fr; } }
      `}</style>
      {unavailable ? (
        <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>
          History isn&rsquo;t switched on yet. Once it is, a version is kept each time you come back to edit.
        </p>
      ) : error && !list ? (
        <p style={{ ...canvasType.small, color: t.danger, margin: 0 }}>{error}</p>
      ) : !list ? (
        <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>Opening the history…</p>
      ) : list.length === 0 ? (
        <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>
          No earlier versions yet. One is kept each time you come back to edit, and before anything reshapes the piece.
        </p>
      ) : (
        <div className="history-grid">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '60dvh', overflowY: 'auto' }}>
            {list.map((r) => {
              const on = r.id === selected
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => { setSelected(r.id); setConfirming(false) }}
                    aria-pressed={on}
                    style={{
                      width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                      padding: '9px 12px', borderRadius: radius.field,
                      background: on ? alpha(t.violet, 0.12) : 'transparent',
                      boxShadow: on ? `inset 2px 0 0 ${t.violet}` : 'none',
                    }}
                  >
                    <span style={{ ...canvasType.small, display: 'block', color: on ? t.textPrimary : t.textSecondary, fontWeight: 600 }}>{when(r.created_at)}</span>
                    <span style={{ ...canvasType.small, fontSize: 12, display: 'block', color: t.textMuted, marginTop: 2 }}>
                      {REASON[r.reason] ?? 'Earlier version'} · {r.word_count} {r.word_count === 1 ? 'word' : 'words'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div style={{ minWidth: 0, maxHeight: '60dvh', overflowY: 'auto', paddingRight: 4 }}>
            {!parts ? (
              <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>Opening this version…</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                <p style={{ ...canvasType.small, fontSize: 12, color: t.textMuted, margin: 0 }}>
                  {sameAsNow
                    ? 'This is the same as the piece is now.'
                    : <>Words <span style={{ background: alpha(t.violet, 0.22), borderRadius: 3, padding: '0 3px' }}>marked like this</span> are different now.{addedSince > 0 && ` ${addedSince === 1 ? 'One section has' : `${addedSince} sections have`} been added since.`}</>}
                </p>
                {error && <p style={{ ...canvasType.small, color: t.danger, margin: 0 }}>{error}</p>}
                {shown.map((p, i) => {
                  const old = htmlToPlainText(p.body)
                  const now = currentLeaves.get(p.id)
                  const status = now === undefined ? 'Removed since' : now !== old ? 'Changed since' : null
                  const runs = now !== undefined && now !== old ? markChanged(old, now) : [{ text: old, changed: now === undefined }]
                  return (
                    <section key={p.id}>
                      {(shown.length > 1 || status) && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                          {shown.length > 1 && (
                            <span style={{ ...canvasType.chip, color: t.textSecondary }}>{p.title.trim() || `Section ${i + 1}`}</span>
                          )}
                          {status && <span style={{ ...canvasType.chip, fontSize: 10, color: t.violet }}>{status}</span>}
                        </div>
                      )}
                      <p style={{ ...canvasType.body, fontSize: 15, lineHeight: 1.75, color: t.textPrimary, margin: 0, whiteSpace: 'pre-wrap' }}>
                        {old
                          ? runs.map((r, k) => r.changed
                            ? <mark key={k} style={{ background: alpha(t.violet, 0.22), color: 'inherit', borderRadius: 3 }}>{r.text}</mark>
                            : <span key={k}>{r.text}</span>)
                          : <span style={{ color: t.textMuted }}>(empty)</span>}
                      </p>
                    </section>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </ModalDialog>
  )
}
