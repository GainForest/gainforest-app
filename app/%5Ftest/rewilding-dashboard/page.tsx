import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RewildingDashboardExperienceClient } from "./_components/RewildingDashboardExperienceClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.testRegistry.rewildingDashboard");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function RewildingDashboardExperiencePage() {
  return <RewildingDashboardExperienceClient />;
}
