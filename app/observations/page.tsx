import type { Metadata } from "next";
import { RecordExplorer } from "../_components/RecordExplorer";

export const metadata: Metadata = {
  title: "Species observations",
  description:
    "Browse Darwin Core occurrence records from the GainForest data commons; photos, bioacoustics, taxonomy, and coordinates signed on the AT Protocol.",
  alternates: { canonical: "/observations" },
};

export default function ObservationsPage() {
  return <RecordExplorer kind="occurrence" />;
}
