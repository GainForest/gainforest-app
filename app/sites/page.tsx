import type { Metadata } from "next";
import { RecordExplorer } from "../_components/RecordExplorer";

export const metadata: Metadata = {
  title: "Project sites",
  description:
    "Browse the organizations and communities stewarding land in the GainForest data commons, with their cover imagery, country, and on-chain identity.",
  alternates: { canonical: "/sites" },
};

export default function SitesPage() {
  return <RecordExplorer kind="site" />;
}
