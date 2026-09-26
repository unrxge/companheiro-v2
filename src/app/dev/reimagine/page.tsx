import { notFound } from 'next/navigation'
import { ReimagineHarness } from './harness'

// Local-only preview of Reimagine with its API mocked (streamed lens talk, streamed takes, recorded saves). 404s in production.
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <ReimagineHarness />
}
