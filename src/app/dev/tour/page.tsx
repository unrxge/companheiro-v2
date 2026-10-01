import { notFound } from 'next/navigation'
import { TourHarness } from './harness'

// Local-only preview of the tour as a brand-new account sees it. 404s in production.
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <TourHarness />
}
