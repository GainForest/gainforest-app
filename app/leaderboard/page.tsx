import type { Metadata } from "next";
import { LeaderboardClient } from "./LeaderboardClient";

export const metadata: Metadata = {
  title: "Leaderboard — Bumicerts",
  description:
    "See the top donors making an impact on Bumicerts. Our Impact Champions are ranked by their total funding contributions.",
  alternates: { canonical: "/leaderboard" },
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
