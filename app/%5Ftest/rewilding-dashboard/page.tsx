import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { RewildingDashboardExperienceClient } from "./_components/RewildingDashboardExperienceClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cart.testRegistry.rewildingDashboard");
  return {
    title: t("title"),
    description: t("description"),
  };
}

/**
 * Unlike the rest of the registry, this experience is gated to GainForest
 * admin-group members while the grantee dashboard is still being designed —
 * the flow shows unreleased product direction, so it should not be walkable by
 * anyone who happens to find the URL. The registry index hides its card for
 * everyone else, so the link is never advertised into a 404.
 */
export default async function TestRewildingDashboardPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  return <RewildingDashboardExperienceClient />;
}
