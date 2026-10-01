import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // The Shape step (Translate) was removed; old links land on Test, query string kept.
      { source: "/write/translate", destination: "/write/test", permanent: false },
      // Sign-up lives on the same page as sign-in. Old links and the landing's
      // Begin buttons still point here; any attribution in the query string
      // (utm_*, ref, via, landing) is carried over. Done here rather than in a
      // page so the hop is answered at the edge, without a server function.
      { source: "/signup", destination: "/login?mode=create", permanent: false },
    ];
  },
};

export default nextConfig;
