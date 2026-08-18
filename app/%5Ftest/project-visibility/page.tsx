import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ProjectVisibilityExperienceClient } from "./_components/ProjectVisibilityExperienceClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.testRegistry.projectVisibility");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function ProjectVisibilityExperiencePage() {
  return <ProjectVisibilityExperienceClient />;
}
