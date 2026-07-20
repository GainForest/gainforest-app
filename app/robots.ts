import type { MetadataRoute } from "next";
import { getRequestOrigin } from "./_lib/request-origin";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await getRequestOrigin();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/*/admin",
        "/auth",
        "/*/auth",
        "/cart",
        "/*/cart",
        "/checkout",
        "/*/checkout",
        "/dashboard",
        "/*/dashboard",
        "/manage",
        "/*/manage",
        "/settings",
        "/*/settings",
        "/_test",
        "/*/_test",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
