'use client'

// The conversation half of the vision room (vision-room.tsx).
//
// One conversation for the whole project, and only for this project. It sees
// every word written on the canvas and none of the writing inside a piece,
// so unlike the talk inside a part (companion.tsx) there is no Suggest mode
// here and nothing it says can land in a document.
//
// What it can do that the other cannot: look things up, and show where it
// looked; be asked on purpose for who the work is for, how it reaches them,
// what the field is doing, the brief against the vision, and what is weakest;
// and hear a decision or an open question in what was said, which it only
// ever offers to keep.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { MicButton } from '@/components/ui/mic-button'
import { TextArea } from '@/components/ui/field'
import { WorkingDots } from '@/components/ui/working'
import { ProposalCard } from '@/components/studio/work/companion'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { readTextStream } from '@/lib/stream-client'
import { useDictation } from '@/lib/use-dictation'
import type { RuleProposal } from '@/lib/studio/rule-proposals'
import { hostOf, LENSES, type KeptLine, type Lens, type Source, type VisionMessage } from '@/lib/studio/vision/types'

interface Line {
  id: string
  role: 'person' | 'companion'
  text: string
  sources: Source[]
}

interface ReplyMeta {
  sources?: Source[]
  proposals?: RuleProposal[]
  heard?: KeptLine[]
  truncated?: boolean
  refused?: boolean
}

// The same batching the talk inside a piece uses to feed the Living Portrait.
const DISTILL_BATCH = 8
const DISTILL_HIDDEN_MIN = 4
/** How long a reply may be silent before the wait is explained. */
const SLOW_AFTER_MS = 4000

