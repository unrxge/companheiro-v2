import { notFound } from 'next/navigation'
import { AccessGateHarness } from './harness'

// Local-only preview of the fair-use and trial screens, so they can be
// checked without a signed-in account in each state. 404s in production.
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <AccessGateHarness />
}
