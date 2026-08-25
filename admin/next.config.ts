import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Admin previews are mostly static demo assets — cache optimized variants for 30 days.
    minimumCacheTTL: 2592000,
    remotePatterns: [
      { protocol: "http", hostname: "localhost", pathname: "/**" },
      { protocol: "https", hostname: "localhost", pathname: "/**" },
    ],
  },
};

export default nextConfig;
