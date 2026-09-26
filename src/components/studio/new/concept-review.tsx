'use client'

// src/components/studio/new/concept-review.tsx — lane H (10.2, D-061). The
// review screen: the model drafted a definition from the person's words; the
// person edits every part of it before anything exists. Title input, body
// textarea, constraints as lines (add / remove), anchor lines as checkboxes
// (default checked), references with a title field each, and the read-only
// list the compass will ask them to confirm. `make the project` is the only
// write, and it happens in the parent.

import { useState } from 'react'
import { X } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { TextArea, TextField } from '@/components/ui/field'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { canvasType, line, radii } from '@/lib/studio/canvas-tokens'
import type { CreateProjectRequest, DraftConceptResponse } from '@/lib/studio/types'

interface AnchorRow { text: string; checked: boolean }
interface ReferenceRow { url: string; title: string; note: string }

export function ConceptReview({
  draft,
  busy,
  error,
  onBack,
  onMake,
}: {
  draft: DraftConceptResponse
  busy: boolean
  error: string | null
  onBack(): void
  onMake(req: CreateProjectRequest): void
}) {
  const { t } = useTheme()
  const [title, setTitle] = useState(draft.title)
  const [body, setBody] = useState(draft.body)
  const [constraints, setConstraints] = useState<string[]>(draft.constraints)
  const [anchors, setAnchors] = useState<AnchorRow[]>(draft.anchor_candidates.map((text) => ({ text, checked: true })))
  const [references, setReferences] = useState<ReferenceRow[]>(draft.references)

  const canMake = body.trim().length > 0 && !busy

  const make = () => {
    if (!canMake) return
    onMake({
      title: title.trim() || 'Untitled project',
      concept: { body: body.trim(), constraints: constraints.map((c) => c.trim()).filter(Boolean) },
      anchors: anchors.filter((a) => a.checked && a.text.trim()).map((a) => a.text.trim()),
      references: references.map((r) => ({ url: r.url.trim(), title: r.title.trim(), note: r.note.trim() })).filter((r) => r.url),
      compass_seed: draft.compass_seed,
    })
  }

  const label = (text: string) => <div style={{ ...canvasType.eyebrow, color: t.textMuted }}>{text}</div>
  const hairline = <div style={{ height: 1, backgroundColor: line.onPaper(t) }} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>
        A first definition, drafted from your words. Change anything; nothing exists until you make the project.
      </p>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {label('Title')}
        <TextField
          value={title}
          onChange={setTitle}
          placeholder="A name for it"
          ariaLabel="Project title"
          disabled={busy}
          style={{ ...canvasType.conceptTitle, padding: '10px 14px' }}
        />
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {label('Concept')}
        <TextArea
          value={body}
          onChange={setBody}
          placeholder="What it is, in your words"
          ariaLabel="Concept"
          voice
          minRows={4}
          maxHeight={640}
          disabled={busy}
        />
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {label('Constraints')}
        {constraints.length === 0 && <div style={{ ...canvasType.small, color: t.textMuted }}>None stated · add one if there is one</div>}
        {constraints.map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TextField
              value={c}
              onChange={(v) => setConstraints((prev) => prev.map((x, j) => (j === i ? v : x)))}
              placeholder="A limit, a rule, a scope"
              ariaLabel={`Constraint ${i + 1}`}
              disabled={busy}
            />
            <button
              type="button"
              onClick={() => setConstraints((prev) => prev.filter((_, j) => j !== i))}
              disabled={busy}
              aria-label="Remove this constraint"
              title="Remove"
              className="studio-icon"
              style={iconButton(t.textSecondary)}
            >
              <X size={16} strokeWidth={1.5} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setConstraints((prev) => [...prev, ''])}
          disabled={busy}
          style={textButton(t.textPrimary)}
        >
          Add a line
        </button>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {label('Anchor lines')}
        {anchors.length === 0 ? (
          <div style={{ ...canvasType.small, color: t.textMuted }}>Nothing you said stood out as a line to keep · you can make one later from an update</div>
        ) : (
          <>
            <div style={{ ...canvasType.small, color: t.textSecondary }}>Your own words, kept large on the canvas. Untick any that should not be.</div>
            {anchors.map((a, i) => (
              <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: busy ? 'default' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={a.checked}
                  disabled={busy}
                  onChange={(e) => setAnchors((prev) => prev.map((x, j) => (j === i ? { ...x, checked: e.target.checked } : x)))}
                  style={{ width: 16, height: 16, margin: '4px 0 0', accentColor: t.textPrimary, flexShrink: 0 }}
                />
                <span style={{ ...canvasType.anchor, fontSize: 22, color: a.checked ? t.textPrimary : t.textMuted }}>{a.text}</span>
              </label>
            ))}
          </>
        )}
      </section>

      {references.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {label('References')}
          <div style={{ ...canvasType.small, color: t.textSecondary }}>The links you pasted. The page is never opened; only your words around it are read.</div>
          {references.map((r, i) => (
            <div
              key={i}
              style={{ backgroundColor: t.cardBg, borderRadius: radii.block, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div style={{ ...canvasType.meta, color: t.tide, wordBreak: 'break-all' }}>{r.url}</div>
              <TextField
                value={r.title}
                onChange={(v) => setReferences((prev) => prev.map((x, j) => (j === i ? { ...x, title: v } : x)))}
                placeholder="A title for it"
                ariaLabel={`Title for ${r.url}`}
                disabled={busy}
              />
              {r.note && <div style={{ ...canvasType.small, color: t.textSecondary }}>{r.note}</div>}
              <button
                type="button"
                onClick={() => setReferences((prev) => prev.filter((_, j) => j !== i))}
                disabled={busy}
                style={{ ...textButton(t.textSecondary), alignSelf: 'flex-start' }}
              >
                Leave it out
              </button>
            </div>
          ))}
        </section>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {label('The compass will ask you to confirm these')}
        {draft.compass_seed.length === 0 ? (
          <div style={{ ...canvasType.small, color: t.textMuted }}>Nothing yet · it fills from what you say in talk</div>
        ) : (
          <div style={{ backgroundColor: t.cardBg, borderRadius: radii.block, padding: '4px 16px' }}>
            {draft.compass_seed.map((c, i) => (
              <div key={i}>
                {i > 0 && hairline}
                <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 12, padding: '12px 0', alignItems: 'baseline' }}>
                  <span style={{ ...canvasType.label, color: t.textMuted }}>{c.kind === 'refusal' ? 'Refusal' : 'Non-negotiable'}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ ...canvasType.small, color: t.textPrimary }}>{c.statement}</span>
                    <span style={{ ...canvasType.meta, color: t.textMuted }}>“{c.quote}”</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <div style={{ ...canvasType.meta, color: t.danger }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 4 }}>
        <GhostButton onClick={onBack} disabled={busy}>
          Back to your words
        </GhostButton>
        <PrimaryButton onClick={make} disabled={!canMake} loading={busy} loadingLabel="Making it">
          Make the project
        </PrimaryButton>
      </div>
    </div>
  )
}

function textButton(color: string): React.CSSProperties {
  return { ...canvasType.small, fontWeight: 500, color, background: 'none', border: 'none', padding: 0, cursor: 'pointer', alignSelf: 'flex-start' }
}

function iconButton(color: string): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color,
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  }
}
