import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { ExploreGridPageSkeleton } from "../_components/PageLoadingSkeletons";
import { fetchSites, type SiteRecord } from "../_lib/indexer";
import { getRequestOrigin } from "../_lib/request-origin";
import { accountHref } from "../_lib/urls";
import { OrganizationsClient } from "./OrganizationsClient";

export const revalidate = 86400;

const INITIAL_ORGANIZATIONS_TARGET = 24;

function absoluteUrlOrUndefined(origin: string, value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, origin).toString();
  } catch {
    return undefined;
  }
}

function buildOrganizationsItemListJsonLd(origin: string, records: SiteRecord[], name: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: records.length,
    itemListElement: records.map((record, index) => {
      const url = new URL(accountHref(record.did), origin).toString();
      return {
        "@type": "ListItem",
        position: index + 1,
        url,
        item: {
          "@type": "Organization",
          name: record.name,
          url,
          image: absoluteUrlOrUndefined(origin, record.avatarUrl ?? record.imageUrl),
          address: record.country
            ? { "@type": "PostalAddress", addressCountry: record.country }
            : undefined,
        },
      };
    }),
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.organizations.metadata");
  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    alternates: await localizedAlternates("/organizations"),
    openGraph: {
      title,
      description,
      url: "/organizations",
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

export default async function OrganizationsPage() {
  const [t, origin, initialPage] = await Promise.all([
    getTranslations("marketplace.organizations.metadata"),
    getRequestOrigin(),
    fetchSites(INITIAL_ORGANIZATIONS_TARGET, null, undefined, undefined, "both", {
      sort: "newest",
      featuredBadgesOnly: true,
    }).catch(() => undefined),
  ]);
  const title = t("title");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description: t("description"),
    url: new URL("/organizations", origin).toString(),
    isPartOf: {
      "@type": "WebSite",
      name: "GainForest",
      url: new URL("/", origin).toString(),
    },
  };
  const itemListJsonLd = buildOrganizationsItemListJsonLd(origin, initialPage?.records ?? [], title);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        id="organizations-item-list-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <Suspense fallback={<ExploreGridPageSkeleton />}>
        <OrganizationsClient initialPage={initialPage} />
      </Suspense>
    </>
  );
}
