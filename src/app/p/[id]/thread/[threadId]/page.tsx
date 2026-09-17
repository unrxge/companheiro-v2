'use client'

// studio/src/app/p/[id]/thread/[threadId]/page.tsx — one thread, read straight
// through, with everything it does not touch removed.

import { use } from 'react'
import { WorkPage } from '@/components/studio/work/work-page'

export default function ThreadPage({ params }: { params: Promise<{ id: string; threadId: string }> }) {
  const { id, threadId } = use(params)
  return <WorkPage projectId={id} focus={{ kind: 'thread', id: threadId }} />
}
