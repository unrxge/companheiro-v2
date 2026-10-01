'use client'

// studio/src/app/p/[id]/page.tsx — the project, on its canvas: the pieces
// across it, the threads beneath. `?write=1` is how Home and the other ways in
// from outside the Project Board ask for the words instead, when the project
// is a single piece of writing.

import { use } from 'react'
import { WorkPage } from '@/components/studio/work/work-page'

export default function ProjectPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ write?: string }>
}) {
  const { id } = use(params)
  const { write } = use(searchParams)
  return <WorkPage projectId={id} focus={{ kind: 'project' }} straightToWriting={write === '1'} />
}
