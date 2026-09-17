'use client'

// studio/src/components/work/thread-card.tsx — a thread, opened.
//
// Nothing on the board explains itself in words until you ask it to. This is
// where a thread does: what it is, what colour it runs in, which pieces it
// touches, and — read in the gaps — which ones it has gone quiet on.

import { useEffect, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { InlineField, hueOf } from '@/components/studio/work/bits'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import type { Thread, ThreadHue, ThreadTag, TreeNode } from '@/lib/studio/node-types'

const HUES: ThreadHue[] = ['ember', 'verdant', 'violet', 'ochre', 'tide']

export function ThreadCard({
  thread,
  pieces,
  on,
  direct,
  tagFor,
  disabled,
  onClose,
  onEdit,
  onTag,
  onNote,
  onUntag,
  onRemove,
  onRead,
}: {
  thread: Thread
  pieces: TreeNode[]
  /** Pieces it reaches, directly or through something inside them. */
  on: Set<string>
  /** Pieces it is marked on itself. */
  direct: Set<string>
  tagFor: (nodeId: string, threadId: string) => ThreadTag | undefined
  disabled: boolean
  onClose: () => void
  onEdit: (patch: Partial<Thread>) => void
  onTag: (nodeId: string) => void
  /** What this thread does at this particular piece. */
  onNote: (nodeId: string, note: string) => void
  onUntag: (nodeId: string) => void
  onRemove: () => void
  /** Every appearance in reading order — the screenwriter's character pass. */
  onRead: () => void
}) {
  const { t } = useTheme()
  const confirm = useConfirm()
  const colour = hueOf(t, thread.hue)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const quiet = pieces.filter((p) => !on.has(p.id)).length

  const remove = async () => {
    setBusy(true)
    const ok = await confirm({
      title: `Delete “${thread.name || 'this thread'}”?`,
      body: on.size > 0
        ? `It comes off ${on.size} ${on.size === 1 ? 'piece' : 'pieces'}. The writing is untouched.`
        : 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    setBusy(false)
    if (ok) onRemove()
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(10,9,8,0.76)', backdropFilter: 'blur(6px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={thread.name || 'A thread'}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460, maxHeight: '82vh', overflowY: 'auto',
          padding: 24, borderRadius: radius.card,
          background: t.containerBg, boxShadow: t.containerShadow,
          borderLeft: `3px solid ${colour}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineField
              ariaLabel="The name of this thread"
              value={thread.name}
              placeholder="Name it — the thing you keep having to remember"
              disabled={disabled}
              onCommit={(name) => onEdit({ name })}
              style={{ ...canvasType.headingMd, fontSize: 20, color: t.textPrimary }}
            />
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginTop: 14 }}>
          <InlineField
            ariaLabel="What this thread is for"
            value={thread.intent}
            placeholder="What is it holding? An anchor line, a constraint, something you must not forget…"
            multiline
            disabled={disabled}
            onCommit={(intent) => onEdit({ intent })}
            style={{ ...canvasType.small, color: t.textSecondary }}
          />
        </div>

        {!disabled && (
          <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
            {HUES.map((h) => {
              const c = hueOf(t, h)
              const picked = thread.hue === h
              return (
                <button
                  key={h}
                  type="button"
                  aria-label={h.charAt(0).toUpperCase() + h.slice(1)}
                  title={h.charAt(0).toUpperCase() + h.slice(1)}
                  aria-pressed={picked}
                  onClick={() => onEdit({ hue: h })}
                  style={{
                    width: 22, height: 22, borderRadius: 999, cursor: 'pointer', padding: 0,
                    background: picked ? c : alpha(c, 0.22),
                    border: `1.5px solid ${picked ? c : 'transparent'}`,
                    boxShadow: picked ? `0 0 0 3px ${alpha(c, 0.18)}` : 'none',
                  }}
                />
              )
            })}
          </div>
        )}

        <div style={{ marginTop: 22, borderTop: `1px solid ${alpha(t.textPrimary, 0.08)}`, paddingTop: 16 }}>
          <p style={{ ...canvasType.chip, color: t.textMuted, margin: '0 0 10px' }}>
            {on.size} of {pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'}
            {quiet > 0 && ` · quiet on ${quiet}`}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {pieces.map((piece) => {
              const here = on.has(piece.id)
              const own = direct.has(piece.id)
              return (
                <div key={piece.id} style={{ padding: '5px 8px', borderRadius: 8, background: here ? alpha(colour, 0.07) : 'transparent' }}>
                  <label
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      cursor: disabled || (here && !own) ? 'default' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={here}
                      disabled={disabled || (here && !own)}
                      onChange={(e) => (e.target.checked ? onTag(piece.id) : onUntag(piece.id))}
                    />
                    <span
                      style={{
                        ...canvasType.small, color: here ? t.textPrimary : t.textMuted,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {piece.title || 'Untitled piece'}
                    </span>
                    {here && !own && (
                      <span style={{ ...canvasType.chip, color: t.textMuted, marginLeft: 'auto', flexShrink: 0 }}>
                        Inside
                      </span>
                    )}
                  </label>
                  {own && (
                    <div style={{ paddingLeft: 26, marginTop: 2 }}>
                      <NoteField
                        note={tagFor(piece.id, thread.id)?.note ?? ''}
                        disabled={disabled}
                        onCommit={(note) => onNote(piece.id, note)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 18 }}>
          {on.size > 0 && (
            <button
              type="button"
              onClick={onRead}
              style={{
                ...canvasType.small, fontSize: 13, padding: '8px 13px', borderRadius: radius.field,
                border: `1px solid ${alpha(t.textPrimary, 0.16)}`, background: 'transparent',
                color: t.textSecondary, cursor: 'pointer',
              }}
            >
              Read it through
            </button>
          )}
          {!disabled && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            style={{
              ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none',
              padding: 0, marginLeft: 'auto', cursor: 'pointer', textAlign: 'left',
            }}
          >
            Delete this thread
          </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** What this thread does at one particular piece — an inline field that
 *  commits on blur, the same pattern as every other quiet field in the app. */
function NoteField({
  note, disabled, onCommit,
}: {
  note: string
  disabled: boolean
  onCommit: (note: string) => void
}) {
  const { t } = useTheme()
  const [draft, setDraft] = useState(note)
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setDraft(note) }, [note, focused])

  return (
    <input
      aria-label="What it does here"
      value={draft}
      placeholder="Say what it does here…"
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        if (draft.trim() !== note.trim()) onCommit(draft.trim())
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      style={{
        ...canvasType.small, fontSize: 12, width: '100%',
        color: note ? t.textSecondary : alpha(t.textPrimary, 0.35),
        background: 'transparent', border: 'none', outline: 'none', padding: 0,
      }}
    />
  )
}
