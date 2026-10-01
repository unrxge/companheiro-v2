// studio/src/app/p/[id]/n/[nodeId]/page.tsx — one part of the work. It shows
// its parts when it has them and its words when it does not; the same route
// covers every altitude, because nothing here is hard-coded to a depth.

import { WorkPage } from '@/components/studio/work/work-page'

// Built once per address and served from cache after that (see ../../page.tsx).
export function generateStaticParams() {
  return []
}

export default async function NodePage({ params }: { params: Promise<{ id: string; nodeId: string }> }) {
  const { id, nodeId } = await params
  return <WorkPage projectId={id} focus={{ kind: 'node', id: nodeId }} />
}
