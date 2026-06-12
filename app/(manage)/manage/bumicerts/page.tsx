import type { Metadata } from "next";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { BumicertsSection } from "../_sections";

export const metadata: Metadata = {
  title: "Manage Bumicerts — GainForest",
  description: "Review your recent Bumicerts and drafts.",
  robots: { index: false, follow: false },
};

export default async function ManageBumicertsPage() {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  return <BumicertsSection target={target} />;
}
