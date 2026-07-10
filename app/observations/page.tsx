import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ExploreGridPageSkeleton } from "../_components/PageLoadingSkeletons";
import { RecordExplorer } from "../_components/RecordExplorer";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.observations.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/observations" },
  };
}

export default function ObservationsPage() {
  return (
    <Suspense fallback={<ExploreGridPageSkeleton />}>
      <RecordExplorer kind="occurrence" enableOwnerFilter />
    </Suspense>
  );
}
