'use client'

// studio/src/components/work/studio.tsx — the writing, and nothing else.
//
// A piece and all its parts on one surface, each part a box you write straight
// into. This is the writing module from the main app, carried over: the focused
// box takes a quiet border, one shared toolbar follows the caret, a part can be
// locked, and flow view strips the chrome so the whole thing reads as prose.
//
// Everything about the vision — what it is for, the rules, the threads, the
// companion — lives on the rail, because this column belongs to the work.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useTheme } from '@/components/theme/theme-provider'
import { SectionEditor, SectionToolbar, type SectionSelection } from '@/components/writing/section-editor'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, widths } from '@/lib/design-tokens'
import { plainTextToHtml } from '@/lib/rich-text'
import type { Thread, TreeNode } from '@/lib/studio/node-types'
import type { ProposedEdit } from '@/components/work/companion'
import { InlineField, ThreadChips } from '@/components/work/bits'
import { GhostButton, QuietButton } from '@/components/ui/buttons'

const SAVE_AFTER_MS = 900

export function Studio({
  /** The piece. Its children are the parts; a piece with none writes as one. */
  node,
  threads,
  flow,
  onEdit,
  onAdd,
  onRemove,
  onOpenPart,
  onOpenThread,
  onFinished,
  /** Bubbles the live text selection up, so the companion can offer to
   *  focus a suggestion on exactly what's highlighted. */
  onSelectionChange,
  /** A proposal the companion produced, handed back down to be materialised
   *  as a pending edit. Cleared by calling onProposalHandled once consumed. */
  proposal,
  onProposalHandled,
  disabled = false,
}: {
  node: TreeNode
  threads: Thread[]
  flow: boolean
  onEdit: (nodeId: string, patch: Partial<TreeNode>) => void | Promise<void>
  onAdd: (afterId: string | null) => void
  onRemove: (part: TreeNode) => void
  onOpenPart: (id: string) => void
  onOpenThread: (id: string) => void
  /** Called when the whole piece is marked done — the way back out. */
  onFinished?: () => void
  onSelectionChange?: (selection: { nodeId: string; text: string } | null) => void
  proposal?: ProposedEdit | null
  onProposalHandled?: () => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const parts = node.children.length > 0 ? node.children : [node]
  const sectioned = node.children.length > 0

  const [focused, setFocused] = useState<string | null>(null)
  const [, bump] = useState(0)
  const editors = useRef<Record<string, Editor | null>>({})
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pending = useRef<Record<string, string>>({})
  const latestEdit = useRef(onEdit)
  latestEdit.current = onEdit

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: flow ? 0 : 14, maxWidth: widths.reading, margin: '0 auto', width: '100%' }}>
      {!disabled && (
        <div style={{ position: 'sticky', top: 0, zIndex: 5, background: t.containerBg, paddingBottom: 8 }}>
          <SectionToolbar editor={focused ? editors.current[focused] ?? null : null} />
        </div>
      )}

      {parts.map((part, i) => {
        const isFocused = focused === part.id
        return (
          <article
            key={part.id}
            style={
              flow
                ? { padding: '0 0 6px' }
                : {
                    background: t.cardBg,
                    border: `1px solid ${isFocused ? alpha(t.verdant, 0.55) : alpha(t.textPrimary, 0.1)}`,
                    borderRadius: radius.widget,
                    overflow: 'hidden',
                    transition: 'border-color 140ms ease',
                  }
            }
          >
            {!flow && (
              <header
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  padding: '9px 14px',
                  borderBottom: `1px solid ${alpha(t.textPrimary, 0.08)}`,
                  background: t.cardBgInner,
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
                      <HeaderAction label="Open this part on its own" onClick={() => onOpenPart(part.id)}>
                        Open
                      </HeaderAction>
                    )}
                    {sectioned && (
                      <HeaderAction label="Delete this part" onClick={() => onRemove(part)}>✕</HeaderAction>
                    )}
                  </>
                )}
              </header>
            )}

            <div style={{ padding: flow ? 0 : '10px 16px 14px', fontSize: 17 }}>
              <SectionEditor
                content={part.body}
                editable={!disabled}
                placeholder={i === 0 ? 'Write…' : ''}
                onChange={(html) => change(part.id, html)}
                onFocus={() => setFocused(part.id)}
                onBlur={() => flushOne(part.id)}
                onReady={(editor) => { editors.current[part.id] = editor }}
                onTransaction={() => bump((n) => n + 1)}
                onSelectionChange={(sel) => handleSelection(part.id, sel)}
                textColor={t.textPrimary}
                className={flow ? 'flow-section' : undefined}
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
