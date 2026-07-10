import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { ExploreGridPageSkeleton } from "../_components/PageLoadingSkeletons";
import { getRequestOrigin } from "../_lib/request-origin";
import { walkOccurrences, type OccurrenceRecord } from "../_lib/indexer";
import { localObservationHref } from "../_lib/urls";
import { RecordExplorer } from "../_components/RecordExplorer";

export const revalidate = 86400;

const INITIAL_OBSERVATIONS_TARGET = 24;

function absoluteUrlOrUndefined(origin: string, value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, origin).toString();
  } catch {
    return undefined;
  }
}

function buildObservationsItemListJsonLd(origin: string, records: OccurrenceRecord[], name: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: records.length,
    itemListElement: records.map((record, index) => {
      const url = new URL(localObservationHref(record.did, record.rkey), origin).toString();
      return {
        "@type": "ListItem",
        position: index + 1,
        url,
        item: {
          "@type": "Observation",
          name: record.vernacularName || record.scientificName || name,
          description: record.remarks || record.locality || undefined,
          url,
          image: absoluteUrlOrUndefined(origin, record.imageUrl),
          datePublished: record.createdAt,
        },
      };
    }),
  };
}

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
  const title = t("title");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description: t("description"),
    url: new URL("/observations", origin).toString(),
    isPartOf: {
      "@type": "WebSite",
      name: "GainForest",
      url: new URL("/", origin).toString(),
    },
  };
  const itemListJsonLd = buildObservationsItemListJsonLd(origin, initialPage?.records ?? [], title);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        id="observations-item-list-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <Suspense fallback={<ExploreGridPageSkeleton />}>
        <RecordExplorer kind="occurrence" enableOwnerFilter initialPage={initialPage} />
      </Suspense>
    </>
  );
}
