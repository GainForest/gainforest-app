import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RewildingMilestonesExperienceClient } from "./_components/RewildingMilestonesExperienceClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.testRegistry.rewildingMilestones");
  return { title: t("title"), description: t("description") };
}

export default function Page() {
  return <RewildingMilestonesExperienceClient />;
}
