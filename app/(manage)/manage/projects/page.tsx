import type { Metadata } from "next";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { ProjectsSection } from "../_sections";

export const metadata: Metadata = {
  title: "Manage Projects — GainForest",
  description: "Create and manage project collections for your Bumicerts.",
  robots: { index: false, follow: false },
};

export default async function ManageProjectsPage() {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  return <ProjectsSection target={target} />;
}
