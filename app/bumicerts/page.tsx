import type { Metadata } from "next";
import { RecordExplorer } from "../_components/RecordExplorer";

export const metadata: Metadata = {
  title: "Bumicerts",
  description:
    "Browse org.hypercerts.claim.activity records from the GainForest indexer: title, contributors, certified locations, and cover image.",
  alternates: { canonical: "/bumicerts" },
};

export default function BumicertsPage() {
  return <RecordExplorer kind="bumicert" />;
}
