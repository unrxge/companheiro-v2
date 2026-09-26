import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Shape step (Translate / Reimagine) was removed; old links land on Test, query string kept.
  async redirects() {
    return [
      { source: "/write/translate", destination: "/write/test", permanent: false },
      { source: "/write/reimagine", destination: "/write/test", permanent: false },
    ];
  },
};

export default nextConfig;
