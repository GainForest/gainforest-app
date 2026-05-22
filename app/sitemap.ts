import type { MetadataRoute } from "next";

const SITE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ?? "https://gainforest.app"
).replace(/\/$/, "");

// `/sitemap.xml` — landing + /about + /research today. Add more URLs
// as routes grow (e.g. /blog, /team, …).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/research`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
