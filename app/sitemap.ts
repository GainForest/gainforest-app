import type { MetadataRoute } from "next";

const SITE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://gainforest.app"
).replace(/\/$/, "");

// `/sitemap.xml` — single entry today (the landing). Add more URLs here
// as the landing grows new routes (e.g. /about, /blog, …).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
  ];
}
