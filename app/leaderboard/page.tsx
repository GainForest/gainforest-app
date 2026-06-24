import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LeaderboardClient } from "./LeaderboardClient";

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketplace.leaderboard.metadata");

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/leaderboard" },
  };
}

export default function LeaderboardPage() {
  return (
    <Suspense fallback={null}>
      <LeaderboardClient />
    </Suspense>
  );
}
