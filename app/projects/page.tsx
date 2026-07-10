import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { localizedAlternates } from "@/app/_lib/seo-metadata";
import { ExploreGridPageSkeleton } from "../_components/PageLoadingSkeletons";
import { fetchProjects } from "../_lib/indexer";
import { getRequestOrigin } from "../_lib/request-origin";
import { ProjectsExploreClient } from "./ProjectsExploreClient";

export const revalidate = 86400;

const INITIAL_PROJECTS_TARGET = 48;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.projects.metadata");
  const title = t("title");
  const description = t("description");

  return {
    title,
    description,
    alternates: localizedAlternates("/projects"),
    openGraph: {
      title,
      description,
      url: "/projects",
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

export default async function ProjectsPage() {
  const [t, origin, initialPage] = await Promise.all([
    getTranslations("marketplace.projects.metadata"),
    getRequestOrigin(),
    fetchProjects(INITIAL_PROJECTS_TARGET, null, undefined, undefined, {
      sort: "newest",
      featuredBadgesOnly: true,
    }).catch(() => undefined),
  ]);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: t("title"),
    description: t("description"),
    url: new URL("/projects", origin).toString(),
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
        <ProjectsExploreClient initialPage={initialPage} />
      </Suspense>
    </>
  );
}
