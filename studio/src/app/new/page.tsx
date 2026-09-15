'use client'

// studio/src/app/new/page.tsx — project creation (10.2, D-061, lane H). One
// screen, two ways in (a brief, or four questions), a review of the drafted
// concept, then `make the project`. Nothing is persisted before that press.

import { PageHeader, PageShell } from '@/components/shell/page-shell'
import { NewProjectFlow } from '@/components/new/new-project-flow'

export default function NewProjectPage() {
  return (
    <PageShell dock={false} mood="neutral">
      <PageHeader eyebrow={null} title="new project" size="md" back="/shelf" />
      <NewProjectFlow />
    </PageShell>
  )
}
