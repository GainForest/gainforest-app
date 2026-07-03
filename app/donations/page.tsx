import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { DonationsHubSkeleton } from "../_components/PageLoadingSkeletons";
import { DonationsHub } from "../_components/DonationsHub";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.dashboard.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/donations" },
  };
}

export default function DonationsPage() {
  return (
    <Suspense fallback={<DonationsHubSkeleton />}>
      <DonationsHub />
    </Suspense>
  );
}
