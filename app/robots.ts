import type { MetadataRoute } from "next";

const SITE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://gainforest.app"
).replace(/\/$/, "");

// `/robots.txt` — generated dynamically from the same SITE_URL the rest of
// the metadata uses so the sitemap link stays correct across environments.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
