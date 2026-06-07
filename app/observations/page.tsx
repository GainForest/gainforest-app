import type { Metadata } from "next";
import { RecordExplorer } from "../_components/RecordExplorer";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Species observations",
  description:
    "Browse GainForest nature sightings with photos, sounds, species names, and map locations.",
  alternates: { canonical: "/observations" },
};

export default function ObservationsPage() {
  return <RecordExplorer kind="occurrence" />;
}
