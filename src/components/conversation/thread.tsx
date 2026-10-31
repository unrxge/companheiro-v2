'use client'

import { AnimatePresence, motion as m } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { MicButton } from '@/components/ui/mic-button'
import { PrimaryButton } from '@/components/ui/buttons'
import { TextArea } from '@/components/ui/field'
import { fonts, radius } from '@/lib/design-tokens'
import { WorkingDots } from '@/components/ui/working'

/** Structural markers kept in history for the server but never shown. */
const HIDDEN_MARKERS = ['<phase_complete/>']
export function displayContent(content: string): string {
  let out = content
  for (const mk of HIDDEN_MARKERS) out = out.split(mk).join('')
  // Shown as plain text, so emphasis marks would appear as literal asterisks.
  out = out.replace(/\*{1,3}([^*\n]+)\*{1,3}/g, '$1')
  return out.trimEnd()
}

export interface ThreadMessage {
  role: 'user' | 'assistant'
  content: string
  /** Kept in history for the server but never rendered to the person. */
  _hidden?: boolean
}

/**
 * One conversation surface for Conceptualise and
 * onboarding. The person's words sit right, medium weight; the companion's
 * sit left, one step quieter. A gradient veil covers the streaming tail.
 * `onShell` renders with shell colours (Check-in keeps its thread on the ink).
 */
export function Thread({
  messages,
  streaming,
  onShell = false,
  align = 'split',
  children,
}: {
  messages: ThreadMessage[]
  streaming: boolean
  onShell?: boolean
  /** `split`: user right / assistant left. `left`: everything left (check-in). */
  align?: 'split' | 'left'
  /** Rendered after the messages, inside the same column (pending cards, errors). */
  children?: React.ReactNode
}) {
  const { t } = useTheme()
  const userColor = onShell ? '#ece9e2' : t.textPrimary
  const aiColor = onShell ? '#b3aea5' : t.textSecondary
  const veilTo = onShell ? '#0d0c0b' : t.containerBg
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {messages.filter((msg) => !msg._hidden).map((msg, i) => {
        const isUser = msg.role === 'user'
        const isStreamingLast = streaming && i === messages.filter((m) => !m._hidden).length - 1 && !isUser
        const right = align === 'split' && isUser
        return (
          <m.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} style={{ display: 'flex', justifyContent: right ? 'flex-end' : 'flex-start' }}>
            <div style={{ position: 'relative', maxWidth: align === 'split' ? '88%' : '100%' }}>
              <p
                style={{
                  fontFamily: fonts.ui,
                  fontSize: 16,
                  lineHeight: 1.65,
                  margin: 0,
                  color: isUser ? userColor : aiColor,
                  fontWeight: isUser ? 500 : 400,
                  textAlign: right ? 'right' : 'left',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {displayContent(msg.content)}
              </p>
              <AnimatePresence>
                {isStreamingLast && (
                  <m.div key="veil" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 52, background: `linear-gradient(to top, ${veilTo}, transparent)`, pointerEvents: 'none' }} />
                )}
              </AnimatePresence>
            </div>
          </m.div>
        )
      })}
      {streaming && messages.filter((m) => !m._hidden)[messages.filter((m) => !m._hidden).length - 1]?.role !== 'assistant' && (
        <p role="status" aria-label="Replying" style={{ fontFamily: fonts.ui, fontSize: 16, color: aiColor, margin: 0 }}><WorkingDots /></p>
      )}
      {children}
    </div>
  )
}

/** Text area + mic + send, the same on every conversational screen. */
export function Composer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = 'Say what is here…',
  recording = false,
  transcribing = false,
  partial = '',
  onToggleRecording,
  sendLabel = 'Send',
  onShell = false,
  autoFocus = false,
  inline = false,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  recording?: boolean
  /** Dictation has stopped and its words are still being written out. */
  transcribing?: boolean
  /** Words being written out, shown under the box until they land in it. */
  partial?: string
  onToggleRecording?: () => void
  sendLabel?: string
  onShell?: boolean
  autoFocus?: boolean
  /** Keep the mic and Send beside the box on a phone too, instead of under it. */
  inline?: boolean
}) {
  const { t } = useTheme()
  // Send works mid-recording: the page stops it and waits for the last words.
  const canSend = (value.trim().length > 0 || recording) && !disabled
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className={inline ? undefined : 'composer-row'} style={{ display: 'flex', gap: inline ? 8 : 10, alignItems: 'flex-end' }}>
        <TextArea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          maxHeight={160}
          autoFocus={autoFocus}
          ariaLabel="Message"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && canSend) {
              e.preventDefault()
              onSend()
            }
          }}
          style={{ flex: 1, minWidth: 0, fontSize: 15, borderRadius: radius.field, ...(onShell ? { backgroundColor: '#1c1916', borderColor: '#352f29', color: '#ece9e2' } : {}) }}
        />
        {onToggleRecording && <MicButton recording={recording} onToggle={onToggleRecording} disabled={disabled} size={44} onShell={onShell} />}
        <PrimaryButton onClick={onSend} disabled={!canSend} ariaLabel={sendLabel}>
          {sendLabel}
        </PrimaryButton>
      </div>
      <AnimatePresence>
        {(recording || transcribing) && (
          <m.p key={recording ? 'rec' : 'writing'} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} style={{ fontFamily: fonts.ui, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, color: onShell ? '#8a857c' : t.textMuted, margin: 0, textAlign: 'center' }}>
            {recording ? 'Recording' : 'Writing it out…'}
          </m.p>
        )}
        {!recording && transcribing && partial && (
          <m.p key="partial" initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} exit={{ opacity: 0 }} style={{ fontSize: 14, lineHeight: 1.6, color: onShell ? '#ece9e2' : t.textPrimary, margin: 0 }}>
            {partial}
          </m.p>
        )}
      </AnimatePresence>
    </div>
  )
}
