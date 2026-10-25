'use client'

// studio/src/components/work/companion.tsx — talking the work through.
//
// It is given the shape and never the prose, so it cannot start writing for
// you: there is no mode in which it does. (Words on request belong to the
// writing assistant, writing-assistant.tsx, and only on a direct order.)
//
// One conversation per altitude: the whole project has its own, and so does
// every part.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { MicButton } from '@/components/ui/mic-button'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { TextArea } from '@/components/ui/field'
import { readTextStream } from '@/lib/stream-client'
import { useDictation } from '@/lib/use-dictation'
import { Label } from '@/components/studio/work/bits'
import { WorkingDots } from '@/components/ui/working'
import type { RuleProposal } from '@/lib/studio/rule-proposals'

interface Line {
  id: string
  role: 'person' | 'companion'
  text: string
}

export function Companion({
  projectId,
  nodeId,
  /** What this conversation is about, shown once when it is empty. */
  scope,
  /** Inside one part: a passage highlighted there can be brought into the talk. */
  canSuggest = false,
  selection,
  onClearSelection,
  onRulesChanged,
  disabled = false,
}: {
  projectId: string
  nodeId: string | null
  scope: string
  canSuggest?: boolean
  /** The passage currently highlighted in this part's editor, if any. */
  selection?: { text: string } | null
  onClearSelection?: () => void
  /** A rule heard in talk was kept, so the rules on screen are stale. */
  onRulesChanged?: () => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [lines, setLines] = useState<Line[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<RuleProposal[]>([])
  const bottom = useRef<HTMLDivElement | null>(null)
  const box = useRef<HTMLTextAreaElement | null>(null)
  // The dictation hook wants the tail of what is already there for punctuation,
  // and it must not be re-created on every keystroke to get it.
  const draftRef = useRef('')
  draftRef.current = draft
  // Mirrors write/page.tsx's chatMessagesRef — the latest lines, readable
  // from the unmount/visibility cleanup below without re-subscribing it.
  const linesRef = useRef<Line[]>([])
  linesRef.current = lines
  // How much of `lines` has already been sent to the portrait distiller —
  // same batching shape as the main app's Write mode (WRITE_DISTILL_BATCH).
  const distilledUpToRef = useRef(0)

  const dictation = useDictation({
    onAppend: (text) => setDraft((prev) => (prev ? `${prev} ${text}` : text)),
    getContext: () => draftRef.current.slice(-200),
  })

  // One conversation per altitude, so the key is the pair.
  useEffect(() => {
    let alive = true
    setLoaded(false)
    setLines([])
    setProposals([])
    distilledUpToRef.current = 0
    const url = `/api/studio/projects/${projectId}/companion${nodeId ? `?node_id=${nodeId}` : ''}`
    fetch(`/api/studio/projects/${projectId}/proposals${nodeId ? `?node_id=${nodeId}` : ''}`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { proposals: [] }))
      .then((d: { proposals?: RuleProposal[] }) => { if (alive) setProposals(d.proposals ?? []) })
      .catch(() => {})
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

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [lines, busy])

  // Feeds this conversation to the Living Portrait as it happens — the same
  // distill-and-discard endpoint Write mode's chat uses (/api/write/distill
  // takes free-text messages and doesn't care whether they came from a
  // piece_id, a node_id, or neither). Batched the same way: flush once 8
  // lines have piled up, or early (4) when the tab is hidden, or in full on
  // unmount — never on every single message.
  const COMPANION_DISTILL_BATCH = 8
  const COMPANION_DISTILL_HIDDEN_MIN = 4
  const flushChatDistillation = useCallback(
    (allLines: Line[], force = false, minBatch = COMPANION_DISTILL_BATCH) => {
      const pending = allLines.slice(distilledUpToRef.current)
      if (pending.length === 0) return
      if (!force && pending.length < minBatch) return
      distilledUpToRef.current = allLines.length
      const messages = pending.map((l) => ({
        role: l.role === 'person' ? ('user' as const) : ('assistant' as const),
        content: l.text,
      }))
      fetch('/api/write/distill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        keepalive: true,
      }).catch((err) => console.error('Failed to distill studio companion chat:', err))
    },
    []
  )

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        flushChatDistillation(linesRef.current, false, COMPANION_DISTILL_HIDDEN_MIN)
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      flushChatDistillation(linesRef.current, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushChatDistillation])

  useLayoutEffect(() => {
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
    // Captured before setLines below, so the flush after the reply can
    // append this turn explicitly rather than re-reading it back out of
    // state/linesRef and risking a duplicate.
    const priorLines = linesRef.current
    const mine: Line = { id: `me-${Date.now()}`, role: 'person', text }
    const replyId = `it-${Date.now()}`
    setLines((prev) => [...prev, mine, { id: replyId, role: 'companion', text: '' }])
    // It never reads a part on its own, but a passage highlighted and handed
    // over is the person bringing it, the same as pasting it into the message.
    const activeSelection = canSuggest ? selection?.text ?? null : null

    try {
      const res = await fetch(`/api/studio/projects/${projectId}/companion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message: text, node_id: nodeId, selected_text: activeSelection }),
      })
      if (!res.ok) throw new Error('it did not answer')
      const result = await readTextStream<{ proposals?: RuleProposal[] }>(
        res,
        // The visible reply so far, whole, on every chunk (not a delta).
        (visible) => {
          setLines((prev) => prev.map((l) => (l.id === replyId ? { ...l, text: visible } : l)))
        },
      )
      const heard = result.meta?.proposals ?? []
      if (heard.length) setProposals((prev) => [...prev.filter((p) => !heard.some((h) => h.id === p.id)), ...heard])
      if (result.text) {
        flushChatDistillation([...priorLines, mine, { id: replyId, role: 'companion', text: result.text }])
      }
    } catch {
      setLines((prev) => prev.filter((l) => l.id !== replyId))
      setError('It did not answer. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }, [busy, canSuggest, dictation, draft, flushChatDistillation, nodeId, projectId, selection])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
      {/* context strip: what this message would land on, if you sent one */}
      {canSuggest && selection?.text && (
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
              {nodeId
                  ? 'It can see the shape of this — what this part is for, the rules, the order, the threads and where they go quiet. It cannot see the writing beyond a passage you hand it by highlighting one, and it will not write anything for you.'
                  : 'It can see the shape of the whole thing — what each part is for, the rules, the order, the threads and where they go quiet. It cannot see the writing, and it will not write anything for you. It is also there for who this is actually for, and why it is worth making at all, whenever you want to go there.'}
            </p>
          </div>
        )}

        {lines.map((line, i) => (
          <div key={line.id} role={busy && i === lines.length - 1 ? 'status' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ ...canvasType.chip, color: line.role === 'person' ? t.textMuted : t.violet }}>
              {line.role === 'person' ? 'You' : 'Companheiro'}
            </span>
            <p
              style={{
                ...canvasType.body, margin: 0, whiteSpace: 'pre-wrap',
                color: line.role === 'person' ? t.textSecondary : t.textPrimary,
              }}
            >
              {line.text}
              {busy && line.role === 'companion' && i === lines.length - 1 && <>{line.text ? ' ' : null}<WorkingDots color={t.violet} /></>}
            </p>
          </div>
        ))}

        {!busy && proposals.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            disabled={disabled}
            onAnswered={(kept) => {
              setProposals((prev) => prev.filter((x) => x.id !== p.id))
              if (kept) onRulesChanged?.()
            }}
          />
        ))}

        {error && <p style={{ ...canvasType.small, color: t.ember, margin: 0 }}>{error}</p>}
        <div ref={bottom} />
      </div>

      {!disabled && (
        <div
          className="composer-row"
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
            placeholder="What are you turning over?"
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
            aria-busy={busy || undefined}
            disabled={busy || !draft.trim()}
            style={{
              ...canvasType.chip, padding: '8px 12px', borderRadius: radius.field,
              border: 'none', cursor: busy || !draft.trim() ? 'default' : 'pointer',
              background: busy || !draft.trim() ? alpha(t.textPrimary, 0.08) : t.inverseBg,
              color: busy || !draft.trim() ? t.textMuted : t.inverseText,
            }}
          >
            {busy ? <WorkingDots /> : 'Send'}
          </button>
        </div>
      )}

    </div>
  )
}

/**
 * A rule heard in what they said, waiting for their answer. Their words are
 * shown as they said them; the rule can be reworded before it is kept.
 * Declining means it is never offered again.
 */
export function ProposalCard({
  proposal, disabled, onAnswered,
}: {
  proposal: RuleProposal
  disabled: boolean
  onAnswered: (kept: boolean) => void
}) {
  const { t } = useTheme()
  const [text, setText] = useState(proposal.statement)
  const [busy, setBusy] = useState<'keep' | 'decline' | null>(null)
  const [failed, setFailed] = useState(false)

  const answer = async (action: 'keep' | 'decline') => {
    if (busy) return
    setBusy(action)
    setFailed(false)
    try {
      const res = await fetch(`/api/studio/proposals/${proposal.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action, text: action === 'keep' ? text : undefined }),
      })
      // Already answered elsewhere counts as answered here too.
      if (!res.ok && res.status !== 409) throw new Error('failed')
      onAnswered(action === 'keep' && res.ok)
    } catch {
      setFailed(true)
      setBusy(null)
    }
  }

  const chip = (label: string, onClick: () => void, strong: boolean, loading: boolean) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !!busy || (strong && !text.trim())}
      style={{
        ...canvasType.chip, padding: '6px 11px', borderRadius: radius.field, border: 'none',
        cursor: disabled || busy ? 'default' : 'pointer',
        background: strong ? t.inverseBg : alpha(t.textPrimary, 0.07),
        color: strong ? t.inverseText : t.textSecondary,
      }}
    >
      {loading ? <WorkingDots /> : label}
    </button>
  )

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
        borderRadius: radius.widget, background: alpha(t.ochre, 0.08), border: `1px solid ${alpha(t.ochre, 0.28)}`,
      }}
    >
      <span style={{ ...canvasType.chip, color: t.ochre }}>
        {proposal.kind === 'non_negotiable' ? 'Something this has to keep?' : 'Something this refuses?'}
      </span>
      <TextArea
        bare
        oneParagraph
        maxHeight={200}
        ariaLabel="The rule, in your words"
        value={text}
        disabled={disabled || !!busy}
        onChange={setText}
        style={{
          ...canvasType.body,
          borderBottom: `1px dashed ${alpha(t.textPrimary, 0.2)}`, padding: '2px 0',
        }}
      />
      {proposal.quote && (
        <p style={{ ...canvasType.small, color: t.textMuted, margin: 0, fontStyle: 'italic' }}>
          You said: “{proposal.quote}”
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {chip('Keep it as a rule', () => void answer('keep'), true, busy === 'keep')}
        {chip('Not a rule', () => void answer('decline'), false, busy === 'decline')}
        {failed && <span style={{ ...canvasType.small, color: t.ember }}>That did not save. Try again.</span>}
      </div>
    </div>
  )
}
