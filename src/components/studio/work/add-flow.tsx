'use client'

// ── making something new on the canvas ──────────────────────────────────────
//
// The corner "+" asks what to make; this asks what is in it, and which pieces
// it belongs to. None is an answer too: a thread, a picture or a list can
// stand on its own, belonging to the whole project rather than any one piece.
//
// One plain question per kind, never a form to fill in: a name and what runs
// through a thread, the first few tasks of a list, the colours of a palette,
// the picture and its caption, a recording's name (the recorder does the rest).

import { useEffect, useRef, useState } from 'react'
import { Portal } from '@/components/ui/portal'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, fonts, radius } from '@/lib/design-tokens'
import { IMAGE_ACCEPT } from '@/lib/studio/image-intake'
import { PALETTE_SEED, cleanHex } from '@/lib/studio/board-items'
import { cleanUrl, embedFor } from '@/lib/studio/embed'
import type { PlusChoice } from '@/components/studio/work/board-items'

export type AddResult =
  | { kind: 'thread'; on: string[]; name: string; intent: string }
  | { kind: 'tasks'; on: string[]; title: string; tasks: string[] }
  | { kind: 'palette'; on: string[]; title: string; colours: string[] }
  | { kind: 'image'; on: string[]; file: File; caption: string }
  | { kind: 'recording'; on: string[]; title: string }
  | { kind: 'link'; on: string[]; url: string; title: string }

const ASK: Record<PlusChoice, { title: string; question: string }> = {
  thread: { title: 'A new thread', question: 'What keeps coming back?' },
  tasks: { title: 'A new task list', question: 'What needs doing?' },
  image: { title: 'A new image', question: 'Which picture, and what is it for?' },
  recording: { title: 'A new recording', question: 'What will you call it?' },
  palette: { title: 'A new palette', question: 'Which colours is this in?' },
  link: { title: 'A new link', question: 'Where does it point?' },
}

