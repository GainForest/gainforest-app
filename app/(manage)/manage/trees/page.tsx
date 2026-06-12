import type { Metadata } from "next";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { TreesSection } from "../_sections";

export const metadata: Metadata = {
  title: "Manage Trees — GainForest",
  description: "Manage tree groups and nature information.",
  robots: { index: false, follow: false },
};

export default async function TreesPage() {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  return <TreesSection target={target} />;
}
