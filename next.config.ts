import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel's native WebSocket upgrade helper uses the Node `ws` package.
  // Keep it external so Next does not rebundle ws internals (which can break
  // low-level frame masking/unmasking in the Vercel Function runtime).
  serverExternalPackages: ["ws"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" }
    ]
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8"
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate"
          },
          {
            key: "Service-Worker-Allowed",
            value: "/"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
