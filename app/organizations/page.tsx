import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { ExploreGridPageSkeleton } from "../_components/PageLoadingSkeletons";
import { getRequestOrigin } from "../_lib/request-origin";
import { OrganizationsClient } from "./OrganizationsClient";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.organizations.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: localizedAlternates("/organizations"),
  };
}

export default async function OrganizationsPage() {
  const [t, origin] = await Promise.all([
    getTranslations("marketplace.organizations.metadata"),
    getRequestOrigin(),
  ]);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("title"),
    description: t("description"),
    url: new URL("/organizations", origin).toString(),
    isPartOf: {
      "@type": "WebSite",
      name: "GainForest",
      url: new URL("/", origin).toString(),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Suspense fallback={<ExploreGridPageSkeleton />}>
        <OrganizationsClient />
      </Suspense>
    </>
  );
}
