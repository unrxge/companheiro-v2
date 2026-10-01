'use client'

// Something the person said in a check-in and chose to send to this project,
// waiting for their answer here. Shown where the project's other notices sit:
// under the vision block on the board, or above the writing in a project of
// one piece. Approving adds it to the project as a thread, their words as
// what it holds; they can name it now or later on the board.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { formatDateAsRelative } from '@/lib/dates'
import type { CarriedThought } from '@/lib/studio/types'

export function CarriedCard({
  projectId, thought, pieces, onAnswered, disabled = false,
}: {
  projectId: string
  thought: CarriedThought
  /** The project's pieces. With more than one, they say which it runs through. */
  pieces: Array<{ id: string; title: string }>
  /** Called once the server has it; `added` is true when it became a thread. */
  onAnswered: (added: boolean) => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [name, setName] = useState('')
  const choosing = pieces.length > 1
  const [chosen, setChosen] = useState<string[]>([])
  const ready = !choosing || chosen.length > 0
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null)
  const [failed, setFailed] = useState(false)

  const answer = async (action: 'accept' | 'decline') => {
    if (busy || (action === 'accept' && !ready)) return
    setBusy(action)
    setFailed(false)
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/carried`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ action, id: thought.id, ...(action === 'accept' ? { name, piece_ids: choosing ? chosen : undefined } : {}) }),
      })
      if (!res.ok) throw new Error('failed')
      onAnswered(action === 'accept')
    } catch {
      setFailed(true)
      setBusy(null)
    }
  }

  return (
    <div
      style={{
        border: `1px solid ${alpha(t.violet, 0.4)}`, background: alpha(t.violet, 0.07), borderRadius: radius.widget,
        padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <div style={{ ...canvasType.chip, color: t.violet }}>From your check-in, {formatDateAsRelative(thought.at)}</div>
      <p style={{ ...canvasType.body, color: t.textPrimary, margin: 0, fontStyle: 'italic' }}>“{thought.text}”</p>
      {!disabled && (
        <>
          <input
            aria-label="A name for the thread"
            value={name}
            maxLength={120}
            disabled={!!busy}
            placeholder="Name the thread, or leave it for later"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void answer('accept') }}
            style={{
              ...canvasType.small, color: t.textPrimary, background: t.inputBg,
              border: `1px solid ${t.inputBorder}`, borderRadius: radius.field, padding: '8px 10px', outline: 'none',
            }}
          />
          {choosing && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ ...canvasType.chip, color: t.textMuted }}>Runs through</span>
              {pieces.map((p) => {
                const on = chosen.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    disabled={!!busy}
                    onClick={() => setChosen((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                    style={{
                      ...canvasType.chip, padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
                      border: `1px solid ${on ? t.violet : alpha(t.textPrimary, 0.16)}`,
                      background: on ? alpha(t.violet, 0.16) : 'transparent',
                      color: on ? t.textPrimary : t.textSecondary,
                    }}
                  >
                    {p.title || 'untitled'}
                  </button>
                )
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
            <QuietButton size="sm" onClick={() => void answer('accept')} disabled={!ready} loading={busy === 'accept'} loadingLabel="Adding…">
              Add it as a thread
            </QuietButton>
            <GhostButton size="sm" onClick={() => void answer('decline')} disabled={!!busy}>Not for this project</GhostButton>
            {failed && <span style={{ ...canvasType.small, color: t.ember }}>That did not save. Try again.</span>}
          </div>
        </>
      )}
    </div>
  )
}
