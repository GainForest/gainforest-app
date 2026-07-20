import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { localizedAlternates, socialPreviewMetadata } from "@/app/_lib/seo-metadata";
import { ExploreGridPageSkeleton } from "../_components/PageLoadingSkeletons";
import { fetchProjects, fetchRecordByUri, GAINFOREST_MODERATION_REPO_DID, type ProjectRecord } from "../_lib/indexer";
import { fetchFeaturedProjectUris } from "../internal/badges/_lib/featured-projects";
import { getRequestOrigin } from "../_lib/request-origin";
import { localProjectHref } from "../_lib/urls";
import { ProjectsExploreClient } from "./ProjectsExploreClient";

export const revalidate = 86400;

const INITIAL_PROJECTS_TARGET = 48;

function absoluteUrlOrUndefined(origin: string, value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, origin).toString();
  } catch {
    return undefined;
  }
}

function buildProjectsItemListJsonLd(origin: string, records: ProjectRecord[], name: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: records.length,
    itemListElement: records.map((record, index) => {
      const url = new URL(localProjectHref(record.did, record.rkey), origin).toString();
      return {
        "@type": "ListItem",
        position: index + 1,
        url,
        item: {
          "@type": "Project",
          name: record.title,
          description: record.shortDescription || undefined,
          url,
          image: absoluteUrlOrUndefined(origin, record.imageUrl),
          datePublished: record.createdAt,
        },
      };
    }),
  };
}

function mergeFeaturedProjects(featured: ProjectRecord[], records: ProjectRecord[]): ProjectRecord[] {
  const seen = new Set<string>();
  return [...featured, ...records].filter((record) => {
    if (seen.has(record.atUri)) return false;
    seen.add(record.atUri);
    return true;
  });
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.projects.metadata");
  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    alternates: await localizedAlternates("/projects"),
    ...socialPreviewMetadata("/projects", title, description),
  };
}

export default async function ProjectsPage() {
  const [t, origin, initialPage, initialFeaturedUris] = await Promise.all([
    getTranslations("marketplace.projects.metadata"),
    getRequestOrigin(),
    fetchProjects(INITIAL_PROJECTS_TARGET, null, undefined, undefined, {
      sort: "newest",
      featuredBadgesOnly: true,
    }).catch(() => undefined),
    fetchFeaturedProjectUris(GAINFOREST_MODERATION_REPO_DID).catch(() => []),
  ]);
  const initialFeaturedRecords = (await Promise.all(
    initialFeaturedUris.map((uri) => fetchRecordByUri(uri).catch(() => null)),
  )).filter((record): record is ProjectRecord => record?.kind === "project");
  const mergedInitialRecords = mergeFeaturedProjects(initialFeaturedRecords, initialPage?.records ?? []);
  const title = t("title");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description: t("description"),
    url: new URL("/projects", origin).toString(),
    isPartOf: {
      "@type": "WebSite",
      name: "GainForest",
      url: new URL("/", origin).toString(),
    },
  };
  const itemListJsonLd = buildProjectsItemListJsonLd(origin, mergedInitialRecords, title);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        id="projects-item-list-json-ld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <Suspense fallback={<ExploreGridPageSkeleton />}>
        <ProjectsExploreClient
          initialPage={initialPage ? { ...initialPage, records: mergedInitialRecords } : undefined}
          initialFeaturedUris={initialFeaturedUris}
        />
      </Suspense>
    </>
  );
}
