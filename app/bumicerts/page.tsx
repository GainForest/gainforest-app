import type { Metadata } from "next";
import { RecordExplorer } from "../_components/RecordExplorer";

export const metadata: Metadata = {
  title: "Bumicerts",
  description:
    "Browse Bumicerts; the verifiable proof-of-impact certificates communities mint on the AT Protocol, each backed by contributors and certified locations.",
  alternates: { canonical: "/bumicerts" },
};

export default function BumicertsPage() {
  return <RecordExplorer kind="bumicert" />;
}
