'use client'

// src/app/p/[id]/page.tsx — the project. Opens at the outermost
// altitude, or straight into the work when there is only one piece and nothing
// running across it yet.

import { use } from 'react'
import { WorkPage } from '@/components/studio/work/work-page'

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <WorkPage projectId={id} focus={{ kind: 'project' }} />
}
