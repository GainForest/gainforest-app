import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";
import { DonationsHubSkeleton } from "../_components/PageLoadingSkeletons";
import { DonationsHub } from "../_components/DonationsHub";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.dashboard.metadata");

  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

// The donations hub is gated to GainForest admins for now, so the public
// never sees this page (the sidebar entry is hidden for them too).
export default async function DonationsPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }

  return (
    <Suspense fallback={<DonationsHubSkeleton />}>
      <DonationsHub />
    </Suspense>
  );
}
