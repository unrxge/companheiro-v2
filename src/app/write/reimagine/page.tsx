'use client'

import { useState, useRef, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useDictation } from '@/lib/use-dictation'
import { readTextStream } from '@/lib/stream-client'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { PrimaryButton, GhostButton, QuietButton } from '@/components/ui/buttons'
import { Pill } from '@/components/ui/pill'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Thread, Composer, type ThreadMessage } from '@/components/conversation/thread'
import { SectionEditor } from '@/components/writing/section-editor'
import { JourneyNavNode, writeHrefForNode } from '@/components/widgets'
import { alpha, radius, shell, type as typeRoles, widths } from '@/lib/design-tokens'
import { TextArea } from '@/components/ui/field'
import { htmlToPlainText, plainTextToHtml } from '@/lib/rich-text'

interface Part {
  id: string
  title: string
  beat: string
  body: string
  is_locked: boolean
}

/** One top-level block of a part's HTML: a paragraph, heading or list. */
interface Block {
  html: string
  text: string
}

/** One thing being reimagined: a whole section, or a run of consecutive paragraphs in one. */
interface Target {
  key: string
  partId: string
  kind: 'part' | 'passage'
  label: string
  originalText: string
  before: string
  after: string
}

/** A part's body cut into the pieces being worked on (keyed) and the rest (null), so edits never shift each other. */
interface Segment {
  key: string | null
  html: string
}

interface Take {
  text: string
  streaming: boolean
}

const ENERGY_SCALE = ['hushed', 'measured', 'vivid', 'thunderous']

function energyIndexFor(word?: string): number {
  if (!word) return 1
  const idx = ENERGY_SCALE.indexOf(word.toLowerCase())
  return idx === -1 ? 1 : idx
}

function parseBlocks(html: string): Block[] {
  if (typeof window === 'undefined' || !html) return []
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) return []
  const out: Block[] = []
  root.childNodes.forEach((n) => {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element
      out.push({ html: el.outerHTML, text: htmlToPlainText(el.outerHTML) })
    } else if (n.nodeType === Node.TEXT_NODE && n.textContent?.trim()) {
      const text = n.textContent.trim()
      out.push({ html: plainTextToHtml(text), text })
    }
  })
  return out
}

const partKey = (id: string) => `part:${id}`
const paraKey = (id: string, i: number) => `para:${id}:${i}`

function partLabel(parts: Part[], part: Part): string {
  if (parts.length === 1) return 'The piece'
  return part.title.trim() || `Section ${parts.indexOf(part) + 1}`
}

function scopeWords(parts: Part[], blocks: Record<string, Block[]>, selection: Set<string>): string {
  if (selection.size === 0) return 'the whole piece'
  const bits: string[] = []
  for (const part of parts) {
    const name = parts.length === 1 ? 'the piece' : `“${partLabel(parts, part)}”`
    if (selection.has(partKey(part.id))) { bits.push(parts.length === 1 ? 'the whole piece' : `the section ${name}`); continue }
    const n = (blocks[part.id] ?? []).filter((_, i) => selection.has(paraKey(part.id, i))).length
    if (n) bits.push(`${n} paragraph${n === 1 ? '' : 's'} in ${name}`)
  }
  return bits.join(', ') || 'the whole piece'
}

