import { AccountOverviewContentSkeleton } from "../_components/AccountHeroSkeleton";

// Shown for the account content area while a tab's data loads (the hero + tab
// bar come from the already-resolved layout). Mirrors the default Overview tab —
// the folder-tile grid plus the share-profile card — so the landing route never
// jumps when the real content paints.
export default function AccountLoading() {
  return <AccountOverviewContentSkeleton />;
}
