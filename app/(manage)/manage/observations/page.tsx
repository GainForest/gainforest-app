import type { Metadata } from "next";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { ObservationsSection } from "../_sections";

export const metadata: Metadata = {
  title: "Manage Observations — GainForest",
  description: "Browse biodiversity observations published by your organization.",
  robots: { index: false, follow: false },
};

export default async function ManageObservationsPage() {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  return <ObservationsSection target={target} />;
}
