import { notFound, redirect } from "next/navigation";
import { getGainForestModeratorAccess } from "@/app/internal/badges/_lib/access";

// The leaderboard lives as a tab inside the Donations hub, which is gated to
// GainForest admins for now — so this alias is gated the same way. Admin
// links/bookmarks keep working by forwarding into that view.
export default async function LeaderboardPage() {
  const moderator = await getGainForestModeratorAccess().catch(() => null);
  if (!moderator?.isModerator) {
    notFound();
  }
  redirect("/donations?view=leaderboard");
}
