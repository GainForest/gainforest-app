import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { ExploreGridPageSkeleton } from "../_components/PageLoadingSkeletons";
import { getRequestOrigin } from "../_lib/request-origin";
import { walkOccurrences } from "../_lib/indexer";
import { RecordExplorer } from "../_components/RecordExplorer";

export const revalidate = 86400;

const INITIAL_OBSERVATIONS_TARGET = 24;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.observations.metadata");
  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    alternates: localizedAlternates("/observations"),
    openGraph: {
      title,
      description,
      url: "/observations",
      type: "website",
      images: [{ url: "/og/gainforest-og-2.png", width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: "/og/gainforest-og-2.png", alt: title }],
    },
  };
}

export default async function ObservationsPage() {
  const [t, origin, initialPage] = await Promise.all([
    getTranslations("marketplace.observations.metadata"),
    getRequestOrigin(),
    walkOccurrences({
      media: "image",
      target: INITIAL_OBSERVATIONS_TARGET,
      after: null,
      resolveMedia: false,
    }).catch(() => undefined),
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
        <RecordExplorer kind="occurrence" enableOwnerFilter initialPage={initialPage} />
      </Suspense>
    </>
  );
}
