import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  devIndicators: false,
  skipProxyUrlNormalize: true,
  allowedDevOrigins: ["local.gainforest.app", "local2.gainforest.app", "local-e2e.gainforest.app"],
  experimental: {
    dynamicOnHover: true,
    preloadEntriesOnStart: true,
    staleTimes: {
      dynamic: 300,
      static: 1800,
    },
  },
  async headers() {
    const privatePreviewHeaders = [
      { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
      { key: "Cache-Control", value: "no-store" },
    ];
    return [
      { source: "/_test/:path*", headers: privatePreviewHeaders },
      { source: "/:locale(en|es|pt|sw|id)/_test/:path*", headers: privatePreviewHeaders },
    ];
  },
  images: {
    qualities: [75, 95],
    // Record thumbnails (occurrences, bumicerts, org covers) are resolved to
    // each record owner's PDS via com.atproto.sync.getBlob. The host is
    // derived from the DID at request time, so we accept any PDS that exposes
    // the public sync endpoint — but ONLY that endpoint. There is deliberately
    // no catch-all host entry: it would let anyone use our image optimizer as
    // a free proxy for arbitrary content. Record images on other hosts must be
    // rendered with `unoptimized` (gate on `isPdsBlobUrl`, see app/_lib/pds.ts).
    remotePatterns: [
      { protocol: "https", hostname: "**", pathname: "/xrpc/com.atproto.sync.getBlob/**" },
      { protocol: "https", hostname: "**", pathname: "/xrpc/com.atproto.sync.getBlob" },
      { protocol: "https", hostname: "certified.one" },
      // The landing page's explainer-video poster.
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
