import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Shape step (Translate) was removed; old links land on Test, query string kept.
  async redirects() {
    return [
      { source: "/write/translate", destination: "/write/test", permanent: false },
    ];
  },
};

export default nextConfig;
