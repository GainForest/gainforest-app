import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { ExploreGridPageSkeleton } from "../_components/PageLoadingSkeletons";
import { getRequestOrigin } from "../_lib/request-origin";
import { RecordExplorer } from "../_components/RecordExplorer";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.observations.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: localizedAlternates("/observations"),
  };
}

export default async function ObservationsPage() {
  const [t, origin] = await Promise.all([
    getTranslations("marketplace.observations.metadata"),
    getRequestOrigin(),
  ]);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("title"),
    description: t("description"),
    url: new URL("/observations", origin).toString(),
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
        <RecordExplorer kind="occurrence" enableOwnerFilter />
      </Suspense>
    </>
  );
}
