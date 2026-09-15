'use client'

// studio/src/components/work/companion.tsx — talking the work through.
//
// It is given the shape and never the prose, so it can argue about whether the
// parts add up and cannot quietly start writing them. One conversation per
// altitude: the whole project has its own, and so does every part.

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

export function Companion({
  projectId,
  nodeId,
  /** What this conversation is about, shown once when it is empty. */
  scope,
  disabled = false,
}: {
  projectId: string
  nodeId: string | null
  scope: string
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [lines, setLines] = useState<Line[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  // One conversation per altitude, so the key is the pair.
  useEffect(() => {
    let alive = true
    setLoaded(false)
    setLines([])
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

    try {
      const res = await fetch(`/api/studio/projects/${projectId}/companion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message: text, node_id: nodeId }),
      })
      if (!res.ok) throw new Error('it did not answer')
      await readTextStream(res, (chunk) => {
        setLines((prev) => prev.map((l) => (l.id === replyId ? { ...l, text: l.text + chunk } : l)))
      })
    } catch {
      setLines((prev) => prev.filter((l) => l.id !== replyId))
      setError('It did not answer. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }, [busy, dictation, draft, nodeId, projectId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loaded && lines.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label>about {scope}</Label>
            <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>
              It can see the shape of this — what each part is for, the rules, the order, the
              threads and where they go quiet. It cannot see the writing, and it will not write
              anything for you.
            </p>
          </div>
        )}

        {lines.map((line) => (
          <div key={line.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ ...canvasType.chip, color: line.role === 'person' ? t.textMuted : t.violet }}>
              {line.role === 'person' ? 'you' : 'companheiro'}
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
            aria-label="say something about the shape of this"
            value={draft + (dictation.interimText ? ` ${dictation.interimText}` : '')}
            rows={1}
            placeholder="what are you turning over?"
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
            {busy ? '…' : 'send'}
          </button>
        </div>
      )}
    </div>
  )
}
