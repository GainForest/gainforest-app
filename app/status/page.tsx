import type { Metadata } from "next";
import { StatusSection } from "../_components/StatusSection";
import { fetchStatusDetailed } from "../_lib/status";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Site health",
  description:
    "Live health of the services behind Bumicerts and GainForest.",
  alternates: { canonical: "/status" },
};

export default async function StatusPage() {
  const status = await fetchStatusDetailed({ revalidate: 60 });
  return <StatusSection initial={status} />;
}
