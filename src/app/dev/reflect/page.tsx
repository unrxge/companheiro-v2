import { notFound } from 'next/navigation'
import { ReflectHarness } from './harness'

// Local-only preview of the Reflect step with its API mocked. 404s in production.
// ?done=1 answers as if a reflection already exists (the page then moves on to the Reading room).
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <ReflectHarness />
}
