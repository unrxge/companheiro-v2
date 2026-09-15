'use client'

// studio/src/components/work/bits.tsx — the small shared pieces every altitude
// uses: the trail you climbed down, an inline field that saves on blur, the
// chips that mark a part's threads, and the "what this owes" line.

import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, type Hue } from '@/lib/design-tokens'
import type { Thread, TreeNode } from '@/lib/studio/node-types'

export function hueOf(t: ReturnType<typeof useTheme>['t'], hue: string): string {
  const key = hue as Hue
  return (t as unknown as Record<string, string>)[key] ?? t.tide
}

/** Root → here. Clicking a step climbs back out to that altitude. */
export function Trail({
  steps,
  onGo,
  projectTitle,
  onGoProject,
}: {
  steps: TreeNode[]
  onGo: (id: string) => void
  projectTitle: string
  onGoProject: () => void
}) {
  const { t } = useTheme()
  return (
    <nav
      aria-label="where you are"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, minHeight: 20 }}
    >
      <button
        type="button"
        onClick={onGoProject}
        style={{
          ...canvasType.label, color: t.textMuted, background: 'none', border: 'none',
          padding: 0, cursor: 'pointer',
        }}
      >
        {projectTitle || 'the project'}
      </button>
      {steps.map((step, i) => (
        <span key={step.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ ...canvasType.label, color: alpha(t.textMuted, 0.6) }}>/</span>
          <button
            type="button"
            onClick={() => onGo(step.id)}
            disabled={i === steps.length - 1}
            style={{
              ...canvasType.label,
              color: i === steps.length - 1 ? t.textPrimary : t.textMuted,
              background: 'none', border: 'none', padding: 0,
              cursor: i === steps.length - 1 ? 'default' : 'pointer',
            }}
          >
            {step.title || 'untitled'}
          </button>
        </span>
      ))}
    </nav>
  )
}

/** Saves when it loses focus, never on every keystroke — nothing interrupts. */
export function InlineField({
  value,
  onCommit,
  placeholder,
  multiline = false,
  style,
  ariaLabel,
  disabled = false,
}: {
  value: string
  onCommit: (next: string) => void
  placeholder?: string
  multiline?: boolean
  style?: React.CSSProperties
  ariaLabel: string
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  const box = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => { if (!focused) setDraft(value) }, [value, focused])

  useEffect(() => {
    const el = box.current
    if (!el || !multiline) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 460)}px`
  }, [draft, multiline])

  const commit = () => {
    setFocused(false)
    const next = draft.trim()
    if (next !== value.trim()) onCommit(next)
  }

  const shared: React.CSSProperties = {
    width: '100%', background: 'transparent', color: t.textPrimary,
    border: 'none', outline: 'none', resize: 'none', padding: 0,
    ...canvasType.body, ...style,
  }

  if (multiline) {
    return (
      <textarea
        ref={box}
        aria-label={ariaLabel}
        value={draft}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        style={shared}
      />
    )
  }
  return (
    <input
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      style={shared}
    />
  )
}

/** The threads a part carries, as small marks. */
export function ThreadChips({
  threadIds,
  threads,
  onOpen,
  size = 'sm',
}: {
  threadIds: string[]
  threads: Thread[]
  onOpen?: (threadId: string) => void
  size?: 'sm' | 'xs'
}) {
  const { t } = useTheme()
  if (threadIds.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {threadIds.map((id) => {
        const thread = threads.find((th) => th.id === id)
        if (!thread) return null
        const colour = hueOf(t, thread.hue)
        return (
          <button
            key={id}
            type="button"
            onClick={onOpen ? () => onOpen(id) : undefined}
            title={thread.name || 'a thread'}
            style={{
              ...canvasType.chip,
              fontSize: size === 'xs' ? 9 : 10,
              color: colour,
              background: alpha(colour, 0.12),
              border: `1px solid ${alpha(colour, 0.3)}`,
              borderRadius: 999,
              padding: size === 'xs' ? '1px 6px' : '2px 8px',
              cursor: onOpen ? 'pointer' : 'default',
              maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {thread.name || 'untitled thread'}
          </button>
        )
      })}
    </div>
  )
}

/** Small monospace eyebrow used all over the work views. */
export function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { t } = useTheme()
  return <div style={{ ...canvasType.label, color: t.textMuted, ...style }}>{children}</div>
}

export function Empty({ line }: { line: string }) {
  const { t } = useTheme()
  return <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>{line}</p>
}

/** True when the window is wide enough to hold the work and an open drawer
 *  side by side. Below it the drawer simply covers the page, which is the
 *  right answer on a narrow screen. */
export function useRoomBeside(min = 1180): boolean {
  const [room, setRoom] = useState(false)
  useEffect(() => {
    const check = () => setRoom(window.innerWidth >= min)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [min])
  return room
}
