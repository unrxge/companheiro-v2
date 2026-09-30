'use client'

// Something that seems to run across several pieces of this project, offered
// as a thread under the vision block, beside any rule checks. Making it adds
// the thread and marks the pieces it touches; "not this" means that name is
// never offered again. Read from /thread-suggestions, which only looks again
// when the pieces have changed.

import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import type { ThreadSuggestion } from '@/lib/studio/thread-suggestion'

async function call(projectId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/studio/projects/${projectId}/thread-suggestions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('failed')
  return res.json()
}

/** Loads once per board visit (when enabled) and answers suggestions. */
export function useThreadSuggestions(projectId: string, enabled: boolean, onMade: () => void) {
  const [suggestions, setSuggestions] = useState<ThreadSuggestion[]>([])
  useEffect(() => {
    if (!enabled) return
    let alive = true
    call(projectId, { action: 'read' })
      .then((d: { suggestions?: ThreadSuggestion[] }) => { if (alive) setSuggestions(d.suggestions ?? []) })
      .catch(() => {})
    return () => { alive = false }
  }, [projectId, enabled])

  const answer = useCallback(async (id: string, action: 'accept' | 'decline') => {
    await call(projectId, { action, id })
    setSuggestions((prev) => prev.filter((s) => s.id !== id))
    if (action === 'accept') onMade()
  }, [onMade, projectId])

  return { suggestions, answer }
}

export function ThreadSuggestionCard({
  suggestion, pieceTitle, onAnswer, disabled = false,
}: {
  suggestion: ThreadSuggestion
  pieceTitle: (id: string) => string
  onAnswer: (action: 'accept' | 'decline') => Promise<void>
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [failed, setFailed] = useState(false)
  const act = async (action: 'accept' | 'decline') => {
    if (busy) return
    setBusy(action)
    setFailed(false)
    try {
      await onAnswer(action)
    } catch {
      setFailed(true)
      setBusy(null)
    }
  }
  return (
    <div
      style={{
        border: `1px solid ${alpha(t.tide, 0.4)}`, background: alpha(t.tide, 0.07), borderRadius: radius.widget,
        padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ ...canvasType.chip, color: t.tide }}>Something may run across these</div>
      <p style={{ ...canvasType.body, color: t.textPrimary, margin: 0, fontWeight: 600 }}>{suggestion.name}</p>
      {suggestion.intent && <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>{suggestion.intent}</p>}
      {suggestion.why && <p style={{ ...canvasType.small, color: t.textMuted, margin: 0, fontStyle: 'italic' }}>{suggestion.why}</p>}
      <p style={{ ...canvasType.chip, color: t.textMuted, margin: 0 }}>
        Through {suggestion.piece_ids.map(pieceTitle).join(', ')}
      </p>
      {!disabled && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
          <QuietButton size="sm" onClick={() => void act('accept')} loading={busy === 'accept'} loadingLabel="Making it…">
            Make it a thread
          </QuietButton>
          <GhostButton size="sm" onClick={() => void act('decline')} disabled={!!busy}>Not this</GhostButton>
          {failed && <span style={{ ...canvasType.small, color: t.ember }}>That did not save. Try again.</span>}
        </div>
      )}
    </div>
  )
}
