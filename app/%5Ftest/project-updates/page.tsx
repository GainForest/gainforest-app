import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectUpdatesExperienceClient } from "./_components/ProjectUpdatesExperienceClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.testRegistry.projectUpdates");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function ProjectUpdatesExperiencePage() {
  return <ProjectUpdatesExperienceClient />;
}
