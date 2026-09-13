import path from 'path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // The studio is its own app living inside the main app's repo. Pin the
  // tracing root here so Next never infers the parent repo (which has its own
  // lockfile) as the workspace root.
  outputFileTracingRoot: path.join(__dirname),
}

export default nextConfig
