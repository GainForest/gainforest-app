import type { Metadata } from "next";
import { StatusSection } from "../_components/StatusSection";
import { fetchStatusDetailed } from "../_lib/status";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "System status",
  description:
    "Live status of the PDS instances, indexer, labeller, and apps behind the GainForest data commons, mirrored from the GainForest status page.",
  alternates: { canonical: "/status" },
};

export default async function StatusPage() {
  const status = await fetchStatusDetailed({ revalidate: 60 });
  return <StatusSection initial={status} />;
}
