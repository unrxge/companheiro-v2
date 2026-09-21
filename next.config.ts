import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Landing page photography (Picsum IDs chosen by hand; swap for owned photos later).
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "fastly.picsum.photos" },
    ],
  },
};

export default nextConfig;
