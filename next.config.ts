import type { NextConfig } from "next";
import { assertWiring } from "./src/lib/deploy-env";

// A lab build wired to the live database (or the reverse) stops here.
assertWiring();

const nextConfig: NextConfig = {
  // The example projects on a new account's Project Board are never stored:
  // every request the real pages make about one (its ids all start
  // `example-`) is answered read-only from code by /api/examples/… instead of
  // the route that reads the database. Before the filesystem, so it wins over
  // the real routes. See src/lib/examples/serve.ts.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/api/studio/:kind(projects|nodes|items|threads)/:id(example-[a-z0-9-]+)", destination: "/api/examples/:kind/:id" },
        { source: "/api/studio/:kind(projects|nodes|items|threads)/:id(example-[a-z0-9-]+)/:rest*", destination: "/api/examples/:kind/:id/:rest*" },
        { source: "/api/write/:route*", has: [{ type: "query", key: "node_id", value: "example-.*" }], destination: "/api/examples/write/:route*" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      // The Shape step (Translate) was removed; old links land on Test, query string kept.
      { source: "/write/translate", destination: "/write/test", permanent: false },
      // Reimagine was removed (it generated the work for the person); the step before it is Test.
      { source: "/write/reimagine", destination: "/write/test", permanent: false },
      // "Post" became Reflect: looking back on a finished piece, whether or not it was ever shared.
      { source: "/post-publication", destination: "/reflect", permanent: false },
      // Sign-up lives on the same page as sign-in. Old links and the landing's
      // Begin buttons still point here; any attribution in the query string
      // (utm_*, ref, via, landing) is carried over. Done here rather than in a
      // page so the hop is answered at the edge, without a server function.
      { source: "/signup", destination: "/login?mode=create", permanent: false },
      // /welcome (three questions with the companion) is gone: /tour asks who
      // they are and what their work is about, and cannot be skipped. An old
      // link lands on Home, which sends anyone not yet through it to /tour.
      { source: "/welcome", destination: "/home", permanent: false },
    ];
  },
};

export default nextConfig;
