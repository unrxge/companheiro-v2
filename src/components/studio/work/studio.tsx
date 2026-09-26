'use client'

// studio/src/components/work/studio.tsx — the writing, and nothing else.
//
// A piece and all its parts on one surface, each part a box you write straight
// into. This is the writing module from the main app, carried over: the focused
// box takes a quiet border, one shared toolbar follows the caret, a part can be
// locked, and flow view strips the chrome so the whole thing reads as prose.
//
// The map used to be a separate page you switched to. It's a floating dock
// now (section-dock.tsx), bottom and centred, the toolbar's own mirror image
// — collapsed, it is just a row of marks for where the parts are; its arrow
// opens the same storyline above itself. Picking a part there scrolls this
// page to it and focuses it — it was never a door to another page, and now
// it can't pretend to be one.
//
// Everything about the vision — what it is for, the rules, the threads, the
// companion — lives on the rail, because this column belongs to the work.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useTheme } from '@/components/theme/theme-provider'
import { SectionEditor, SectionToolbar, type SectionSelection } from '@/components/writing/section-editor'
import { SectionDock } from '@/components/studio/work/section-dock'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, widths } from '@/lib/design-tokens'
import { ensureHtml, plainTextToHtml } from '@/lib/rich-text'
import type { Thread, TreeNode } from '@/lib/studio/node-types'
import type { ProposedEdit } from '@/components/studio/work/companion'
import { InlineField, ThreadChips } from '@/components/studio/work/bits'
import { PartLines, type AnchorLine } from '@/components/studio/work/write-tools'
import { GhostButton, QuietButton } from '@/components/ui/buttons'

const SAVE_AFTER_MS = 900

/** What a caller can ask of the writing surface from outside it. */
export interface StudioHandle {
  /** Saves whatever is still waiting, for a caller about to leave or to act on the saved text. */
  flush: () => Promise<void>
  /** Brings a part into view without moving the caret. */
  reveal: (partId: string) => void
}

