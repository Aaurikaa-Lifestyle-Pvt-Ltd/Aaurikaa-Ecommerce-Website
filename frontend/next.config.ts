import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Mostly-static ecommerce imagery — cache optimized variants for 30 days.
    minimumCacheTTL: 2592000,
    // Demo uses trusted local SVG placeholders; real raster photos later still
    // benefit from optimization. Sandboxed CSP keeps the SVGs inert.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      { protocol: "http", hostname: "localhost", pathname: "/**" },
      { protocol: "https", hostname: "localhost", pathname: "/**" },
      // Cloudflare R2 public bucket hosts (API catalogue media)
      { protocol: "https", hostname: "**.r2.dev", pathname: "/**" },
    ],
  },
};

export default nextConfig;
