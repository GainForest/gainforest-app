import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    dynamicOnHover: true,
    preloadEntriesOnStart: true,
    staleTimes: {
      dynamic: 300,
      static: 1800,
    },
  },
  images: {
    // Record thumbnails (occurrences, bumicerts, org covers) are resolved to
    // each record owner's PDS via com.atproto.sync.getBlob. The host is
    // derived from the DID at request time, so we accept any PDS that exposes
    // the public sync endpoint.
    remotePatterns: [
      { protocol: "https", hostname: "**", pathname: "/xrpc/com.atproto.sync.getBlob/**" },
      { protocol: "https", hostname: "**", pathname: "/xrpc/com.atproto.sync.getBlob" },
      { protocol: "https", hostname: "certified.one" },
      { protocol: "https", hostname: "**" },
    ],
  },
};

export default nextConfig;
