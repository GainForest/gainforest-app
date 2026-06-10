import type { Metadata } from "next";
import { Suspense } from "react";
import { LeaderboardClient } from "./LeaderboardClient";

export const metadata: Metadata = {
  title: "Leaderboard — GainForest",
  description:
    "See the top donors making an impact on GainForest. Our Impact Champions are ranked by their total funding contributions.",
  alternates: { canonical: "/leaderboard" },
};

export default function LeaderboardPage() {
  return (
    <Suspense fallback={null}>
      <LeaderboardClient />
    </Suspense>
  );
}