export function VisionTalk({
  projectId,
  loaded,
  messages,
  pending,
  onHeard,
  onKept,
  onRulesChanged,
  disabled = false,
  autoFocus = false,
}: {
  projectId: string
  /** The conversation so far has arrived. */
  loaded: boolean
  messages: VisionMessage[]
  /** Decisions and open questions heard in talk, waiting for an answer. */
  pending: KeptLine[]
  onHeard: (lines: KeptLine[]) => void
  /** An answer was given; this is everything the project now keeps. */
  onKept: (kept: KeptLine[]) => void
  /** A rule heard in talk was kept, so the rules on the page are stale. */
  onRulesChanged: () => void
  disabled?: boolean
  autoFocus?: boolean
}) {
  const { t } = useTheme()
  const [lines, setLines] = useState<Line[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<RuleProposal[]>([])
  const bottom = useRef<HTMLDivElement | null>(null)
  const box = useRef<HTMLTextAreaElement | null>(null)
  const draftRef = useRef('')
  draftRef.current = draft
  const linesRef = useRef<Line[]>([])
  linesRef.current = lines
  const distilledUpTo = useRef(0)

  const dictation = useDictation({
    onAppend: (text) => setDraft((prev) => (prev ? `${prev} ${text}` : text)),
    getContext: () => draftRef.current.slice(-200),
  })

  // What was said before arrives once; it has already been through the portrait.
  useEffect(() => {
    if (!loaded) return
    const first = messages.map((m) => ({ id: m.id, role: m.role, text: m.text, sources: m.sources }))
    setLines(first)
    distilledUpTo.current = first.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  useEffect(() => {
    let alive = true
    fetch(`/api/studio/projects/${projectId}/proposals`, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { proposals: [] }))
      .then((d: { proposals?: RuleProposal[] }) => { if (alive) setProposals(d.proposals ?? []) })
      .catch(() => {})
    return () => { alive = false }
  }, [projectId])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [lines, busy, pending.length, proposals.length])

  useEffect(() => {
    if (autoFocus && loaded) box.current?.focus({ preventScroll: true })
  }, [autoFocus, loaded])

  const distill = useCallback((all: Line[], force = false, minBatch = DISTILL_BATCH) => {
    const waiting = all.slice(distilledUpTo.current)
    if (waiting.length === 0) return
    if (!force && waiting.length < minBatch) return
    distilledUpTo.current = all.length
    fetch('/api/write/distill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: waiting.map((l) => ({ role: l.role === 'person' ? 'user' : 'assistant', content: l.text })) }),
      keepalive: true,
    }).catch((err) => console.error('Failed to distill the vision talk:', err))
  }, [])

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') distill(linesRef.current, false, DISTILL_HIDDEN_MIN)
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      distill(linesRef.current, true)
    }
  }, [distill])

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`
  }, [draft, dictation.interimText])

  const say = useCallback(async (text: string, lens: Lens | null) => {
    if (!text || busy) return
    if (dictation.isRecording) dictation.stopRecording()
    setError(null)
    setBusy(true)
    setSlow(false)
    const explain = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    const before = linesRef.current
    const mine: Line = { id: `me-${Date.now()}`, role: 'person', text, sources: [] }
    const replyId = `it-${Date.now()}`
    setLines((prev) => [...prev, mine, { id: replyId, role: 'companion', text: '', sources: [] }])

    try {
      const res = await fetch(`/api/studio/projects/${projectId}/vision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message: text, lens }),
      })
      if (!res.ok) throw new Error('it did not answer')
      const result = await readTextStream<ReplyMeta>(res, (visible) => {
        if (visible) { window.clearTimeout(explain); setSlow(false) }
        setLines((prev) => prev.map((l) => (l.id === replyId ? { ...l, text: visible } : l)))
      })
      const sources = result.meta?.sources ?? []
      if (!result.text) {
        setLines((prev) => prev.filter((l) => l.id !== replyId))
        setError(result.meta?.refused ? 'It could not answer that one. Saying it another way sometimes helps.' : 'It came back with nothing. Try again in a moment.')
      } else {
        setLines((prev) => prev.map((l) => (l.id === replyId ? { ...l, text: result.text, sources } : l)))
        if (result.meta?.truncated) setError('That reply was cut short. Ask it to go on.')
        distill([...before, mine, { id: replyId, role: 'companion', text: result.text, sources }])
      }
      const heardRules = result.meta?.proposals ?? []
      if (heardRules.length) setProposals((prev) => [...prev.filter((p) => !heardRules.some((h) => h.id === p.id)), ...heardRules])
      if (result.meta?.heard?.length) onHeard(result.meta.heard)
    } catch {
      setLines((prev) => prev.filter((l) => l.id !== replyId))
      setError('It did not answer. Try again in a moment.')
    } finally {
      window.clearTimeout(explain)
      setSlow(false)
      setBusy(false)
    }
  }, [busy, dictation, distill, onHeard, projectId])

  const send = useCallback(() => {
    const text = draftRef.current.trim()
    if (!text) return
    setDraft('')
    void say(text, null)
  }, [say])

  const quiet = loaded && lines.length === 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%', minHeight: 0 }}>
      <div className="vision-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 4 }}>
        {!loaded && <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}><WorkingDots color={t.violet} /></p>}

        {quiet && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ ...canvasType.conceptBody, color: t.textPrimary, margin: 0 }}>
              Say where this project is, or where it is stuck.
            </p>
            <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>
              It has read every word on this canvas and nothing from any other project. It can look things up, and shows you where it looked. It will not write the work, and it will not tell you the work is good.
            </p>
          </div>
        )}

        {lines.map((line, i) => (
          <div key={line.id} role={busy && i === lines.length - 1 ? 'status' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ ...canvasType.chip, color: line.role === 'person' ? t.textMuted : t.violet }}>
              {line.role === 'person' ? 'You' : 'Companheiro'}
            </span>
            <p style={{ ...canvasType.body, margin: 0, whiteSpace: 'pre-wrap', color: line.role === 'person' ? t.textSecondary : t.textPrimary }}>
              {line.text}
              {busy && line.role === 'companion' && i === lines.length - 1 && <>{line.text ? ' ' : null}<WorkingDots color={t.violet} /></>}
            </p>
            {busy && slow && line.role === 'companion' && i === lines.length - 1 && !line.text && (
              <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>Thinking it through. If it needs to, it is looking something up.</p>
            )}
            {line.sources.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, paddingLeft: 10, borderLeft: `2px solid ${alpha(t.violet, 0.35)}` }}>
                <span style={{ ...canvasType.chip, color: t.textMuted }}>Where it looked</span>
                {line.sources.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...canvasType.small, color: t.textSecondary, textDecoration: 'underline', textDecorationColor: alpha(t.textPrimary, 0.25), textUnderlineOffset: 3, overflowWrap: 'anywhere' }}
                  >
                    {s.title} <span style={{ color: t.textMuted }}>· {hostOf(s.url)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}

        {!busy && pending.map((k) => (
          <KeptCard key={k.id} projectId={projectId} line={k} disabled={disabled} onAnswered={onKept} />
        ))}

        {!busy && proposals.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            disabled={disabled}
            onAnswered={(kept) => {
              setProposals((prev) => prev.filter((x) => x.id !== p.id))
              if (kept) onRulesChanged()
            }}
          />
        ))}

        {error && <p style={{ ...canvasType.small, color: t.ember, margin: 0 }}>{error}</p>}
        <div ref={bottom} />
      </div>

      {!disabled && (
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, borderTop: `1px solid ${alpha(t.textPrimary, 0.08)}`, paddingTop: 12 }}>
          {/* Asked on purpose, each one a question in the person's own voice. */}
          <div role="group" aria-label="Ask it to look at the vision a particular way" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {LENSES.map((lens) => (
              <button
                key={lens.key}
                type="button"
                title={lens.says}
                disabled={busy}
                onClick={() => void say(lens.says, lens.key)}
                style={{
                  ...canvasType.small, fontSize: 12, flexShrink: 0, whiteSpace: 'nowrap', padding: '6px 11px', borderRadius: 999,
                  cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1,
                  background: lens.key === 'weakest' ? 'transparent' : alpha(t.violet, 0.1),
                  border: `1px solid ${alpha(lens.key === 'weakest' ? t.textPrimary : t.violet, lens.key === 'weakest' ? 0.22 : 0.3)}`,
                  color: lens.key === 'weakest' ? t.textSecondary : t.textPrimary,
                }}
              >
                {lens.label}
              </button>
            ))}
          </div>
          <div className="composer-row" style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={box}
              aria-label="Say something about the vision of this project"
              value={draft + (dictation.interimText ? ` ${dictation.interimText}` : '')}
              rows={1}
              placeholder="What are you turning over?"
              onChange={(e) => { dictation.clearInterim(); setDraft(e.target.value) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
              }}
              style={{
                flex: 1, resize: 'none', ...canvasType.body, color: t.textPrimary,
                background: t.inputBg, border: `1px solid ${t.inputBorder}`,
                borderRadius: radius.field, padding: '10px 12px', outline: 'none', scrollbarWidth: 'none',
              }}
            />
            <MicButton recording={dictation.isRecording} onToggle={dictation.handleRecordToggle} size={38} />
            <button
              type="button"
              onClick={send}
              aria-busy={busy || undefined}
              disabled={busy || !draft.trim()}
              style={{
                ...canvasType.small, fontSize: 12, padding: '11px 14px', borderRadius: radius.field,
                border: 'none', cursor: busy || !draft.trim() ? 'default' : 'pointer',
                background: busy || !draft.trim() ? alpha(t.textPrimary, 0.08) : t.inverseBg,
                color: busy || !draft.trim() ? t.textMuted : t.inverseText,
              }}
            >
              {busy ? <WorkingDots /> : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * A decision, or a question left open, heard in what they said. Their words
 * are shown as they said them; the line can be reworded before it is kept, and
 * a decision can be given its reason. Turning it down means it is never
 * offered again.
 */
function KeptCard({
  projectId, line, disabled, onAnswered,
}: {
  projectId: string
  line: KeptLine
  disabled: boolean
  onAnswered: (kept: KeptLine[]) => void
}) {
  const { t } = useTheme()
  const [text, setText] = useState(line.text)
  const [why, setWhy] = useState(line.why)
  const [busy, setBusy] = useState<'keep' | 'decline' | null>(null)
  const [failed, setFailed] = useState(false)
  const decision = line.kind === 'decision'
  const tone = decision ? t.verdant : t.tide

  const answer = async (action: 'keep' | 'decline') => {
    if (busy) return
    setBusy(action)
    setFailed(false)
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/vision/kept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(action === 'keep' ? { action, id: line.id, text, why } : { action, id: line.id }),
      })
      if (!res.ok) throw new Error('failed')
      const data = (await res.json()) as { kept: KeptLine[] }
      onAnswered(data.kept)
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
        ...canvasType.chip, fontSize: 11, padding: '7px 12px', borderRadius: radius.field, border: 'none',
        cursor: disabled || busy ? 'default' : 'pointer',
        background: strong ? t.inverseBg : alpha(t.textPrimary, 0.07),
        color: strong ? t.inverseText : t.textSecondary,
      }}
    >
      {loading ? <WorkingDots /> : label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: radius.widget, background: alpha(tone, 0.08), border: `1px solid ${alpha(tone, 0.28)}` }}>
      <span style={{ ...canvasType.chip, color: tone }}>{decision ? 'Something you just decided?' : 'Something still open?'}</span>
      <TextArea
        bare
        oneParagraph
        maxHeight={200}
        ariaLabel={decision ? 'The decision, in your words' : 'The question, in your words'}
        value={text}
        disabled={disabled || !!busy}
        onChange={setText}
        style={{ ...canvasType.body, borderBottom: `1px dashed ${alpha(t.textPrimary, 0.2)}`, padding: '2px 0' }}
      />
      {decision && (
        <TextArea
          bare
          oneParagraph
          maxHeight={160}
          ariaLabel="Why, if you want it kept with the decision"
          placeholder="Why? Only if you want it kept."
          value={why}
          disabled={disabled || !!busy}
          onChange={setWhy}
          style={{ ...canvasType.small, color: t.textSecondary, borderBottom: `1px dashed ${alpha(t.textPrimary, 0.14)}`, padding: '2px 0' }}
        />
      )}
      {line.quote && (
        <p style={{ ...canvasType.small, color: t.textMuted, margin: 0, fontStyle: 'italic' }}>You said: “{line.quote}”</p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {chip(decision ? 'Keep it as decided' : 'Keep it as open', () => void answer('keep'), true, busy === 'keep')}
        {chip('Not this', () => void answer('decline'), false, busy === 'decline')}
        {failed && <span style={{ ...canvasType.small, color: t.ember }}>That did not save. Try again.</span>}
      </div>
    </div>
  )
}
