'use client'

// studio/src/components/shelf/shelf-grid.tsx — the grid of project cards (10.1):
// 2 columns ≥ 720 px, 1 below; sorted active first (updated_at desc), then
// resting, then completed. Empty: `no projects yet` + `new project`.

import { useMemo } from 'react'
import { Container } from '@/components/shell/page-shell'
import { PrimaryButton } from '@/components/ui/buttons'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import type { ProjectStatus, ShelfProject } from '@/lib/studio/types'
import { ProjectCard } from '@/components/shelf/project-card'

const RANK: Record<ProjectStatus, number> = { active: 0, resting: 1, finished: 2, kept: 2, abandoned: 2 }

export function sortShelf(projects: ShelfProject[]): ShelfProject[] {
  return [...projects].sort((a, b) => {
    const r = RANK[a.status] - RANK[b.status]
    if (r !== 0) return r
    return b.updated_at.localeCompare(a.updated_at)
  })
}

export function ShelfGrid({ projects, onNew }: { projects: ShelfProject[]; onNew: () => void }) {
  const { t } = useTheme()
  const sorted = useMemo(() => sortShelf(projects), [projects])
  const now = useMemo(() => new Date(), [])

  if (sorted.length === 0) {
    return (
      <Container padding={32}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16, padding: '24px 0' }}>
          <p style={{ ...canvasType.body, color: t.textSecondary, margin: 0 }}>no projects yet</p>
          <PrimaryButton onClick={onNew}>new project</PrimaryButton>
        </div>
      </Container>
    )
  }

  return (
    <Container padding={20}>
      <style>{`
        .shelf-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 720px) { .shelf-grid { grid-template-columns: 1fr 1fr; gap: 16px; } }
      `}</style>
      <div className="shelf-grid">
        {sorted.map((p) => (
          <ProjectCard key={p.id} project={p} now={now} />
        ))}
      </div>
    </Container>
  )
}
