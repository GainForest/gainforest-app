import { redirect } from "next/navigation";

// The leaderboard now lives as a tab inside the Donations hub. Keep this route
// working for existing links/bookmarks by forwarding into that view.
export default function LeaderboardPage() {
  redirect("/donations?view=leaderboard");
}
