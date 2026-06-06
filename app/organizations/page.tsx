import type { Metadata } from "next";
import { OrganizationsClient } from "./OrganizationsClient";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Organizations — Bumicerts",
  description:
    "Browse nature steward organizations creating checked environmental impact with GainForest and Bumicerts.",
  alternates: { canonical: "/organizations" },
};

export default function OrganizationsPage() {
  return <OrganizationsClient />;
}
