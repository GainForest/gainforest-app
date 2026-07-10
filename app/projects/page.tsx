import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ExploreGridPageSkeleton } from "../_components/PageLoadingSkeletons";
import { ProjectsExploreClient } from "./ProjectsExploreClient";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.projects.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/projects" },
  };
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<ExploreGridPageSkeleton />}>
      <ProjectsExploreClient />
    </Suspense>
  );
}
