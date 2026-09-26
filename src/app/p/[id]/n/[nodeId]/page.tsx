'use client'

// src/app/p/[id]/n/[nodeId]/page.tsx — one part of the work. It shows
// its parts when it has them and its words when it does not; the same route
// covers every altitude, because nothing here is hard-coded to a depth.

import { use } from 'react'
import { WorkPage } from '@/components/studio/work/work-page'

export default function NodePage({ params }: { params: Promise<{ id: string; nodeId: string }> }) {
  const { id, nodeId } = use(params)
  return <WorkPage projectId={id} focus={{ kind: 'node', id: nodeId }} />
}
