import Container from "@/components/ui/container";
import {
  AccountHeroSkeleton,
  AccountOverviewContentSkeleton,
  AccountTabsSkeleton,
} from "./_components/AccountHeroSkeleton";

// Catches the account *layout* suspense (account/[did]/layout.tsx awaits
// getAccountRouteData for the hero + tab bar). That fetch bubbles past the
// page-level account/[did]/loading.tsx up to this boundary, so this mirrors the
// full account shell — hero, tabs, and content — instead of the generic root
// skeleton. Once the layout resolves, account/[did]/loading.tsx takes over for
// the page content during tab navigation.
export default function AccountSectionLoading() {
  return (
    <main className="w-full">
      <Container className="pt-4 pb-8">
        <AccountHeroSkeleton />
        <AccountTabsSkeleton />
        <AccountOverviewContentSkeleton />
      </Container>
    </main>
  );
}
