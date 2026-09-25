import { notFound } from 'next/navigation'
import { WorkPageHarness } from './harness'

// Local-only preview of a new project's writing view with the studio API mocked. 404s in production.
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <WorkPageHarness />
}
