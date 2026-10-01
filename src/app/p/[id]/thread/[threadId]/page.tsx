// studio/src/app/p/[id]/thread/[threadId]/page.tsx — one thread, read straight
// through, with everything it does not touch removed.

import { WorkPage } from '@/components/studio/work/work-page'

// Built once per address and served from cache after that (see ../../page.tsx).
export function generateStaticParams() {
  return []
}

export default async function ThreadPage({ params }: { params: Promise<{ id: string; threadId: string }> }) {
  const { id, threadId } = await params
  return <WorkPage projectId={id} focus={{ kind: 'thread', id: threadId }} />
}
