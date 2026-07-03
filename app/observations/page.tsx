import type { Metadata } from "next";
import { Suspense } from "react";
import { ExploreGridPageSkeleton } from "../_components/PageLoadingSkeletons";
import { RecordExplorer } from "../_components/RecordExplorer";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Nature sightings",
  description:
    "Browse GainForest nature sightings with photos, field sound recordings, common names, and map locations.",
  alternates: { canonical: "/observations" },
};

export default function ObservationsPage() {
  return (
    <Suspense fallback={<ExploreGridPageSkeleton />}>
      <RecordExplorer kind="occurrence" enableOwnerFilter />
    </Suspense>
  );
}