export function Studio({
  /** The piece. Its children are the parts; a piece with none writes as one. */
  node,
  threads,
  flow,
  onEdit,
  onAdd,
  onRemove,
  onReorder,
  onEditBeat,
  onOpenThread,
  onFinished,
  /** Bubbles the live text selection up, so the companion can offer to
   *  focus a suggestion on exactly what's highlighted. */
  onSelectionChange,
  /** A proposal the companion produced, handed back down to be materialised
   *  as a pending edit. Cleared by calling onProposalHandled once consumed. */
  proposal,
  onProposalHandled,
  lines = [],
  onAddLine,
  onRemoveLine,
  onFocusChange,
  placeholders,
  handle,
  dockHidden = false,
  disabled = false,
}: {
  node: TreeNode
  threads: Thread[]
  flow: boolean
  onEdit: (nodeId: string, patch: Partial<TreeNode>) => void | Promise<void>
  onAdd: (afterId: string | null) => void
  onRemove: (part: TreeNode) => void
  /** For the section dock's own storyline — reordering and the beat track. */
  onReorder: (ids: string[]) => void
  onEditBeat: (id: string, beat: string) => void
  onOpenThread: (id: string) => void
  /** Called when the whole piece is marked done — the way back out. */
  onFinished?: () => void
  onSelectionChange?: (selection: { nodeId: string; text: string } | null) => void
  proposal?: ProposedEdit | null
  onProposalHandled?: () => void
  /** Anchor lines, by the part they were placed in. */
  lines?: AnchorLine[]
  onAddLine?: (text: string, partId: string) => void
  onRemoveLine?: (id: string) => void
  /** Which part the caret is in, as it changes. */
  onFocusChange?: (partId: string) => void
  /** Guidance to show in an empty part, by part id. */
  placeholders?: Record<string, string>
  handle?: React.MutableRefObject<StudioHandle | null>
  /** Leaves the part dock out while something else is using the bottom of the screen. */
  dockHidden?: boolean
  disabled?: boolean
}) {
  const { t } = useTheme()
  const parts = node.children.length > 0 ? node.children : [node]
  const sectioned = node.children.length > 0

  const [focused, setFocused] = useState<string | null>(null)
  const [openLines, setOpenLines] = useState<string | null>(null)
  const [, bump] = useState(0)
  const editors = useRef<Record<string, Editor | null>>({})
  const articles = useRef<Record<string, HTMLElement | null>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pending = useRef<Record<string, string>>({})
  const latestEdit = useRef(onEdit)
  latestEdit.current = onEdit

  /** What the section dock is for: brought into view and given the caret,
   *  never navigated to — this page is the only one this piece has. */
  const jumpToPart = useCallback((partId: string) => {
    articles.current[partId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // After the scroll has had a moment to get there — focusing immediately
    // can yank the viewport again mid-glide, fighting the smooth scroll.
    window.setTimeout(() => { editors.current[partId]?.commands.focus() }, 350)
  }, [])

  // The live selection, kept by exact range (not just text) so a proposal
  // that comes back for it can be spliced into precisely the right spot —
  // and re-checked against the anchor text before it lands, in case the
  // passage changed underneath it while the companion was thinking.
  const selection = useRef<(SectionSelection & { partId: string }) | null>(null)
  const [pendingWhole, setPendingWhole] = useState<{ partId: string; content: string } | null>(null)
  const [pendingInline, setPendingInline] = useState<{ partId: string; range: { from: number; to: number }; originalText: string } | null>(null)

  const handleSelection = useCallback((partId: string, sel: SectionSelection | null) => {
    selection.current = sel ? { ...sel, partId } : null
    onSelectionChange?.(sel ? { nodeId: partId, text: sel.text } : null)
  }, [onSelectionChange])

  // Materialises a proposal the moment it arrives: an anchored one is spliced
  // directly into the document, wrapped in a highlight mark; a whole-part
  // rewrite has nowhere in the text to anchor to, so it shows as a preview
  // card instead. Either way nothing is persisted until Approve runs.
  useEffect(() => {
    if (!proposal) return
    // A locked part is never touched, whoever is asking.
    if (parts.find((p) => p.id === proposal.node_id)?.is_locked) { onProposalHandled?.(); return }
    const editor = editors.current[proposal.node_id]
    if (editor && proposal.anchor_text && selection.current?.partId === proposal.node_id) {
      const { from, to } = selection.current
      const currentText = editor.state.doc.textBetween(from, to, '\n\n').trim()
      if (currentText === proposal.anchor_text.trim()) {
        editor.chain().focus().insertContentAt({ from, to }, { type: 'text', text: proposal.content, marks: [{ type: 'pendingEdit' }] }).run()
        setPendingInline({ partId: proposal.node_id, range: { from, to: from + proposal.content.length }, originalText: currentText })
        bump((n) => n + 1)
      } else {
        // The highlighted passage changed since the request was sent —
        // refuse to guess where a fragment-only edit belongs.
        console.error('Highlighted passage changed since the request was sent; declining to show the proposal inline')
      }
    } else if (editor) {
      setPendingWhole({ partId: proposal.node_id, content: proposal.content })
    }
    onProposalHandled?.()
    // Only the proposal identity should re-trigger this — re-running it on
    // every selection/editor churn would re-materialise a stale proposal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal])

  const persist = useCallback((id: string, html: string) => {
    void latestEdit.current(id, { body: html })
  }, [])

  const approveInline = useCallback(() => {
    if (!pendingInline) return
    const { partId, range } = pendingInline
    const editor = editors.current[partId]
    if (!editor) return
    editor.chain().focus().setTextSelection(range).unsetMark('pendingEdit').run()
    const html = editor.getHTML()
    setPendingInline(null)
    persist(partId, html)
  }, [pendingInline, persist])

  const rejectInline = useCallback(() => {
    if (!pendingInline) return
    const { partId, range, originalText } = pendingInline
    const editor = editors.current[partId]
    if (!editor) return
    // A plain-text insertion bordering a marked span inherits that mark by
    // default (ProseMirror's stored-marks behaviour) — explicitly clearing
    // it on the restored range is what actually removes the highlight.
    const restoredEnd = range.from + originalText.length
    editor.chain().focus().insertContentAt(range, originalText).setTextSelection({ from: range.from, to: restoredEnd }).unsetMark('pendingEdit').run()
    const html = editor.getHTML()
    setPendingInline(null)
    persist(partId, html)
  }, [pendingInline, persist])

  const approveWhole = useCallback(() => {
    if (!pendingWhole) return
    const { partId, content } = pendingWhole
    const editor = editors.current[partId]
    if (!editor) return
    editor.chain().focus().setContent(plainTextToHtml(content), false).run()
    const html = editor.getHTML()
    setPendingWhole(null)
    persist(partId, html)
  }, [pendingWhole, persist])

  const flushAll = useCallback(() => {
    for (const [id, html] of Object.entries(pending.current)) {
      void latestEdit.current(id, { body: html })
    }
    pending.current = {}
    for (const timer of Object.values(timers.current)) clearTimeout(timer)
    timers.current = {}
  }, [])

  const flushNow = useCallback(async () => {
    const jobs = Object.entries(pending.current).map(([id, html]) => Promise.resolve(latestEdit.current(id, { body: html })))
    pending.current = {}
    for (const timer of Object.values(timers.current)) clearTimeout(timer)
    timers.current = {}
    await Promise.all(jobs)
  }, [])
  useEffect(() => {
    if (!handle) return
    handle.current = {
      flush: flushNow,
      reveal: (partId) => { articles.current[partId]?.scrollIntoView({ behavior: 'smooth', block: 'center' }) },
    }
    return () => { handle.current = null }
  }, [handle, flushNow])

  // Nothing typed is ever left behind when the page goes away.
  useEffect(() => () => { flushAll() }, [flushAll])
  useEffect(() => {
    const onHide = () => flushAll()
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [flushAll])

  const change = useCallback((id: string, html: string) => {
    pending.current[id] = html
    if (timers.current[id]) clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(() => {
      const next = pending.current[id]
      delete pending.current[id]
      delete timers.current[id]
      if (next !== undefined) void latestEdit.current(id, { body: next })
    }, SAVE_AFTER_MS)
  }, [])

  /** Marking done is reversible and never locks anything. Finishing the whole
   *  piece is also the way out of it: everything typed lands first, then the
   *  mark, then the climb back to the board. */
  const finish = useCallback(async (part: TreeNode) => {
    const reopening = part.status === 'done'
    if (timers.current[part.id]) { clearTimeout(timers.current[part.id]); delete timers.current[part.id] }
    const typed = pending.current[part.id]
    if (typed !== undefined) {
      delete pending.current[part.id]
      await latestEdit.current(part.id, { body: typed })
    }
    await latestEdit.current(part.id, { status: reopening ? 'open' : 'done' })
    if (!reopening && !sectioned && onFinished) onFinished()
  }, [onFinished, sectioned])

  const flushOne = useCallback((id: string) => {
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] }
    const next = pending.current[id]
    if (next === undefined) return
    delete pending.current[id]
    void latestEdit.current(id, { body: next })
  }, [])

  /** Locking seals a part: nothing edits it, the companion's suggestions included, until it is opened again. */
  const toggleLock = (part: TreeNode) => {
    flushOne(part.id)
    if (pendingWhole?.partId === part.id) setPendingWhole(null)
    if (pendingInline?.partId === part.id) setPendingInline(null)
    void onEdit(part.id, { is_locked: !part.is_locked })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxWidth: widths.reading, margin: '0 auto', width: '100%' }}>
      {!disabled && (
        // Floating, not part of the page's own chrome: one shared pill that
        // stays in reach as the piece scrolls underneath it, the same glass
        // and the same size as the main app's own writing toolbar. Sticky
        // rather than fixed — it starts in flow, right below the header, so
        // it can never land on top of it the way a hard-coded fixed offset
        // could on a page whose header height isn't this component's to know.
        <div style={{ position: 'sticky', top: 12, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div
            style={{
              // Glass over the page's own card colour, not a colour of its
              // own — coal in dark mode, the same near-black as before, but
              // bone in light mode instead of that same near-black showing
              // through as a wrong, too-dark pill on a light page.
              pointerEvents: 'auto', display: 'flex', padding: '6px 10px', borderRadius: 999,
              background: alpha(t.cardBg, 0.86), backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
              border: `1px solid ${t.divider}`, boxShadow: t.shadow,
              maxWidth: 'calc(100vw - 24px)', overflowX: 'auto',
            }}
          >
            <SectionToolbar editor={focused ? editors.current[focused] ?? null : null} />
          </div>
        </div>
      )}

      {parts.map((part, i) => {
        const isFocused = focused === part.id
        const partLines = lines.filter((l) => l.section_id === part.id)
        return (
          <article
            key={part.id}
            ref={(el) => { articles.current[part.id] = el }}
            style={{
              borderLeft: `2px solid ${isFocused ? alpha(t.verdant, 0.55) : 'transparent'}`,
              transition: 'border-color 140ms ease',
            }}
          >
            {!flow && (
              <header
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  padding: '22px 0 6px 16px',
                }}
              >
                {sectioned && (
                  <span style={{ ...canvasType.chip, color: t.textMuted, flexShrink: 0 }}>{i + 1}</span>
                )}
                <div style={{ flex: 1, minWidth: 90 }}>
                  <InlineField
                    ariaLabel="The name of this part"
                    value={part.title}
                    placeholder={sectioned ? 'Untitled part' : 'Untitled'}
                    disabled={disabled}
                    onCommit={(title) => void onEdit(part.id, { title })}
                    style={{ ...canvasType.label, color: t.textSecondary, letterSpacing: '0.08em' }}
                  />
                </div>
                {part.beat && (
                  <span style={{ ...canvasType.small, color: t.textMuted, fontStyle: 'italic', flexShrink: 0 }}>
                    {part.beat}
                  </span>
                )}
                <ThreadChips threadIds={part.threads} threads={threads} onOpen={onOpenThread} size="xs" />
                <span style={{ ...canvasType.chip, color: t.textMuted, flexShrink: 0 }}>{part.extent}w</span>
                {!disabled && (
                  <>
                    {sectioned && onAddLine && (
                      <HeaderAction
                        label="The lines placed in this part"
                        tone={openLines === part.id ? t.textPrimary : t.textMuted}
                        onClick={() => setOpenLines(openLines === part.id ? null : part.id)}
                      >
                        Lines{partLines.length > 0 ? ` (${partLines.length})` : ''}
                      </HeaderAction>
                    )}
                    {sectioned && (
                      <HeaderAction
                        label={part.is_locked ? 'Unlock this part' : 'Lock this part: nothing edits it while it is'}
                        tone={part.is_locked ? t.verdant : t.textMuted}
                        onClick={() => toggleLock(part)}
                      >
                        {part.is_locked ? 'Locked' : 'Lock'}
                      </HeaderAction>
                    )}
                    <HeaderAction
                      label={
                        part.status === 'done'
                          ? 'This is done — reopen it'
                          : sectioned ? 'Mark this part done' : 'Mark it done and go back out'
                      }
                      tone={part.status === 'done' ? t.verdant : t.textMuted}
                      onClick={() => void finish(part)}
                    >
                      {part.status === 'done' ? 'Done' : 'Mark done'}
                    </HeaderAction>
                    {sectioned && (
                      <HeaderAction label="Delete this part" onClick={() => onRemove(part)}>✕</HeaderAction>
                    )}
                  </>
                )}
              </header>
            )}

            {!flow && sectioned && openLines === part.id && onAddLine && onRemoveLine && (
              <PartLines lines={partLines} onAdd={(text) => onAddLine(text, part.id)} onRemove={onRemoveLine} />
            )}

            <div style={{ padding: flow ? '0 16px' : '0 16px 10px', fontSize: 17 }}>
              <SectionEditor
                content={ensureHtml(part.body)}
                editable={!disabled && !part.is_locked}
                placeholder={placeholders?.[part.id] || (i === 0 ? 'Write…' : '')}
                onChange={(html) => change(part.id, html)}
                onFocus={() => { setFocused(part.id); onFocusChange?.(part.id) }}
                onBlur={() => flushOne(part.id)}
                onReady={(editor) => { editors.current[part.id] = editor }}
                onTransaction={() => bump((n) => n + 1)}
                onSelectionChange={(sel) => handleSelection(part.id, sel)}
                textColor={part.is_locked ? t.textSecondary : t.textPrimary}
                className={flow && i > 0 ? 'flow-continued' : undefined}
              />
              {pendingInline?.partId === part.id && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                  <span style={{ ...canvasType.chip, color: t.tide }}>A suggested rewrite is highlighted above</span>
                  <QuietButton size="sm" onClick={approveInline}>Approve</QuietButton>
                  <GhostButton size="sm" onClick={rejectInline}>Reject</GhostButton>
                </div>
              )}
              {pendingWhole?.partId === part.id && (
                <div
                  style={{
                    marginTop: 10, padding: 14, borderRadius: radius.widget,
                    background: alpha(t.tide, 0.07), border: `1px solid ${alpha(t.tide, 0.3)}`,
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}
                >
                  <span style={{ ...canvasType.chip, color: t.tide }}>A suggested rewrite of this whole part</span>
                  <p style={{ ...canvasType.body, color: t.textSecondary, margin: 0, whiteSpace: 'pre-wrap' }}>{pendingWhole.content}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <QuietButton size="sm" onClick={approveWhole}>Approve</QuietButton>
                    <GhostButton size="sm" onClick={() => setPendingWhole(null)}>Reject</GhostButton>
                  </div>
                </div>
              )}
            </div>
          </article>
        )
      })}

      {!disabled && !flow && (
        <button
          type="button"
          onClick={() => onAdd(parts.length ? parts[parts.length - 1].id : null)}
          style={{
            ...canvasType.small, color: t.textMuted, cursor: 'pointer',
            background: 'transparent', border: `1px dashed ${alpha(t.textPrimary, 0.2)}`,
            borderRadius: radius.widget, padding: '12px 14px', textAlign: 'left',
          }}
        >
          {sectioned ? '+ Another part' : '+ Break this into parts'}
        </button>
      )}

      {sectioned && !dockHidden && (
        <SectionDock
          parts={parts}
          threads={threads}
          focusedId={focused}
          onSelect={jumpToPart}
          onReorder={onReorder}
          onEditBeat={onEditBeat}
          onOpenThread={onOpenThread}
          onRemove={onRemove}
          disabled={disabled}
        />
      )}
    </div>
  )
}

function HeaderAction({
  label, onClick, children, tone,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  tone?: string
}) {
  const { t } = useTheme()
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        ...canvasType.chip, color: tone ?? t.textMuted, background: 'none',
        border: 'none', cursor: 'pointer', padding: '2px 3px', flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}
