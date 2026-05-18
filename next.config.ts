import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    // Live Bumicert thumbnails are resolved to the project owner's PDS via
    // com.atproto.sync.getBlob. The bumicerts monorepo defaults to certified.one
    // but the URL is derived from the DID at request time, so we accept any
    // PDS that exposes the public sync endpoint.
    remotePatterns: [
      { protocol: "https", hostname: "**", pathname: "/xrpc/com.atproto.sync.getBlob/**" },
      { protocol: "https", hostname: "**", pathname: "/xrpc/com.atproto.sync.getBlob" },
      { protocol: "https", hostname: "certified.one" },
      { protocol: "https", hostname: "blob-proxy-worker.satyam1308mishra.workers.dev" },
    ],
  },
};

export default nextConfig;
