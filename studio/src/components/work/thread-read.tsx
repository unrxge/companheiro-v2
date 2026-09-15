'use client'

// studio/src/components/work/thread-read.tsx — one thread, read straight
// through, with everything else stripped out.
//
// Screenwriters call it a character pass and novelists a thread read; both do
// it by hand with printouts. Scattered across a work, a thread's holes are
// invisible. Read continuously they are obvious in about ninety seconds.

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, widths } from '@/lib/design-tokens'
import { htmlToPlainText } from '@/lib/rich-text'
import type { Appearance, Thread, ThreadTag } from '@/lib/studio/node-types'
import { InlineField, Label, hueOf } from '@/components/work/bits'
import { RuleList } from '@/components/work/rules'

export function ThreadRead({
  thread,
  appearances,
  tagFor,
  onOpen,
  onUntag,
  onEditThread,
  disabled = false,
}: {
  thread: Thread
  /** Every node carrying this thread, in reading order, with its trail. */
  appearances: Appearance[]
  tagFor: (nodeId: string, threadId: string) => ThreadTag | undefined
  onOpen: (nodeId: string) => void
  onUntag?: (nodeId: string) => void
  onEditThread: (patch: Partial<Thread>) => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const colour = hueOf(t, thread.hue)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: widths.reading }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <InlineField
          ariaLabel="thread name"
          value={thread.name}
          placeholder="untitled thread"
          disabled={disabled}
          onCommit={(name) => onEditThread({ name })}
          style={{ ...canvasType.headingLg, color: colour }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Label>what this thread is for</Label>
          <InlineField
            ariaLabel="what this thread is for"
            value={thread.intent}
            placeholder="say what it has to do across the whole work…"
            multiline
            disabled={disabled}
            onCommit={(intent) => onEditThread({ intent })}
            style={{ ...canvasType.body, color: t.textSecondary }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Label>read through</Label>
        <span style={{ ...canvasType.meta, color: t.textMuted }}>
          {appearances.length} {appearances.length === 1 ? 'appearance' : 'appearances'}
        </span>
      </div>

      {appearances.length === 0 ? (
        <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>
          This thread is not in any part yet. Mark it on a piece and it will read through here.
        </p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 22 }}>
          {appearances.map(({ node, trail }) => {
            const note = tagFor(node.id, thread.id)?.note
            const text = htmlToPlainText(node.body).trim()
            return (
              <li
                key={node.id}
                style={{
                  borderLeft: `2px solid ${alpha(colour, 0.45)}`,
                  paddingLeft: 14, display: 'flex', flexDirection: 'column', gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => onOpen(node.id)}
                    style={{
                      ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none',
                      padding: 0, textAlign: 'left', cursor: 'pointer', flex: 1,
                    }}
                  >
                    {trail.join(' / ') || 'untitled'}
                  </button>
                  {!disabled && onUntag && (
                    <button
                      type="button"
                      aria-label="take this part off the thread"
                      onClick={() => onUntag(node.id)}
                      style={{
                        ...canvasType.chip, color: t.textMuted, background: 'none',
                        border: 'none', padding: 0, cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
                {note && (
                  <p
                    style={{
                      ...canvasType.small, color: colour, margin: 0,
                      background: alpha(colour, 0.08), borderRadius: radius.field, padding: '6px 10px',
                    }}
                  >
                    {note}
                  </p>
                )}
                {text ? (
                  text.split(/\n{2,}/).map((para, i) => (
                    <p key={i} style={{ ...canvasType.body, color: t.textPrimary, margin: 0 }}>{para}</p>
                  ))
                ) : (
                  <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>Nothing written here yet.</p>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <div style={{ borderTop: `1px solid ${alpha(t.textPrimary, 0.1)}`, paddingTop: 16 }}>
        <RuleList
          rules={thread.rules}
          disabled={disabled}
          onChange={(rules) => onEditThread({ rules })}
        />
      </div>
    </div>
  )
}
