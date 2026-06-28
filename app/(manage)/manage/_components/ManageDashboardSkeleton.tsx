import Container from "@/components/ui/container";
import { AccountHeroSkeleton, OverviewFoldersSkeleton } from "@/app/account/_components/AccountHeroSkeleton";

/**
 * Loading placeholder for the manage dashboard. The dashboard now renders the
 * same card-style editable hero as the public profile, followed by the
 * folder-tile overview (projects / observations / sites / trees / audio), so
 * this mirrors that shape rather than the old full-bleed hero + nav-card grid.
 */
export function ManageDashboardSkeleton() {
  return (
    <Container className="space-y-6 pt-4 pb-12">
      <AccountHeroSkeleton />
      <OverviewFoldersSkeleton count={5} />
    </Container>
  );
}
