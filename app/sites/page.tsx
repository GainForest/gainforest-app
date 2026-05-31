import type { Metadata } from "next";
import { RecordExplorer } from "../_components/RecordExplorer";

export const metadata: Metadata = {
  title: "Project sites",
  description:
    "Browse app.gainforest.organization.info records from the GainForest indexer: display name, country, and cover/logo blobs.",
  alternates: { canonical: "/sites" },
};

export default function SitesPage() {
  return <RecordExplorer kind="site" />;
}
