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
import type { Rule, RuleCheck, Thread, TreeNode } from '@/lib/studio/node-types'
import { RuleList } from '@/components/work/rules'
import { InlineField, Label, ThreadChips } from '@/components/work/bits'

const SAVE_AFTER_MS = 900

export function Writing({
  node,
  parent,
  threads,
  inheritedRules,
  checks,
  onEdit,
  onRunCheck,
  onOpenThread,
  checking,
  disabled = false,
}: {
  node: TreeNode
  parent: TreeNode | null
  threads: Thread[]
  inheritedRules: Array<{ rule: Rule; from: string }>
  checks: RuleCheck[]
  onEdit: (patch: Partial<TreeNode>) => void
  onRunCheck: () => void
  onOpenThread: (id: string) => void
  checking: boolean
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [, bump] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<string | null>(null)

  // Autosave on a pause, never on a keystroke.
  const onChange = useCallback((html: string) => {
    pending.current = html
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (pending.current !== null) onEdit({ body: pending.current })
      pending.current = null
    }, SAVE_AFTER_MS)
  }, [onEdit])

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    if (pending.current !== null) {
      onEdit({ body: pending.current })
      pending.current = null
    }
  }, [onEdit])

  const markDrafted = () => {
    flush()
    onEdit({ status: node.status === 'drafted' ? 'open' : 'drafted' })
    if (node.status !== 'drafted') onRunCheck()
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
          onBlur={flush}
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
            <QuietButton size="sm" onClick={markDrafted}>
              {node.status === 'drafted' ? 'back to open' : 'mark drafted'}
            </QuietButton>
            <GhostButton size="sm" onClick={() => { flush(); onRunCheck() }} disabled={checking}>
              {checking ? 'reading…' : 'check against the rules'}
            </GhostButton>
            {node.status === 'drafted' && (
              <GhostButton size="sm" onClick={() => onEdit({ status: 'done' })}>done</GhostButton>
            )}
          </div>
        )}
      </div>

      {checks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Label>{checks.length === 1 ? 'one thing' : `${checks.length} things`} to answer</Label>
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
