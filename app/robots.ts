import type { MetadataRoute } from "next";
import { getRequestOrigin } from "./_lib/request-origin";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getRequestOrigin();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/*/dashboard"],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