export function AddFlow({ kind, pieces, onCancel, onMake }: {
  kind: PlusChoice
  /** The pieces it could belong to, with each one's own colour. */
  pieces: Array<{ id: string; title: string; colour: string }>
  onCancel: () => void
  onMake: (made: AddResult) => void
}) {
  const { t } = useTheme()
  const [on, setOn] = useState<string[]>([])
  const [name, setName] = useState('')
  const [intent, setIntent] = useState('')
  const [tasks, setTasks] = useState('')
  const [colours, setColours] = useState<string[]>([PALETTE_SEED])
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const picker = useRef<HTMLInputElement | null>(null)
  // The capture bank, for a link: what was saved with an address can be put on the canvas.
  const [bank, setBank] = useState<Array<{ id: string; url: string; title: string; note: string }>>([])
  useEffect(() => {
    if (kind !== 'link') return
    let live = true
    fetch('/api/idea-lab/captures')
      .then((r) => (r.ok ? r.json() : { captures: [] }))
      .then((d: { captures?: Array<{ id: string; url?: string | null; raw_input?: string; unpacked?: string; link_context?: string | null }> }) => {
        if (!live) return
        setBank((d.captures ?? []).filter((c) => c.url && cleanUrl(c.url)).map((c) => ({
          id: c.id, url: c.url as string,
          title: (c.raw_input ?? '').replace(/\s+/g, ' ').trim().slice(0, 90),
          note: (c.link_context ?? c.unpacked ?? '').replace(/\s+/g, ' ').trim().slice(0, 90),
        })))
      })
      .catch(() => {})
    return () => { live = false }
  }, [kind])

  const ready =
    kind === 'thread' ? name.trim().length > 0
    : kind === 'tasks' ? tasks.trim().length > 0
    : kind === 'image' ? !!file
    : kind === 'link' ? !!cleanUrl(intent)
    : true

  const make = () => {
    if (!ready) return
    if (kind === 'thread') onMake({ kind, on, name: name.trim(), intent: intent.trim() })
    else if (kind === 'tasks') onMake({ kind, on, title: name.trim(), tasks: tasks.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 30) })
    else if (kind === 'palette') onMake({ kind, on, title: name.trim(), colours })
    else if (kind === 'image' && file) onMake({ kind, on, file, caption: intent.trim() })
    else if (kind === 'recording') onMake({ kind, on, title: name.trim() })
    else if (kind === 'link') { const url = cleanUrl(intent); if (url) onMake({ kind, on, url, title: name.trim() }) }
  }

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 13px', borderRadius: radius.field,
    border: `1px solid ${alpha(t.textPrimary, 0.14)}`, background: alpha(t.textPrimary, 0.04),
    color: t.textPrimary, fontFamily: fonts.ui, fontSize: 15, lineHeight: 1.45, outline: 'none',
  }
  const label: React.CSSProperties = { ...canvasType.label, color: t.textMuted, display: 'block', margin: '0 0 7px' }

  return (
    <Portal>
      {/* On a phone the keyboard takes the bottom half: the dialog stands at
         the top, and its buttons are a thumb's size. */}
      <style>{`
        @media (max-width: 719px) {
          .add-flow-backdrop { align-items: flex-start !important; padding: max(14px, env(safe-area-inset-top)) 12px 12px !important; }
          .add-flow-card { padding: 18px !important; }
          .add-flow-card .add-flow-chip { padding: 9px 14px !important; }
          .add-flow-card .add-flow-actions button { flex: 1; padding-top: 12px !important; padding-bottom: 12px !important; }
          .add-flow-card input, .add-flow-card textarea { font-size: 16px !important; }
        }
      `}</style>
      <div
        role="presentation"
        className="add-flow-backdrop"
        onClick={onCancel}
        style={{
          position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16, background: 'rgba(10,9,8,0.72)', backdropFilter: 'blur(6px)',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={ASK[kind].title}
          className="add-flow-card"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
          style={{
            width: '100%', maxWidth: 460, maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto',
            padding: 22, borderRadius: radius.card, background: t.containerBg, boxShadow: t.containerShadow,
          }}
        >
          <p style={{ ...canvasType.label, color: t.textMuted, margin: 0 }}>{ASK[kind].title}</p>
          <h2 style={{ ...canvasType.headingMd, fontSize: 21, color: t.textPrimary, margin: '6px 0 18px' }}>{ASK[kind].question}</h2>

          {kind === 'thread' && (
            <>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Its name — a motif, a promise, a colour" maxLength={80} style={field} />
              <textarea value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="What runs through it (optional)" rows={2} maxLength={400} style={{ ...field, marginTop: 10, resize: 'vertical' }} />
            </>
          )}

          {kind === 'tasks' && (
            <>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Its name (optional): Launch, Edit pass, Research" maxLength={80} style={field} />
              <textarea value={tasks} onChange={(e) => setTasks(e.target.value)} placeholder={'One task a line'} rows={5} style={{ ...field, marginTop: 10, resize: 'vertical' }} />
            </>
          )}

          {kind === 'palette' && (
            <>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Its name (optional)" maxLength={80} style={field} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {colours.map((hex, i) => (
                  <label key={i} style={{ position: 'relative', width: 44, height: 44, borderRadius: 12, background: hex, cursor: 'pointer', boxShadow: `inset 0 0 0 1px ${alpha('#000', 0.2)}` }}>
                    <input
                      type="color"
                      aria-label={`Colour ${i + 1}`}
                      value={hex}
                      onChange={(e) => setColours((cs) => cs.map((c, j) => (j === i ? cleanHex(e.target.value) ?? c : c)))}
                      style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                    />
                  </label>
                ))}
                {colours.length < 8 && (
                  <button
                    type="button"
                    aria-label="Another colour"
                    onClick={() => setColours((cs) => [...cs, cs[cs.length - 1] ?? PALETTE_SEED])}
                    style={{ width: 44, height: 44, borderRadius: 12, border: `1px dashed ${alpha(t.textPrimary, 0.3)}`, background: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 20 }}
                  >+</button>
                )}
              </div>
            </>
          )}

          {kind === 'image' && (
            <>
              <input
                ref={picker}
                type="file"
                accept={IMAGE_ACCEPT}
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  setFile(f)
                  setPreview(f ? URL.createObjectURL(f) : null)
                }}
              />
              <button
                type="button"
                onClick={() => picker.current?.click()}
                style={{
                  width: '100%', minHeight: preview ? 0 : 110, padding: preview ? 0 : 16, borderRadius: radius.field, overflow: 'hidden',
                  border: `1px dashed ${alpha(t.textPrimary, 0.28)}`, background: alpha(t.textPrimary, 0.03), color: t.textSecondary,
                  cursor: 'pointer', ...canvasType.small,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {preview ? <img src={preview} alt="" style={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'cover' }} /> : 'Choose a picture'}
              </button>
              <input value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="A caption (optional)" maxLength={200} style={{ ...field, marginTop: 10 }} />
            </>
          )}

          {kind === 'link' && (
            <>
              <input autoFocus type="url" inputMode="url" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="Paste the address: a YouTube or Vimeo video, a Spotify song, a page…" maxLength={2000} style={field} />
              {intent.trim() && (() => {
                const url = cleanUrl(intent)
                const e = url ? embedFor(url) : null
                return (
                  <p style={{ ...canvasType.small, fontSize: 12, color: t.textMuted, margin: '8px 0 0' }}>
                    {!e ? 'That doesn’t look like a web address yet.'
                      : e.kind === 'video' ? `A video from ${e.host}: it plays here, on the canvas.`
                      : e.kind === 'audio' ? `Sound from ${e.host}: it plays here, on the canvas.`
                      : e.kind === 'image' ? 'A picture: it opens here, on the canvas.'
                      : `A page on ${e.host}: it opens in a new tab.`}
                  </p>
                )
              })()}
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Its name (optional)" maxLength={120} style={{ ...field, marginTop: 10 }} />
              {bank.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <span style={label}>From your capture bank</span>
                  <div
                    style={{
                      display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -4px', padding: '2px 4px 6px', scrollSnapType: 'x proximity',
                      scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
                    }}
                  >
                    {bank.map((c) => {
                      const on = intent === c.url
                      let host = ''
                      try { host = new URL(c.url).hostname.replace(/^www\./, '') } catch { /* shown without */ }
                      return (
                        <button
                          key={c.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => { setIntent(c.url); if (!name.trim() && c.title) setName(c.title) }}
                          style={{
                            flex: '0 0 auto', width: 168, height: 72, boxSizing: 'border-box', padding: '9px 12px', textAlign: 'left', cursor: 'pointer', scrollSnapAlign: 'start',
                            borderRadius: radius.field, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 4,
                            border: `1px solid ${on ? t.textPrimary : alpha(t.textPrimary, 0.14)}`, background: on ? alpha(t.textPrimary, 0.1) : alpha(t.textPrimary, 0.04), color: t.textPrimary,
                          }}
                        >
                          <span style={{ ...canvasType.small, fontSize: 12.5, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {c.title || c.note || host}
                          </span>
                          <span style={{ ...canvasType.chip, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {kind === 'recording' && (
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Its name (optional) — you record it next" maxLength={90} style={field} />
          )}

          {pieces.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <span style={label}>Belongs to</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {pieces.map((p) => {
                  const chosen = on.includes(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="add-flow-chip"
                      aria-pressed={chosen}
                      onClick={() => setOn((cur) => (chosen ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}
                      style={{
                        ...canvasType.small, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                        border: `1px solid ${chosen ? p.colour : alpha(t.textPrimary, 0.16)}`,
                        background: chosen ? alpha(p.colour, 0.16) : 'transparent', color: chosen ? t.textPrimary : t.textSecondary,
                        maxWidth: '100%',
                      }}
                    >
                      <i aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: p.colour, flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || 'Untitled'}</span>
                    </button>
                  )
                })}
              </div>
              <p style={{ ...canvasType.small, fontSize: 12, color: t.textMuted, margin: '8px 0 0' }}>
                {on.length === 0 ? 'None chosen: it stands on its own, for the whole project.' : `On ${on.length === 1 ? 'one piece' : `${on.length} pieces`}.`}
              </p>
            </div>
          )}

          <div className="add-flow-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
            <button type="button" onClick={onCancel} style={{ ...canvasType.small, fontSize: 13, padding: '9px 14px', borderRadius: radius.field, cursor: 'pointer', border: `1px solid ${alpha(t.textPrimary, 0.16)}`, background: 'transparent', color: t.textSecondary }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={make}
              disabled={!ready}
              style={{
                ...canvasType.small, fontSize: 13, padding: '9px 16px', borderRadius: radius.field, border: 'none',
                cursor: ready ? 'pointer' : 'default', background: ready ? t.inverseBg : alpha(t.textPrimary, 0.12), color: ready ? t.inverseText : t.textMuted,
              }}
            >
              {kind === 'recording' ? 'Next: record' : 'Add it'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
