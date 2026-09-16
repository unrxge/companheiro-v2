'use client'

// studio/src/components/work/companion.tsx — talking the work through.
//
// Reflect is the default and, at the whole-project altitude, the only mode:
// it is given the shape and never the prose, so it cannot quietly start
// writing for you. Suggest exists only inside one part at a time — it is
// handed that part's actual text and may propose a rewrite, materialised
// into the document as a pending edit for you to approve or reject. A
// write-lock (shared with the main app, extend-only) can hold it to Reflect
// regardless of what the toggle says, for anyone who wants no AI prose at
// all while they write.
//
// One conversation per altitude: the whole project has its own, and so does
// every part.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { MicButton } from '@/components/ui/mic-button'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { readTextStream } from '@/lib/stream-client'
import { useDictation } from '@/lib/use-dictation'
import { Label } from '@/components/work/bits'

interface Line {
  id: string
  role: 'person' | 'companion'
  text: string
}

export type CompanionMode = 'coach' | 'write'

export interface ProposedEdit {
  node_id: string
  content: string
  /** The highlighted passage it replaces — null means a whole-part rewrite. */
  anchor_text: string | null
}

export function Companion({
  projectId,
  nodeId,
  /** What this conversation is about, shown once when it is empty. */
  scope,
  /** Suggest mode only makes sense with a real part to write into. */
  canSuggest = false,
  selection,
  onClearSelection,
  lockedUntil,
  onRequestLock,
  onProposedEdit,
  disabled = false,
}: {
  projectId: string
  nodeId: string | null
  scope: string
  canSuggest?: boolean
  /** The passage currently highlighted in this part's editor, if any. */
  selection?: { text: string } | null
  onClearSelection?: () => void
  /** From /api/studio/assistant-lock — null when not locked. */
  lockedUntil?: string | null
  onRequestLock?: () => void
  onProposedEdit?: (edit: ProposedEdit) => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [lines, setLines] = useState<Line[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Never persisted, and never carried from one altitude to the next — a
  // fresh conversation always opens reflecting, the same as the main app.
  const [mode, setMode] = useState<CompanionMode>('coach')
  const bottom = useRef<HTMLDivElement | null>(null)
  const box = useRef<HTMLTextAreaElement | null>(null)
  // The dictation hook wants the tail of what is already there for punctuation,
  // and it must not be re-created on every keystroke to get it.
  const draftRef = useRef('')
  draftRef.current = draft

  const dictation = useDictation({
    onAppend: (text) => setDraft((prev) => (prev ? `${prev} ${text}` : text)),
    getContext: () => draftRef.current.slice(-200),
  })

  const isLocked = !!lockedUntil && new Date(lockedUntil).getTime() > Date.now()

  // One conversation per altitude, so the key is the pair.
  useEffect(() => {
    let alive = true
    setLoaded(false)
    setLines([])
    setMode('coach')
    const url = `/api/studio/projects/${projectId}/companion${nodeId ? `?node_id=${nodeId}` : ''}`
    fetch(url, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((d: { messages?: Array<{ id: string; role: string; text: string }> }) => {
        if (!alive) return
        setLines((d.messages ?? []).map((m) => ({ id: m.id, role: m.role === 'companion' ? 'companion' : 'person', text: m.text })))
        setLoaded(true)
      })
      .catch(() => { if (alive) setLoaded(true) })
    return () => { alive = false }
  }, [projectId, nodeId])

  // The lock is server-enforced regardless of what the toggle says — if it
  // becomes active mid-session (started in another tab, or the main app),
  // reflect that back here rather than leaving Suggest selected but inert.
  useEffect(() => {
    if (isLocked && mode === 'write') setMode('coach')
  }, [isLocked, mode])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [lines, busy])

  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [draft, dictation.interimText])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || busy) return
    if (dictation.isRecording) dictation.stopRecording()
    setDraft('')
    setError(null)
    setBusy(true)
    const mine: Line = { id: `me-${Date.now()}`, role: 'person', text }
    const replyId = `it-${Date.now()}`
    setLines((prev) => [...prev, mine, { id: replyId, role: 'companion', text: '' }])
    const activeSelection = canSuggest && mode === 'write' ? selection?.text ?? null : null

    try {
      const res = await fetch(`/api/studio/projects/${projectId}/companion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message: text, node_id: nodeId, mode, selected_text: activeSelection }),
      })
      if (!res.ok) throw new Error('it did not answer')
      const result = await readTextStream<{ lockedMode?: 'coach' | null; proposedEdit?: ProposedEdit }>(
        res,
        (chunk) => {
          setLines((prev) => prev.map((l) => (l.id === replyId ? { ...l, text: l.text + chunk } : l)))
        },
        // The proposal is shown inline in the document once approved, not
        // as raw markup in the transcript — cut it from the visible stream.
        ['<proposed_edit>'],
      )
      if (result.meta?.lockedMode === 'coach') setMode('coach')
      if (result.meta?.proposedEdit) {
        onProposedEdit?.(result.meta.proposedEdit)
        onClearSelection?.()
      }
    } catch {
      setLines((prev) => prev.filter((l) => l.id !== replyId))
      setError('It did not answer. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }, [busy, canSuggest, dictation, draft, mode, nodeId, onClearSelection, onProposedEdit, projectId, selection])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
      {/* context strip: what this message would land on, if you sent one */}
      {canSuggest && mode === 'write' && selection?.text && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingBottom: 4, flexShrink: 0 }}>
          <span aria-hidden style={{ color: t.tide, fontSize: 12, flexShrink: 0, marginTop: 2 }}>↳</span>
          <p
            style={{
              ...canvasType.small, fontStyle: 'italic', flex: 1, margin: 0,
              color: t.textSecondary, overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}
          >
            “{selection.text}”
          </p>
          <button
            type="button"
            aria-label="Talk about the whole part instead"
            onClick={onClearSelection}
            style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0 }}
          >
            ✕
          </button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loaded && lines.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label>about {scope}</Label>
            <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>
              {mode === 'write'
                ? "It can see this part's actual text here, and may propose a rewrite — select a passage first and it'll focus there. Nothing lands until you approve it."
                : 'It can see the shape of this — what each part is for, the rules, the order, the threads and where they go quiet. It cannot see the writing, and it will not write anything for you.'}
            </p>
          </div>
        )}

        {lines.map((line) => (
          <div key={line.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ ...canvasType.chip, color: line.role === 'person' ? t.textMuted : t.violet }}>
              {line.role === 'person' ? 'You' : 'Companheiro'}
            </span>
            <p
              style={{
                ...canvasType.body, margin: 0, whiteSpace: 'pre-wrap',
                color: line.role === 'person' ? t.textSecondary : t.textPrimary,
              }}
            >
              {line.text || (busy ? '…' : '')}
            </p>
          </div>
        ))}

        {error && <p style={{ ...canvasType.small, color: t.ember, margin: 0 }}>{error}</p>}
        <div ref={bottom} />
      </div>

      {!disabled && (
        <div
          style={{
            flexShrink: 0, display: 'flex', gap: 8, alignItems: 'flex-end',
            borderTop: `1px solid ${alpha(t.textPrimary, 0.08)}`, paddingTop: 12,
          }}
        >
          <textarea
            ref={box}
            aria-label="Say something about the shape of this"
            value={draft + (dictation.interimText ? ` ${dictation.interimText}` : '')}
            rows={1}
            placeholder={mode === 'write' ? 'Ask for a suggestion…' : 'What are you turning over?'}
            onChange={(e) => { dictation.clearInterim(); setDraft(e.target.value) }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
            }}
            style={{
              flex: 1, resize: 'none', ...canvasType.body, color: t.textPrimary,
              background: t.inputBg, border: `1px solid ${t.inputBorder}`,
              borderRadius: radius.field, padding: '8px 10px', outline: 'none',
            }}
          />
          <MicButton
            recording={dictation.isRecording}
            onToggle={dictation.handleRecordToggle}
            size={34}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !draft.trim()}
            style={{
              ...canvasType.chip, padding: '8px 12px', borderRadius: radius.field,
              border: 'none', cursor: busy || !draft.trim() ? 'default' : 'pointer',
              background: busy || !draft.trim() ? alpha(t.textPrimary, 0.08) : t.inverseBg,
              color: busy || !draft.trim() ? t.textMuted : t.inverseText,
            }}
          >
            {busy ? '…' : 'Send'}
          </button>
        </div>
      )}

      {!disabled && canSuggest && (
        <ModeSwitch
          mode={mode}
          onChange={setMode}
          locked={isLocked}
          lockedUntil={lockedUntil ?? null}
          onRequestLock={onRequestLock}
        />
      )}
    </div>
  )
}

/** Reflect / Suggest, with the lock as its own small button beside it — an
 *  active lock parks the knob at that button rather than on either segment,
 *  so the motion still reads as "toward" it even though it's visually
 *  separate. Ported from the main app's write assistant, minus the duration
 *  picker itself (that lives in the modal onRequestLock opens). */
function ModeSwitch({
  mode, onChange, locked, lockedUntil, onRequestLock,
}: {
  mode: CompanionMode
  onChange: (mode: CompanionMode) => void
  locked: boolean
  lockedUntil: string | null
  onRequestLock?: () => void
}) {
  const { t } = useTheme()
  const position = locked ? 0 : mode === 'write' ? 2 : 1
  const trackBg = position === 0 ? t.violet : position === 2 ? t.tide : t.cardBgInner
  const segmentW = 40
  const trackW = segmentW * 3
  const knobD = 18
  const knobLeft = position * segmentW + (segmentW - knobD) / 2
  const segments: { key: CompanionMode; label: string; pos: number; activeColor: string }[] = [
    { key: 'coach', label: 'Reflect', pos: 1, activeColor: t.textPrimary },
    { key: 'write', label: 'Suggest', pos: 2, activeColor: t.tide },
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexShrink: 0, paddingTop: 4 }}>
      <button
        type="button"
        onClick={() => { if (!locked) onRequestLock?.() }}
        disabled={locked}
        aria-label={locked ? 'Reflect-only lock active' : 'Lock to reflect-only for a while'}
        title={locked && lockedUntil ? `Locked until ${new Date(lockedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Lock to reflect-only for a while'}
        style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
          border: `1px solid ${locked ? t.violet : alpha(t.textPrimary, 0.16)}`,
          background: locked ? alpha(t.violet, 0.16) : t.cardBgInner,
          color: locked ? t.violet : t.textMuted,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: locked ? 'default' : 'pointer', transition: 'all 160ms ease',
        }}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </button>
      <div>
        <div style={{ position: 'relative', display: 'flex', width: trackW, height: 22, borderRadius: 14, background: trackBg, transition: 'background-color 160ms ease' }}>
          <div
            style={{
              position: 'absolute', top: (22 - knobD) / 2, left: knobLeft, width: knobD, height: knobD, borderRadius: '50%',
              background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.35)', transition: 'left 160ms ease',
            }}
          />
          <div style={{ width: segmentW, flexShrink: 0 }} aria-hidden />
          {segments.map((seg) => (
            <button
              key={seg.key}
              type="button"
              onClick={() => { if (!locked) onChange(seg.key) }}
              disabled={locked}
              aria-label={seg.label}
              aria-pressed={mode === seg.key}
              style={{ position: 'relative', zIndex: 1, width: segmentW, flexShrink: 0, height: '100%', border: 'none', background: 'none', cursor: locked ? 'default' : 'pointer' }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', width: trackW, marginTop: 4, gap: 3 }}>
          <div style={{ width: segmentW - 3, flexShrink: 0 }} aria-hidden />
          {segments.map((seg) => (
            <span
              key={seg.key}
              style={{
                flex: 1, textAlign: 'center', fontSize: 9, letterSpacing: '0.01em', whiteSpace: 'nowrap',
                fontWeight: position === seg.pos ? 700 : 500,
                color: position === seg.pos ? seg.activeColor : t.textMuted,
                transition: 'color 160ms ease',
              }}
            >
              {seg.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
