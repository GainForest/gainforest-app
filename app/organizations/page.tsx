import type { Metadata } from "next";
import { fetchSites } from "../_lib/indexer";
import { OrganizationsClient } from "./OrganizationsClient";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Organizations — Bumicerts",
  description:
    "Browse nature steward organizations creating checked environmental impact with GainForest and Bumicerts.",
  alternates: { canonical: "/organizations" },
};

export default async function OrganizationsPage() {
  const page = await fetchSites(1000, null);
  return <OrganizationsClient records={page.records} />;
}
