// studio/src/app/p/[id]/page.tsx — the project, on its canvas: the pieces
// across it, the threads beneath. `?write=1` is how Home and the other ways in
// from outside the Project Board ask for the words instead, when the project
// is a single piece of writing (read in the browser, by ProjectWorkPage).

import { ProjectWorkPage } from '@/components/studio/work/work-page'

// The page is the same shell for every project (the work itself is loaded in
// the browser), so each address is built once, on its first visit, and served
// from cache after that instead of by a server function every time. Reading
// searchParams, cookies or headers here would undo that.
export function generateStaticParams() {
  return []
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ProjectWorkPage projectId={id} />
}
