'use client'

// studio/src/components/work/studio.tsx — the writing, and nothing else.
//
// A piece and all its parts on one surface, each part a box you write straight
// into. This is the writing module from the main app, carried over: the focused
// box takes a quiet border, one shared toolbar follows the caret, and flow view
// strips the chrome so the whole thing reads as prose. Nothing is ever placed
// in the text but what the person types: the assistant's words stay in its
// own conversation.
//
// The map used to be a separate page you switched to. On a computer it's a
// floating dock now (section-dock.tsx), bottom and centred, the toolbar's own
// mirror image — collapsed, it is just a row of marks for where the parts are;
// its arrow opens the same storyline above itself. Picking a part there
// scrolls this page to it and focuses it — it was never a door to another
// page, and now it can't pretend to be one. On a phone it is left out, and the
// bottom of the screen is the rail's tools.
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
import { ensureHtml } from '@/lib/rich-text'
import type { Thread, TreeNode } from '@/lib/studio/node-types'
import { InlineField, ThreadChips } from '@/components/studio/work/bits'

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
  /** Bubbles the live text selection up, so the companion can offer to
   *  focus its help on exactly what's highlighted. */
  onSelectionChange,
  onFocusChange,
  placeholders,
  handle,
  onHistory,
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
  onSelectionChange?: (selection: { nodeId: string; text: string } | null) => void
  /** Which part the caret is in, as it changes. */
  onFocusChange?: (partId: string) => void
  /** Guidance to show in an empty part, by part id. */
  placeholders?: Record<string, string>
  handle?: React.MutableRefObject<StudioHandle | null>
  /** Opens the piece's document history, from a button at the end of the toolbar. */
  onHistory?: () => void
  /** Leaves the part dock out while something else is using the bottom of the screen. */
  dockHidden?: boolean
  disabled?: boolean
}) {
  const { t } = useTheme()
  const parts = node.children.length > 0 ? node.children : [node]
  const sectioned = node.children.length > 0

  const [focused, setFocused] = useState<string | null>(null)
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

  const handleSelection = useCallback((partId: string, sel: SectionSelection | null) => {
    onSelectionChange?.(sel ? { nodeId: partId, text: sel.text } : null)
  }, [onSelectionChange])

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

  const flushOne = useCallback((id: string) => {
    if (timers.current[id]) { clearTimeout(timers.current[id]); delete timers.current[id] }
    const next = pending.current[id]
    if (next === undefined) return
    delete pending.current[id]
    void latestEdit.current(id, { body: next })
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, maxWidth: widths.reading, margin: '0 auto', width: '100%' }}>
      {/* Deleting a part is a small mark, which a mouse can hit. On a phone it
         is a finger's size. The toolbar there scrolls sideways without
         drawing a scrollbar across the first line of the page. */}
      <style>{`
        .part-action { padding: 2px 3px; }
        .part-toolbar { scrollbar-width: none; }
        .part-toolbar::-webkit-scrollbar { display: none; }
        @media (max-width: 719px) {
          .part-action { min-width: 36px; min-height: 36px; padding: 0 6px; display: inline-flex; align-items: center; justify-content: center; margin-right: -8px; }
          .part-toolbar-row { margin-bottom: 4px; }
        }
        /* A field is never drawn under 16px on a small screen (globals.css:
           Safari zooms into anything smaller), so the name, which is meant to
           be as small as the number beside it, is set at 16px and drawn at
           10: five eighths, from its left edge, in a box a third wider. */
        @media screen and (max-width: 768px) {
          .part-title { overflow: hidden; }
          .part-title input, .part-title textarea { width: 160% !important; transform: scale(0.625); transform-origin: left center; }
        }
      `}</style>
      {!disabled && (
        // Floating, not part of the page's own chrome: one shared pill that
        // stays in reach as the piece scrolls underneath it, the same glass
        // and the same size as the main app's own writing toolbar. Sticky
        // rather than fixed — it starts in flow, right below the header, so
        // it can never land on top of it the way a hard-coded fixed offset
        // could on a page whose header height isn't this component's to know.
        <div className="part-toolbar-row" style={{ position: 'sticky', top: 8, zIndex: 5, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div
            className="part-toolbar"
            style={{
              // Glass over the page's own card colour, not a colour of its
              // own — coal in dark mode, the same near-black as before, but
              // bone in light mode instead of that same near-black showing
              // through as a wrong, too-dark pill on a light page.
              pointerEvents: 'auto', display: 'flex', padding: '3px 6px', borderRadius: 999,
              background: alpha(t.cardBg, 0.86), backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
              border: `1px solid ${t.divider}`, boxShadow: t.shadow,
              maxWidth: 'calc(100vw - 24px)', overflowX: 'auto',
            }}
          >
            <SectionToolbar editor={focused ? editors.current[focused] ?? null : null} onHistory={onHistory} />
          </div>
        </div>
      )}

      {parts.map((part, i) => {
        const isFocused = focused === part.id
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
                  // The first name sits straight under the toolbar, as the first words do in flow view.
                  padding: `${i === 0 ? 4 : 22}px 0 6px 16px`,
                }}
              >
                {sectioned && (
                  <span style={{ ...canvasType.chip, color: t.textMuted, flexShrink: 0 }}>{i + 1}</span>
                )}
                <div className="part-title" style={{ flex: 1, minWidth: 90 }}>
                  <InlineField
                    ariaLabel="The name of this part"
                    value={part.title}
                    placeholder={sectioned ? 'Untitled part' : 'Untitled'}
                    disabled={disabled}
                    onCommit={(title) => void onEdit(part.id, { title })}
                    // The same size as the number beside it: the name is a
                    // label for the part, not a heading over the writing.
                    style={{ ...canvasType.chip, color: t.textSecondary, textTransform: 'uppercase', letterSpacing: '0.08em' }}
                  />
                </div>
                <ThreadChips threadIds={part.threads} threads={threads} onOpen={onOpenThread} size="xs" />
                {!disabled && sectioned && (
                  <HeaderAction label="Delete this part" onClick={() => onRemove(part)}>✕</HeaderAction>
                )}
              </header>
            )}

            <div style={{ padding: flow ? '0 16px' : '0 16px 10px', fontSize: 17 }}>
              <SectionEditor
                content={ensureHtml(part.body)}
                editable={!disabled}
                placeholder={placeholders?.[part.id] || (i === 0 ? 'Write…' : '')}
                onChange={(html) => change(part.id, html)}
                onFocus={() => { setFocused(part.id); onFocusChange?.(part.id) }}
                onBlur={() => flushOne(part.id)}
                onReady={(editor) => { editors.current[part.id] = editor }}
                onTransaction={() => bump((n) => n + 1)}
                onSelectionChange={(sel) => handleSelection(part.id, sel)}
                textColor={t.textPrimary}
                className={flow && i > 0 ? 'flow-continued' : undefined}
              />
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
          + Add another section
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
  label, onClick, children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  const { t } = useTheme()
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="part-action"
      style={{
        ...canvasType.chip, color: t.textMuted, background: 'none',
        border: 'none', cursor: 'pointer', flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}
