'use client'

// The reflection log, as it is shown: while it is being confirmed at the end of
// Reflect, and kept with the finished piece afterwards. Their own words, in the
// four parts they were asked about; anything left open can be taken into the
// Idea Lab from here.

import { useTheme } from '@/components/theme/theme-provider'
import { Eyebrow } from '@/components/shell/page-shell'
import { UnderlineLink } from '@/components/ui/underline-link'
import { type as typeRoles } from '@/lib/design-tokens'
import { THEMES, isNothing } from '@/lib/reflection'

export interface ShownLog {
  feeling?: string | null
  opened?: string | null
  unresolved?: string | null
  next?: string[] | null
  /** Older reflections were asked which thread the piece belonged to. */
  thread?: string | null
}

export function ReflectionLogView({ log }: { log: ShownLog }) {
  const { t } = useTheme()
  const label = (n: number) => THEMES[n - 1].label
  const next = (log.next ?? []).filter(Boolean)
  const body: React.CSSProperties = { ...typeRoles.ui, fontSize: 15, lineHeight: 1.65, color: t.textPrimary, margin: 0, whiteSpace: 'pre-wrap' }
  const develop = (text: string) =>
    isNothing(text) ? null : (
      <UnderlineLink href={`/idea-lab/conceptualise?seed=${encodeURIComponent(text)}`} color={t.textMuted}>Develop this →</UnderlineLink>
    )
  const section = (title: string, children: React.ReactNode, accent?: string) => (
    <div>
      <Eyebrow style={{ marginBottom: 6, fontSize: 10, ...(accent ? { color: accent } : {}) }}>{title}</Eyebrow>
      {children}
    </div>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {log.thread && section('Thread', <p style={{ ...body, fontWeight: 500 }}>{log.thread}</p>)}
      {log.feeling && section(label(1), <p style={body}>{log.feeling}</p>)}
      {log.opened && section(label(2), <p style={body}>{log.opened}</p>)}
      {log.unresolved && section(label(3), (
        <div>
          <p style={body}>{log.unresolved}</p>
          {develop(log.unresolved)}
        </div>
      ), t.ember)}
      {next.length > 0 && section(label(4), (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {next.map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', border: `2px solid ${t.ember}`, flexShrink: 0, marginTop: 8 }} />
              <div style={{ flex: 1 }}>
                <p style={body}>{line}</p>
                {develop(line)}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
