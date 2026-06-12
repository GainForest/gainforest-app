import type { Metadata } from "next";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { SitesSection } from "../_sections";

export const metadata: Metadata = {
  title: "Manage Sites — GainForest",
  description: "Manage your certified field locations.",
  robots: { index: false, follow: false },
};

export default async function SitesPage() {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  return <SitesSection target={target} />;
}
