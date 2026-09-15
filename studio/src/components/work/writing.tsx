'use client'

// studio/src/components/work/writing.tsx — the innermost altitude: one part,
// and the words in it.
//
// The line at the top is what this part owes the thing containing it. It is
// there because a node here is an intention, not a folder: the whole benefit
// of nesting evaporates the moment a part forgets what it was for.
//
// Nothing checks anything while the writing is happening. The check is a
// button, and it also fires when the part is marked drafted — a boundary, not
// a keystroke.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { SectionEditor, SectionToolbar } from '@/components/writing/section-editor'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, widths } from '@/lib/design-tokens'
import type { Rule, Thread, TreeNode } from '@/lib/studio/node-types'
import { RuleList } from '@/components/work/rules'
import { InlineField, Label, ThreadChips } from '@/components/work/bits'

const SAVE_AFTER_MS = 900

export function Writing({
  node,
  parent,
  threads,
  inheritedRules,
  onEdit,
  onRunCheck,
  onOpenThread,
  onFinished,
  onRemove,
  checking,
  disabled = false,
}: {
  node: TreeNode
  parent: TreeNode | null
  threads: Thread[]
  inheritedRules: Array<{ rule: Rule; from: string }>
  onEdit: (patch: Partial<TreeNode>) => void | Promise<void>
  onRunCheck: () => void
  onOpenThread: (id: string) => void
  /** Called when the part is finished — climbs back out to what it belongs to. */
  onFinished?: () => void
  onRemove?: () => void
  checking: boolean
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [, bump] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<string | null>(null)
  // The cleanup below runs once, so it must not close over a stale onEdit.
  const latestEdit = useRef(onEdit)
  latestEdit.current = onEdit

  // Autosave on a pause, never on a keystroke.
  const onChange = useCallback((html: string) => {
    pending.current = html
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (pending.current !== null) onEdit({ body: pending.current })
      pending.current = null
    }, SAVE_AFTER_MS)
  }, [onEdit])

  // Save whatever is still pending when the part is left. Without this,
  // navigating within the autosave window silently lost the last edit.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    if (pending.current !== null) {
      void latestEdit.current({ body: pending.current })
      pending.current = null
    }
  }, [])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    if (pending.current === null) return
    const html = pending.current
    pending.current = null
    await onEdit({ body: html })
  }, [onEdit])

  // The check reads the saved copy, so the save has to land first.
  const markDrafted = async () => {
    await flush()
    const wasDrafted = node.status === 'drafted'
    await onEdit({ status: wasDrafted ? 'open' : 'drafted' })
    if (!wasDrafted) onRunCheck()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: widths.reading }}>
      {/* what this part is, and what it owes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <InlineField
          ariaLabel="the title of this part"
          value={node.title}
          placeholder="untitled part"
          disabled={disabled}
          onCommit={(title) => onEdit({ title })}
          style={{ ...canvasType.headingLg, color: t.textPrimary }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Label>what this part is for</Label>
          <InlineField
            ariaLabel="what this part is for"
            value={node.intent}
            placeholder="say what it has to do…"
            multiline
            disabled={disabled}
            onCommit={(intent) => onEdit({ intent })}
            style={{ ...canvasType.body, color: t.textSecondary }}
          />
        </div>

        {parent && (parent.intent || parent.title) && (
          <div
            style={{
              borderLeft: `2px solid ${alpha(t.violet, 0.5)}`,
              paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 3,
            }}
          >
            <Label style={{ color: alpha(t.violet, 0.9) }}>
              it owes {parent.title || 'the part above'}
            </Label>
            {parent.intent && (
              <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>{parent.intent}</p>
            )}
            {node.beat && (
              <p style={{ ...canvasType.small, color: t.textPrimary, margin: 0 }}>
                here: {node.beat}
              </p>
            )}
          </div>
        )}

        <ThreadChips threadIds={node.threads} threads={threads} onOpen={onOpenThread} />
      </div>

      {/* the words */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Label>the words</Label>
          <span style={{ ...canvasType.meta, color: t.textMuted }}>{node.extent} words</span>
        </div>
        {!disabled && <SectionToolbar editor={editor} />}
        <div
          onBlur={() => void flush()}
          style={{
            background: t.cardBg, borderRadius: radius.widget,
            border: `1px solid ${alpha(t.textPrimary, 0.1)}`,
            padding: 16, minHeight: 260,
          }}
        >
          <SectionEditor
            content={node.body}
            onChange={onChange}
            editable={!disabled}
            placeholder="write…"
            onReady={setEditor}
            onTransaction={() => bump((n) => n + 1)}
            textColor={t.textPrimary}
          />
        </div>
        {!disabled && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <QuietButton size="sm" onClick={() => void markDrafted()}>
              {node.status === 'drafted' ? 'back to open' : 'mark drafted'}
            </QuietButton>
            <GhostButton size="sm" onClick={() => void flush().then(onRunCheck)} disabled={checking}>
              {checking ? 'reading…' : 'check against the rules'}
            </GhostButton>
            {node.status === 'drafted' && (
              <GhostButton
                size="sm"
                onClick={() => void flush().then(() => onEdit({ status: 'done' })).then(() => onFinished?.())}
              >
                done
              </GhostButton>
            )}
          </div>
        )}
      </div>

      {!disabled && onRemove && (
        <div style={{ display: 'flex' }}>
          <button
            type="button"
            onClick={onRemove}
            style={{
              ...canvasType.chip, color: t.textMuted, background: 'none',
              border: 'none', padding: 0, cursor: 'pointer',
            }}
          >
            delete this part
          </button>
        </div>
      )}

      {/* its own rules */}
      <div
        style={{
          borderTop: `1px solid ${alpha(t.textPrimary, 0.1)}`,
          paddingTop: 16,
        }}
      >
        <RuleList
          rules={node.rules}
          inherited={inheritedRules}
          disabled={disabled}
          onChange={(rules) => onEdit({ rules })}
        />
      </div>
    </div>
  )
}
