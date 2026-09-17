'use client'

import { useTheme } from '@/components/theme/theme-provider'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { Eyebrow } from '@/components/shell/page-shell'
import { type as typeRoles } from '@/lib/design-tokens'

export interface ConversationLogMessage {
  role: 'user' | 'assistant'
  content: string
}

// The conceptualise route keeps this marker in history so the server can
// detect phase completion on the next turn — never meant for a reader.
const PHASE_MARKER = '<phase_complete/>'

/** Read-only viewer for a saved AI back-and-forth (e.g. the conceptualisation
 *  conversation behind a declared idea) — reused wherever that log resurfaces:
 *  the core-concept page in the moment, and the Idea/Piece modals afterward. */
export function ConversationLogModal({
  messages,
  onClose,
  title = 'Conceptualisation',
}: {
  messages: ConversationLogMessage[]
  onClose: () => void
  title?: string
}) {
  const { t } = useTheme()
  const visible = messages
    .map((msg) => ({ ...msg, content: msg.content.split(PHASE_MARKER).join('').trim() }))
    .filter((msg) => msg.content.length > 0)

  return (
    <ModalDialog onClose={onClose} title={title} maxWidth="640px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {visible.length === 0 ? (
          <p style={{ ...typeRoles.small, color: t.textMuted }}>No conversation was recorded for this idea.</p>
        ) : (
          visible.map((msg, i) => (
            <div key={i} style={{ borderBottom: i < visible.length - 1 ? `1px solid ${t.divider}` : 'none', paddingBottom: i < visible.length - 1 ? 18 : 0 }}>
              <Eyebrow style={{ marginBottom: 6, color: msg.role === 'user' ? t.ember : t.textMuted }}>{msg.role === 'user' ? 'You' : 'Companheiro'}</Eyebrow>
              <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
            </div>
          ))
        )}
      </div>
    </ModalDialog>
  )
}
