'use client'

// studio/src/components/shelf/project-card.tsx — one project on the shelf (10.1):
// title, status pill (`resting · 9 days left` from resting_until), the concept's
// first 200 chars, then the since line for that project with tide dots. A
// completed or abandoned card shows its completion sentence in mono 11. Nothing
// counts anything.

import { useRouter } from 'next/navigation'
import { Card } from '@/components/shell/page-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { sinceSentence } from '@/lib/studio/since'
import type { ShelfProject } from '@/lib/studio/types'
import { COMPLETED, statusLabel } from '@/components/canvas/chrome/status-strip'

export function ProjectCard({ project, now }: { project: ShelfProject; now: Date }) {
  const { t } = useTheme()
  const router = useRouter()
  const since = project.since
  const firstOpen = !since.last_said && since.arrived_since === 0 && since.waiting === 0
  const { lines, dots } = sinceSentence(since, now, firstOpen)
  const excerpt = (project.concept_body ?? '').trim().slice(0, 200)
  const completed = COMPLETED.has(project.status)

  return (
    <Card as="button" onClick={() => router.push(`/p/${project.id}`)} padding={20} style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 168 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <h3 style={{ ...canvasType.title, color: t.textPrimary, margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
          {project.title || 'untitled project'}
        </h3>
        <span
          style={{
            ...canvasType.label,
            color: project.status === 'active' ? t.textSecondary : t.textMuted,
            border: `1px solid ${t.divider}`,
            borderRadius: 999,
            padding: '3px 8px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          {statusLabel(project, now)}
        </span>
      </div>

      {excerpt && (
        <p
          style={{
            ...canvasType.small,
            color: t.textSecondary,
            margin: 0,
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {excerpt}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 'auto' }}>
        {lines.map((line, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {dots[i] && <i aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.tide, flexShrink: 0, marginTop: 7 }} />}
            <span style={{ ...canvasType.small, color: t.textSecondary, overflowWrap: 'anywhere' }}>{line}</span>
          </div>
        ))}
        {completed && project.completion_note && (
          <span style={{ ...canvasType.meta, color: t.textMuted, marginTop: 4 }}>“{project.completion_note}”</span>
        )}
      </div>
    </Card>
  )
}
