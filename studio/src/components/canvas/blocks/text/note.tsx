'use client'

// studio/src/components/canvas/blocks/text/note.tsx — the note block (6.2) and,
// because the note is the plainest text block and lane C owns no extra file, the
// in-place editing primitives every text renderer shares (D-027, D-028):
//
//   InlineTextarea  — a plain auto-growing <textarea> with data-no-drag; commits
//                     once on blur, Esc, Enter (single-line blocks) or unmount.
//   commitContent   — replaces a block's content through store.applyPatch so the
//                     row lands in `dirty` and autosave (B) flushes it.
//   endEditing      — clears store.editing for this block (and the machine's
//                     'editing' mode) after a commit.
//   nudgeSave       — interim: lane A's flusher schedules only from its own
//                     actions; a no-op zoom (zoomBy(1)) is the one public method
//                     that schedules a flush without changing anything. Lane B's
//                     autosave subscribes to store patches and makes this redundant.
//
// Rendering rule: BlockShell draws the eyebrow (NOTE · 3 SEP), hover ring,
// struck, arrival and lock chrome; renderers draw only the content.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { useStore } from '@/lib/studio/hooks'
import { createEmptyPatch, type CanvasStore } from '@/lib/studio/store'
import type { AnyBlock, BlockContentMap, BlockType } from '@/lib/studio/types'
import { useActions, type CanvasActions } from '@/components/canvas/actions'
import type { BlockOf, BlockRendererProps } from '@/components/canvas/blocks/registry'

// ── shared editing primitives ──────────────────────────────────────────────

/** Replace the block's content; returns false when nothing changed. Marks the row dirty (full row, D-030). */
export function commitContent<T extends BlockType>(store: CanvasStore, block: BlockOf<T>, content: BlockContentMap[T]): boolean {
  if (JSON.stringify(block.content) === JSON.stringify(content)) return false
  const live = store.get().blocks.get(block.id) ?? block
  const row = { ...live, content, updated_at: new Date().toISOString() } as AnyBlock
  const p = createEmptyPatch()
  p.upserts.set(block.id, row)
  store.applyPatch(p)
  return true
}

/** Leave in-place editing for `id` (blur / Esc committed already). Safe when the engine cleared it first. */
export function endEditing(store: CanvasStore, id: string): void {
  const s = store.get()
  if (s.editing !== id && s.mode !== 'editing') return
  store.set((st) => {
    if (st.editing === id) st.editing = null
    if (st.mode === 'editing' && st.editing === null) st.mode = 'idle'
  })
}

/** Ask the save pipe to flush what is dirty (see the header). No-op without actions. */
export function nudgeSave(actions: CanvasActions | null): void {
  actions?.zoomBy(1)
}

/** Commit + leave editing + schedule the save, in one call. */
export function finishEdit<T extends BlockType>(
  store: CanvasStore,
  actions: CanvasActions | null,
  block: BlockOf<T>,
  content: BlockContentMap[T]
): void {
  const changed = commitContent(store, block, content)
  endEditing(store, block.id)
  if (changed) nudgeSave(actions)
}

export interface InlineTextareaProps {
  initial: string
  /** Called exactly once, with the final text, on blur / Esc / Enter (single line) / unmount. */
  onCommit: (text: string) => void
  typeStyle: CSSProperties
  color: string
  placeholder?: string
  /** Enter commits (Shift+Enter still inserts a newline). */
  singleLine?: boolean
  ariaLabel?: string
  style?: CSSProperties
}

/**
 * The plain auto-growing textarea used for every in-place text edit (D-027).
 * It never scrolls or clips: the block grows with it (D-016). Keystrokes stop
 * here so the global keymap never sees them; Esc commits (D-027) and is not
 * passed on, so one Esc ends the edit and nothing else.
 */
export function InlineTextarea({ initial, onCommit, typeStyle, color, placeholder, singleLine = false, ariaLabel, style }: InlineTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(initial)
  const valueRef = useRef(initial)
  const onCommitRef = useRef(onCommit)
  const committed = useRef(false)
  onCommitRef.current = onCommit

  const commit = useCallback(() => {
    if (committed.current) return
    committed.current = true
    onCommitRef.current(valueRef.current)
  }, [])

  // grow to the content on every change (scrollHeight is unscaled CSS px, so it is right inside the world transform)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  // focus with the caret at the end; commit on unmount if nothing did before (the engine may leave editing first)
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.focus({ preventScroll: true })
      const end = el.value.length
      el.setSelectionRange(end, end)
    }
    return () => commit()
  }, [commit])

  return (
    <textarea
      ref={ref}
      data-no-drag
      value={value}
      rows={1}
      placeholder={placeholder}
      aria-label={ariaLabel}
      spellCheck
      onChange={(e) => {
        valueRef.current = e.target.value
        setValue(e.target.value)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          e.preventDefault()
          commit()
          return
        }
        if (singleLine && e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          commit()
        }
      }}
      style={{
        ...typeStyle,
        color,
        caretColor: color,
        display: 'block',
        width: '100%',
        boxSizing: 'border-box',
        margin: 0,
        padding: 0,
        border: 'none',
        outline: 'none',
        background: 'transparent',
        resize: 'none',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        ...style,
      }}
    />
  )
}

// ── the note ───────────────────────────────────────────────────────────────

export const NOTE_PLACEHOLDER = 'a note'

/** Read view of a note: body, whitespace kept, the first line is not a title. */
export function NoteText({ text, color, mutedColor }: { text: string; color: string; mutedColor: string }) {
  return (
    <p style={{ ...canvasType.body, color: text ? color : mutedColor, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {text || NOTE_PLACEHOLDER}
    </p>
  )
}

export function NoteBlock({ block, editing }: BlockRendererProps<'note'>) {
  const { t } = useTheme()
  const store = useStore()
  const actions = useActions()
  const text = block.content.text

  if (editing) {
    return (
      <InlineTextarea
        initial={text}
        typeStyle={canvasType.body}
        color={t.textPrimary}
        placeholder={NOTE_PLACEHOLDER}
        ariaLabel="note"
        onCommit={(v) => finishEdit(store, actions, block, { text: v.replace(/\s+$/, '') })}
      />
    )
  }
  return <NoteText text={text} color={t.textPrimary} mutedColor={t.textMuted} />
}
