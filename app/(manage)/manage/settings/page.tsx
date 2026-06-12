import type { Metadata } from "next";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { SettingsSection } from "../_sections";

export const metadata: Metadata = {
  title: "Settings — GainForest",
  description: "Manage your GainForest account settings.",
  robots: { index: false, follow: false },
};

export default async function ManageSettingsPage() {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  return <SettingsSection target={target} />;
}