/** Turns what's selected into targets, and each touched part into segments. Nothing selected means every unlocked part. */
function buildSession(parts: Part[], blocks: Record<string, Block[]>, selection: Set<string>) {
  const targets: Target[] = []
  const segments: Record<string, Segment[]> = {}
  const firstText = (bs: Block[]) => bs.find((b) => b.text)?.text ?? ''
  const lastText = (bs: Block[]) => [...bs].reverse().find((b) => b.text)?.text ?? ''

  parts.forEach((part, pi) => {
    if (part.is_locked) return
    const bs = blocks[part.id] ?? []
    const hasText = bs.some((b) => b.text)
    const whole = selection.size === 0 ? hasText : selection.has(partKey(part.id)) && hasText
    const label = partLabel(parts, part)

    if (whole) {
      const key = `p-${part.id}`
      targets.push({
        key, partId: part.id, kind: 'part', label,
        originalText: htmlToPlainText(part.body),
        before: pi > 0 ? lastText(blocks[parts[pi - 1].id] ?? []) : '',
        after: pi < parts.length - 1 ? firstText(blocks[parts[pi + 1].id] ?? []) : '',
      })
      segments[part.id] = [{ key, html: part.body }]
      return
    }

    const picked = (i: number) => selection.has(paraKey(part.id, i)) && !!bs[i].text
    if (!bs.some((_, i) => picked(i))) return

    // Paragraph numbers as the writer sees them: empty blocks don't count.
    const ordinal: number[] = []
    let count = 0
    bs.forEach((b) => { if (b.text) count++; ordinal.push(count) })

    const segs: Segment[] = []
    let run: { start: number; end: number; html: string[]; pendingEmpty: string[] } | null = null
    const closeRun = () => {
      if (!run) return
      const key = `q-${part.id}-${run.start}`
      const texts = bs.slice(run.start, run.end + 1).map((b) => b.text).filter(Boolean)
      const a = ordinal[run.start]
      const z = ordinal[run.end]
      targets.push({
        key, partId: part.id, kind: 'passage',
        label: `${label} · ¶${a}${z > a ? `–${z}` : ''}`,
        originalText: texts.join('\n\n'),
        before: lastText(bs.slice(0, run.start)),
        after: firstText(bs.slice(run.end + 1)),
      })
      segs.push({ key, html: run.html.join('') })
      for (const h of run.pendingEmpty) segs.push({ key: null, html: h })
      run = null
    }
    bs.forEach((b, i) => {
      if (picked(i)) {
        if (!run) run = { start: i, end: i, html: [], pendingEmpty: [] }
        run.html.push(...run.pendingEmpty, b.html)
        run.pendingEmpty = []
        run.end = i
      } else if (!b.text && run) {
        run.pendingEmpty.push(b.html)
      } else {
        closeRun()
        segs.push({ key: null, html: b.html })
      }
    })
    closeRun()
    segments[part.id] = segs
  })
  return { targets, segments }
}

function parseTakes(full: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /<take key="([^"]+)">([\s\S]*?)(?:<\/take>|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(full))) out[m[1]] = m[2].replace(/^\s+/, '').replace(/\s+$/, '')
  return out
}

function ReimagineContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTheme()
  const confirm = useConfirm()
  const nodeId = searchParams.get('node_id')

  const [projectId, setProjectId] = useState<string | null>(null)
  const [parts, setParts] = useState<Part[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Set<string>>(new Set())

  // ── the lens conversation ──
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [inputText, setInputText] = useState('')
  const inputTextRef = useRef('')
  inputTextRef.current = inputText
  const [talking, setTalking] = useState(false)
  const [talkError, setTalkError] = useState<string | null>(null)
  const [lens, setLens] = useState('')
  const [energyIndex, setEnergyIndex] = useState(1)

  // ── the takes ──
  const [targets, setTargets] = useState<Target[] | null>(null)
  const [segments, setSegments] = useState<Record<string, Segment[]>>({})
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments
  const [takes, setTakes] = useState<Record<string, Take[]>>({})
  const takesRef = useRef(takes)
  takesRef.current = takes
  const [active, setActive] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [running, setRunning] = useState<Set<string>>(new Set())
  const [takeError, setTakeError] = useState<Record<string, string | undefined>>({})
  const [runError, setRunError] = useState<string | null>(null)
  const [unsaved, setUnsaved] = useState<Set<string>>(new Set())
  const [savingPart, setSavingPart] = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState<string | null>(null)
  const takesSectionRef = useRef<HTMLDivElement>(null)

  const blocks = useMemo(() => {
    const out: Record<string, Block[]> = {}
    for (const p of parts ?? []) out[p.id] = parseBlocks(p.body)
    return out
  }, [parts])
  const scope = parts ? scopeWords(parts, blocks, selection) : 'the whole piece'

  const { isRecording, interimText: dictationInterim, handleRecordToggle, clearInterim } = useDictation({
    onAppend: useCallback((text: string) => {
      setInputText((prev) => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text)
    }, []),
    getContext: () => inputTextRef.current.slice(-80),
  })

  // ── loading ──
  useEffect(() => {
    if (!nodeId) {
      router.push('/project-board')
      return
    }
    fetch(`/api/write/reimagine?node_id=${nodeId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) { setLoadError(data.error); return }
        setParts(data.parts)
        setProjectId(data.project_id)
      })
      .catch(() => setLoadError('Could not load the piece.'))
    void talk([], 'the whole piece')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId])

  // ── saving your own words back into the draft ──
  // Edits stay on this page until "Save changes"; only then do they reach the draft.
  const bodyFor = (partId: string) => (segmentsRef.current[partId] ?? []).map((s) => s.html).join('')

  const saveChanges = async (partId: string) => {
    setSavingPart(partId)
    try {
      const body = bodyFor(partId)
      const res = await fetch(`/api/studio/nodes/${partId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      setParts((prev) => prev?.map((p) => (p.id === partId ? { ...p, body } : p)) ?? prev)
      setUnsaved((prev) => { const next = new Set(prev); next.delete(partId); return next })
      setJustSaved(partId)
      setTimeout(() => setJustSaved((cur) => (cur === partId ? null : cur)), 1600)
    } catch (err) {
      console.error('Failed to save:', err)
      setRunError("Your changes didn't save. Try again.")
    } finally {
      setSavingPart(null)
    }
  }

  /** Before leaving the takes: offer to save anything edited but not yet saved. */
  const settleUnsaved = async () => {
    if (unsaved.size === 0) return
    const save = await confirm({
      title: 'Save your changes to the draft?',
      body: 'You edited your own words here but haven’t saved them yet.',
      confirmLabel: 'Save changes',
      cancelLabel: 'Discard them',
    })
    if (save) await Promise.all([...unsaved].map((id) => saveChanges(id)))
    else setUnsaved(new Set())
  }

  useEffect(() => {
    if (unsaved.size === 0) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  const setSegmentHtml = (partId: string, key: string, html: string) => {
    setSegments((prev) => {
      const segs = prev[partId]
      if (!segs) return prev
      const next = { ...prev, [partId]: segs.map((s) => (s.key === key ? { ...s, html } : s)) }
      segmentsRef.current = next
      return next
    })
    setUnsaved((prev) => (prev.has(partId) ? prev : new Set([...prev, partId])))
  }

  // ── the lens conversation ──
  const talk = async (history: ThreadMessage[], scopeNow: string) => {
    setTalking(true)
    setTalkError(null)
    try {
      const res = await fetch('/api/write/reimagine/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: nodeId, messages: history, scope: scopeNow }),
      })
      if (!res.ok) { setTalkError("That didn't come through. Try again?"); return }
      setMessages([...history, { role: 'assistant', content: '' }])
      const { text, meta } = await readTextStream<{ lens?: string; energy?: string }>(
        res,
        (visible) => setMessages([...history, { role: 'assistant', content: visible }]),
        ['<lens>', '<energy>']
      )
      if (!text) { setMessages(history); setTalkError("That didn't come through. Try again?"); return }
      if (meta?.lens) {
        setLens(meta.lens)
        setEnergyIndex(energyIndexFor(meta.energy))
      }
    } catch (err) {
      console.error('Reimagine converse error:', err)
      setTalkError("That didn't come through. Try again?")
    } finally {
      setTalking(false)
    }
  }

  const send = () => {
    if (!inputText.trim() || talking) return
    const next: ThreadMessage[] = [...messages, { role: 'user', content: inputText.trim() }]
    setMessages(next)
    setInputText('')
    void talk(next, scope)
  }

  // ── choosing what to reimagine ──
  const togglePart = (part: Part) => {
    if (part.is_locked || targets) return
    setSelection((prev) => {
      const next = new Set(prev)
      const k = partKey(part.id)
      if (next.has(k)) next.delete(k)
      else {
        next.add(k)
        for (const key of [...next]) if (key.startsWith(`para:${part.id}:`)) next.delete(key)
      }
      return next
    })
  }
  const togglePara = (part: Part, i: number) => {
    if (part.is_locked || targets || selection.has(partKey(part.id))) return
    setSelection((prev) => {
      const next = new Set(prev)
      const k = paraKey(part.id, i)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  // ── generating takes ──
  const generate = async (batch: Target[]) => {
    if (!lens.trim() || batch.length === 0) return
    const keys = batch.map((b) => b.key)
    const at: Record<string, number> = {}
    for (const k of keys) at[k] = takesRef.current[k]?.length ?? 0
    const avoidFor = (k: string) => (takesRef.current[k] ?? []).map((x) => x.text).filter(Boolean)

    setRunError(null)
    setTakeError((prev) => { const next = { ...prev }; for (const k of keys) next[k] = undefined; return next })
    setTakes((prev) => {
      const next = { ...prev }
      for (const k of keys) next[k] = [...(prev[k] ?? []), { text: '', streaming: true }]
      return next
    })
    setActive((prev) => ({ ...prev, ...at }))
    setRunning((prev) => new Set([...prev, ...keys]))

    const write = (texts: Record<string, string>, done: boolean) => {
      setTakes((prev) => {
        const next = { ...prev }
        for (const k of keys) {
          const list = prev[k]
          if (!list || !list[at[k]]) continue
          next[k] = list.map((tk, i) => (i === at[k] ? { text: texts[k] ?? tk.text, streaming: !done } : tk))
        }
        return next
      })
    }

    const payload = {
      node_id: nodeId,
      lens: lens.trim(),
      energy: ENERGY_SCALE[energyIndex],
      targets: batch.map((b) => ({
        key: b.key, part_id: b.partId, kind: b.kind, text: b.originalText,
        before: b.before, after: b.after, avoid: avoidFor(b.key), note: notes[b.key] || '',
      })),
    }

    let finalTexts: Record<string, string> = {}
    try {
      const res = await fetch('/api/write/reimagine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const { text, meta } = await readTextStream<{ truncated?: boolean }>(res, (visible) => {
        finalTexts = parseTakes(visible)
        write(finalTexts, false)
      })
      finalTexts = parseTakes(text)
      if (meta?.truncated) setRunError('It ran out of room partway. Try fewer passages at once.')
    } catch (err) {
      console.error('Reimagine run error:', err)
      setRunError("The connection dropped partway. What came through is kept; try again for the rest.")
    }

    write(finalTexts, true)
    // A take that never arrived is dropped rather than left as an empty slot.
    const missing = keys.filter((k) => !finalTexts[k]?.trim())
    if (missing.length) {
      setTakes((prev) => {
        const next = { ...prev }
        for (const k of missing) next[k] = (prev[k] ?? []).filter((_, i) => i !== at[k])
        return next
      })
      setActive((prev) => {
        const next = { ...prev }
        for (const k of missing) next[k] = Math.max(0, at[k] - 1)
        return next
      })
      setTakeError((prev) => {
        const next = { ...prev }
        for (const k of missing) next[k] = "This take didn't come through. Try another."
        return next
      })
    }
    setRunning((prev) => { const next = new Set(prev); for (const k of keys) next.delete(k); return next })
    setNotes((prev) => { const next = { ...prev }; for (const k of keys) delete next[k]; return next })
  }

  const start = () => {
    if (!parts || !lens.trim()) return
    const built = buildSession(parts, blocks, selection)
    if (built.targets.length === 0) {
      setRunError('Nothing to reimagine there: the chosen parts are empty or locked.')
      return
    }
    setTargets(built.targets)
    setSegments(built.segments)
    segmentsRef.current = built.segments
    setTakes({})
    takesRef.current = {}
    setActive({})
    setUnsaved(new Set())
    void generate(built.targets)
    setTimeout(() => takesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }

  /** Back to choosing: saved edits are already in the parts; the takes are cleared. */
  const chooseAgain = async () => {
    await settleUnsaved()
    setTargets(null)
    setSegments({})
    setTakes({})
    setActive({})
    setUnsaved(new Set())
    setSelection(new Set())
  }

  const goTest = async () => {
    await settleUnsaved()
    router.push(`/write/test?node_id=${nodeId}`)
  }

  if (!nodeId) return null

  const anyRunning = running.size > 0
  const locked = (parts ?? []).filter((p) => p.is_locked).length
  const hasWriting = (parts ?? []).some((p) => (blocks[p.id] ?? []).some((b) => b.text))
  const startLabel = selection.size === 0 ? 'Reimagine the whole piece' : `Reimagine ${scope}`

  const box: React.CSSProperties = {
    borderRadius: radius.field, padding: '12px 14px', minHeight: 80,
    background: alpha(t.textPrimary, 0.035), boxShadow: `inset 0 0 0 1px ${t.divider}`,
  }

  return (
    <PageShell mood="violet" maxWidth={1080}>
      <PageHeader
        eyebrow="Write · Reimagine"
        title="Reimagine"
        subtitle="See the piece, or any part of it, through a different lens. Your draft only changes when you save your own edits."
        size="md"
        back={writeHrefForNode({ projectId, nodeId })}
      />

      <Container>
        <style>{`
          .rm-compare { display: grid; grid-template-columns: 1fr; gap: 16px; }
          @media (min-width: 820px) { .rm-compare { grid-template-columns: 1fr 1fr; } }
          .rm-para { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
          .rm-take { white-space: pre-wrap; user-select: text; }
        `}</style>

        <div style={{ marginBottom: 26 }}>
          <JourneyNavNode projectId={projectId} nodeId={nodeId} step="reimagine" beforeNavigate={settleUnsaved} />
        </div>

        {loadError ? (
          <Card><p style={{ ...typeRoles.small, color: t.danger }}>{loadError}</p></Card>
        ) : !parts ? (
          <Card><p style={{ ...typeRoles.small, color: t.textMuted }}>Loading the piece…</p></Card>
        ) : !hasWriting ? (
          <Card>
            <p style={{ ...typeRoles.ui, color: t.textSecondary, margin: 0 }}>There&rsquo;s nothing written yet to reimagine.</p>
            <div style={{ marginTop: 12 }}>
              <GhostButton size="sm" href={writeHrefForNode({ projectId, nodeId })}>Back to writing</GhostButton>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
            {/* 1 · what it touches */}
            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <Eyebrow>1 · What to reimagine</Eyebrow>
                {targets ? (
                  <GhostButton size="sm" onClick={() => void chooseAgain()} disabled={anyRunning}>Choose again (clears these takes)</GhostButton>
                ) : selection.size > 0 ? (
                  <GhostButton size="sm" onClick={() => setSelection(new Set())}>Clear, reimagine it all</GhostButton>
                ) : null}
              </div>
              {targets ? (
                <p style={{ ...typeRoles.ui, fontSize: 15, color: t.textSecondary, margin: 0 }}>
                  {scope.charAt(0).toUpperCase() + scope.slice(1)}.
                </p>
              ) : (
                <>
                  <p style={{ ...typeRoles.small, color: t.textMuted, margin: '0 0 14px' }}>
                    Leave it all unselected to reimagine the whole piece. {parts.length > 1 ? 'Tap a section’s name to take all of it, or ' : 'Or '}tap paragraphs to reimagine just those.
                    {locked > 0 && ` Locked sections stay as they are.`}
                  </p>
                  <Card padding="10px 8px">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {parts.map((part) => {
                        const bs = blocks[part.id] ?? []
                        if (!bs.some((b) => b.text)) return null
                        const whole = selection.has(partKey(part.id))
                        return (
                          <div key={part.id} style={{ opacity: part.is_locked ? 0.5 : 1 }}>
                            {parts.length > 1 && (
                              <button
                                type="button"
                                onClick={() => togglePart(part)}
                                disabled={part.is_locked}
                                aria-pressed={whole}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                                  background: 'none', border: 'none', padding: '6px 10px', cursor: part.is_locked ? 'default' : 'pointer',
                                  ...typeRoles.small, fontWeight: 600, color: whole ? t.violet : t.textSecondary,
                                }}
                              >
                                {partLabel(parts, part)}
                                {part.is_locked ? <Pill>Locked</Pill> : whole ? <Pill hue="violet">Whole section</Pill> : null}
                              </button>
                            )}
                            {bs.map((b, i) => {
                              if (!b.text) return null
                              const on = whole || selection.has(paraKey(part.id, i))
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => togglePara(part, i)}
                                  disabled={part.is_locked || whole}
                                  aria-pressed={on}
                                  style={{
                                    display: 'block', width: '100%', textAlign: 'left', border: 'none',
                                    padding: '8px 10px 8px 12px', margin: '2px 0', borderRadius: radius.field - 2,
                                    cursor: part.is_locked || whole ? 'default' : 'pointer',
                                    background: on ? alpha(t.violet, 0.12) : 'transparent',
                                    boxShadow: on ? `inset 2px 0 0 ${t.violet}` : 'none',
                                    color: on ? t.textPrimary : t.textSecondary,
                                    ...typeRoles.ui, fontSize: 14, lineHeight: 1.6,
                                    transition: 'background 140ms ease',
                                  }}
                                >
                                  <span className="rm-para">{b.text}</span>
                                </button>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                </>
              )}
            </section>

            {/* 2 · the lens */}
            <section>
              <Eyebrow style={{ marginBottom: 10, textAlign: 'center' }}>2 · The lens</Eyebrow>
              <div style={{ maxWidth: widths.conversation, margin: '0 auto' }}>
                <Thread messages={messages} streaming={talking}>
                  {talkError && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>{talkError}</p>}
                </Thread>
                <div style={{ marginTop: 14 }}>
                  <Composer
                    value={inputText + (dictationInterim ? (inputText && !inputText.endsWith(' ') ? ' ' : '') + dictationInterim : '')}
                    onChange={(v) => { clearInterim(); setInputText(v) }}
                    onSend={send}
                    disabled={talking}
                    placeholder="Say what it wants to become…"
                    recording={isRecording}
                    onToggleRecording={handleRecordToggle}
                  />
                </div>

                <Card style={{ marginTop: 18 }}>
                  <Eyebrow style={{ marginBottom: 8 }}>The lens</Eyebrow>
                  <textarea
                    value={lens}
                    onChange={(e) => setLens(e.target.value)}
                    rows={3}
                    placeholder="It appears here once the conversation finds it, or write it yourself."
                    style={{
                      width: '100%', resize: 'vertical', border: 'none', outline: 'none', background: 'transparent',
                      ...typeRoles.quote, color: t.textPrimary, padding: 0, marginBottom: 14,
                    }}
                  />
                  <Eyebrow style={{ marginBottom: 8 }}>Energy</Eyebrow>
                  <div role="radiogroup" aria-label="Energy" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                    {ENERGY_SCALE.map((label, i) => (
                      <Pill key={label} size="md" hue="violet" selected={i === energyIndex} onClick={() => setEnergyIndex(i)}>
                        {label}
                      </Pill>
                    ))}
                  </div>
                  {targets ? (
                    <QuietButton onClick={() => void generate(targets)} disabled={!lens.trim() || anyRunning} full>
                      {anyRunning ? 'Reimagining…' : 'Another take on all of them'}
                    </QuietButton>
                  ) : (
                    <PrimaryButton onClick={start} disabled={!lens.trim()} full>{startLabel}</PrimaryButton>
                  )}
                  {runError && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger, marginTop: 10 }}>{runError}</p>}
                </Card>
              </div>
            </section>

            {/* 3 · the takes */}
            {targets && (
              <section ref={takesSectionRef} style={{ scrollMarginTop: 24 }}>
                <Eyebrow style={{ marginBottom: 6 }}>3 · Takes</Eyebrow>
                <p style={{ ...typeRoles.small, color: t.textMuted, margin: '0 0 16px' }}>
                  Your own words are on the left. Borrow whatever lands from the take and work it into your draft your way, then save your changes.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {targets.map((target) => {
                    const list = takes[target.key] ?? []
                    const idx = Math.min(active[target.key] ?? 0, Math.max(0, list.length - 1))
                    const take = list[idx]
                    const seg = segments[target.partId]?.find((s) => s.key === target.key)
                    const busy = running.has(target.key)
                    const dirtyPart = unsaved.has(target.partId)
                    return (
                      <Card key={target.key}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                          <Eyebrow>{target.label}</Eyebrow>
                          {list.length > 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <GhostButton size="sm" onClick={() => setActive((a) => ({ ...a, [target.key]: idx - 1 }))} disabled={idx === 0} ariaLabel="Previous take">‹</GhostButton>
                              <span style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted }}>Take {idx + 1} of {list.length}</span>
                              <GhostButton size="sm" onClick={() => setActive((a) => ({ ...a, [target.key]: idx + 1 }))} disabled={idx >= list.length - 1} ariaLabel="Next take">›</GhostButton>
                            </div>
                          )}
                        </div>
                        <div className="rm-compare">
                          <div>
                            <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, margin: '0 0 6px' }}>Yours</p>
                            <div style={{ ...box, fontSize: 16 }}>
                              {seg && (
                                <SectionEditor
                                  content={seg.html}
                                  editable
                                  onChange={(html) => setSegmentHtml(target.partId, target.key, html)}
                                  textColor={t.textPrimary}
                                />
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                              <QuietButton size="sm" onClick={() => void saveChanges(target.partId)} disabled={!dirtyPart} loading={savingPart === target.partId} loadingLabel="Saving…">
                                Save changes
                              </QuietButton>
                              {justSaved === target.partId && !dirtyPart && <span style={{ ...typeRoles.small, fontSize: 12, color: t.verdant }}>Saved to your draft</span>}
                            </div>
                          </div>
                          <div>
                            <p style={{ ...typeRoles.small, fontSize: 12, color: t.violet, margin: '0 0 6px' }}>Reimagined</p>
                            <div style={{ ...box, background: alpha(t.violet, 0.06), boxShadow: `inset 0 0 0 1px ${alpha(t.violet, 0.25)}` }}>
                              <p className="rm-take" style={{ ...typeRoles.ui, fontSize: 16, lineHeight: 1.75, color: take?.text ? t.textPrimary : t.textMuted, margin: 0 }}>
                                {take?.text || (busy ? 'Reimagining…' : 'No take yet.')}
                              </p>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
                              <GhostButton size="sm" onClick={() => void generate([target])} disabled={busy || !lens.trim()} loading={busy} loadingLabel="Reimagining…">
                                Another take
                              </GhostButton>
                              <TextArea
                                bare
                                oneParagraph
                                maxHeight={160}
                                value={notes[target.key] ?? ''}
                                onChange={(v) => setNotes((n) => ({ ...n, [target.key]: v }))}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void generate([target]) }}
                                placeholder="Steer it, if you like: quieter, keep the first line…"
                                ariaLabel="Steer the next take"
                                style={{
                                  flex: '1 1 180px', minWidth: 0, width: 'auto',
                                  borderBottom: `1px solid ${t.divider}`, padding: '6px 2px', ...typeRoles.small,
                                }}
                              />
                            </div>
                            {takeError[target.key] && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger, marginTop: 8 }}>{takeError[target.key]}</p>}
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              </section>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 4 }}>
              <PrimaryButton onClick={() => void goTest()} disabled={anyRunning}>On to Test →</PrimaryButton>
            </div>
          </div>
        )}
      </Container>
    </PageShell>
  )
}

export default function ReimaginePage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: shell.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: shell.muted }}>Loading…</p>
        </div>
      }
    >
      <ReimagineContent />
    </Suspense>
  )
}
