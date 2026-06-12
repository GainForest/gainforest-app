import type { Metadata } from "next";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { ManageHomeSection } from "./_sections";

export const metadata: Metadata = {
  title: "Manage — GainForest",
  description: "Manage your GainForest profile, organizations, records, and settings.",
};

export default async function ManagePage() {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  return <ManageHomeSection target={target} wrapDashboard={false} />;
}
