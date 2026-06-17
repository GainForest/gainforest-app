import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { resolvePersonalManageTarget } from "@/app/_lib/manage-server";
import { ProjectsSection } from "../_sections";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.manageProjects.metadata");
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export default async function ManageProjectsPage() {
  const target = await resolvePersonalManageTarget();
  if (!target) return null;
  return <ProjectsSection target={target} />;
}
