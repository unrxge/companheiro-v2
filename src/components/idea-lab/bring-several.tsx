'use client'

// Bring several things: a draft, a lyric, a note, a photo idea, set side by
// side so the conversation can ask what they share. The person chooses every
// item, which is what makes the question fair: they already suspect a link.
// Captures appear only when picked here by hand (see memory:
// collector-standalone); pieces are the person's own writing.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { Eyebrow } from '@/components/shell/page-shell'
import { GhostButton, PrimaryButton, QuietButton } from '@/components/ui/buttons'
import { TextArea, TextField } from '@/components/ui/field'
import { MicButton } from '@/components/ui/mic-button'
import { alpha, radius, type as typeRoles } from '@/lib/design-tokens'
import { useDictation } from '@/lib/use-dictation'
import { BROUGHT_SEVERAL_KEY, type BroughtItem } from '@/lib/brought-several'

interface Piece { id: string; title: string; excerpt: string }
interface CaptureLike { id: string; unpacked: string; raw_input: string }

const MAX_ITEMS = 6

export function BringSeveral({ captures, onBack }: { captures: CaptureLike[]; onBack: () => void }) {
  const { t } = useTheme()
  const router = useRouter()
  const [items, setItems] = useState<BroughtItem[]>([{ kind: '', text: '' }, { kind: '', text: '' }])
  const [picker, setPicker] = useState<'pieces' | 'captures' | null>(null)
  const [pieces, setPieces] = useState<Piece[] | null>(null)
  const active = useRef(0)
  const itemsRef = useRef(items)
  itemsRef.current = items

  const setItem = (i: number, patch: Partial<BroughtItem>) =>
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  // One microphone for the whole panel: it writes into whichever item was last touched.
  const dictation = useDictation({
    onAppend: useCallback((text: string) => {
      setItems((prev) => prev.map((x, j) => (j === active.current ? { ...x, text: x.text + (x.text && !x.text.endsWith(' ') ? ' ' : '') + text } : x)))
    }, []),
    getContext: () => (itemsRef.current[active.current]?.text ?? '').slice(-80),
  })

  useEffect(() => {
    if (picker !== 'pieces' || pieces) return
    fetch('/api/idea-lab/materials')
      .then((r) => (r.ok ? r.json() : { pieces: [] }))
      .then((d: { pieces?: Piece[] }) => setPieces(d.pieces ?? []))
      .catch(() => setPieces([]))
  }, [picker, pieces])

  /** A picked thing fills the first empty slot, or a new one. */
  const bring = (item: BroughtItem) => {
    setItems((prev) => {
      const empty = prev.findIndex((x) => !x.text.trim())
      if (empty >= 0) return prev.map((x, j) => (j === empty ? item : x))
      return prev.length < MAX_ITEMS ? [...prev, item] : prev
    })
    setPicker(null)
  }

  const filled = items.filter((x) => x.text.trim())
  const full = items.length >= MAX_ITEMS && filled.length >= MAX_ITEMS

  const go = () => {
    if (filled.length < 2) return
    if (dictation.isRecording) dictation.stopRecording()
    sessionStorage.setItem(BROUGHT_SEVERAL_KEY, JSON.stringify(filled.map((x) => ({ kind: x.kind.trim(), text: x.text.trim() }))))
    router.push('/idea-lab/conceptualise?mode=several')
  }

  const pickerList = (rows: Array<{ id: string; title: string; body: string; kind: string }>, empty: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', padding: 2 }}>
      {rows.length === 0 ? (
        <p style={{ ...typeRoles.small, color: t.textMuted }}>{empty}</p>
      ) : rows.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => bring({ kind: r.kind, text: r.body })}
          style={{ textAlign: 'left', background: t.cardBgInner, border: 'none', borderRadius: radius.widget, padding: '10px 12px', cursor: 'pointer', color: t.textPrimary }}
        >
          <span style={{ ...typeRoles.small, fontWeight: 600, color: t.textPrimary, display: 'block' }}>{r.title}</span>
          <span style={{ ...typeRoles.small, color: t.textMuted, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.body}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div style={{ width: '100%', maxWidth: 680, textAlign: 'left', background: t.cardBg, borderRadius: radius.card, boxShadow: t.shadow, padding: 'clamp(20px, 4vw, 28px)', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <Eyebrow style={{ marginBottom: 6, color: t.ember }}>Bring several things</Eyebrow>
          <p style={{ ...typeRoles.small, color: t.textMuted }}>
            Things you keep circling that feel separate: a draft, a lyric, a note, a photo idea. Put them side by side and see whether they share something.
          </p>
        </div>
        <GhostButton size="sm" onClick={() => { if (dictation.isRecording) dictation.stopRecording(); onBack() }}>Back</GhostButton>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: radius.widget, background: alpha(t.textPrimary, 0.03), border: `1px solid ${alpha(t.textPrimary, 0.07)}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <TextField
                  bare
                  value={item.kind}
                  onChange={(v) => setItem(i, { kind: v.slice(0, 40) })}
                  onFocus={() => { active.current = i }}
                  placeholder="What is it? A draft, a lyric, a voice memo…"
                  ariaLabel={`What thing ${i + 1} is`}
                  style={{ ...typeRoles.small, fontSize: 12, fontWeight: 600, padding: 0 }}
                />
              </div>
              {items.length > 2 && (
                <button
                  type="button"
                  aria-label={`Remove thing ${i + 1}`}
                  onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                  style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}
                >
                  ✕
                </button>
              )}
            </div>
            <TextArea
              voice
              value={item.text + (dictation.isRecording && active.current === i && dictation.interimText ? ` ${dictation.interimText}` : '')}
              onChange={(v) => { dictation.clearInterim(); setItem(i, { text: v }) }}
              onFocus={() => { active.current = i }}
              placeholder="The words themselves, or what the thing is if it isn't words."
              ariaLabel={`Thing ${i + 1}`}
              minRows={2}
              maxHeight={200}
              style={{ fontSize: 15, lineHeight: 1.6, padding: '10px 12px', borderRadius: radius.field }}
            />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {items.length < MAX_ITEMS && (
          <QuietButton onClick={() => setItems((prev) => [...prev, { kind: '', text: '' }])}>+ Another thing</QuietButton>
        )}
        {!full && <QuietButton onClick={() => setPicker(picker === 'pieces' ? null : 'pieces')}>From your writing</QuietButton>}
        {!full && captures.length > 0 && <QuietButton onClick={() => setPicker(picker === 'captures' ? null : 'captures')}>From your Capture bank</QuietButton>}
      </div>

      {picker === 'pieces' && (pieces === null
        ? <p style={{ ...typeRoles.small, color: t.textMuted }}>Opening your writing…</p>
        : pickerList(pieces.map((p) => ({ id: p.id, title: p.title, body: p.excerpt, kind: `Draft: ${p.title}`.slice(0, 40) })), 'Nothing written yet.'))}
      {picker === 'captures' && pickerList(
        captures.map((c) => ({ id: c.id, title: c.raw_input.slice(0, 80), body: c.unpacked, kind: 'Something I saved' })),
        'No captures yet.',
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <MicButton recording={dictation.isRecording} onToggle={dictation.handleRecordToggle} size={44} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <PrimaryButton onClick={go} disabled={filled.length < 2} full size="lg">
            {filled.length < 2 ? 'Bring at least two' : 'See what they share →'}
          </PrimaryButton>
        </div>
      </div>
      <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, textAlign: 'center' }}>
        If they turn out not to share anything, it will say so, and ask which one pulls hardest.
      </p>
    </div>
  )
}
