import Container from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

const NAV_CARDS = ["sites", "audio", "trees", "bumicerts"];
const TABS = ["home", "bumicerts", "observations", "settings"];

export function ManageDashboardSkeleton() {
  return (
    <Container className="pt-4 pb-8 space-y-2">
      {/* Hero — mirrors EditableHero */}
      <section className="relative min-h-[260px] md:min-h-[320px] flex flex-col overflow-hidden rounded-t-4xl border-t border-border">
        {/* Cover backdrop */}
        <Skeleton className="absolute inset-0 z-0 rounded-none" />

        {/* Bottom content */}
        <div className="relative z-10 flex-1 flex flex-col justify-end px-5 pb-6 pt-24">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3 mb-3">
            {/* Logo */}
            <Skeleton className="h-24 w-24 shrink-0 rounded-full" />

            {/* Name + description */}
            <div className="max-w-3xl w-full min-w-0 space-y-2">
              <Skeleton className="h-10 w-64 max-w-full" />
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
          </div>

          {/* Pills row */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-28 rounded-full" />
            <Skeleton className="h-6 w-32 rounded-full" />
          </div>
        </div>
      </section>

      {/* Tab bar — mirrors ManageAccountTabs / AccountTabBar */}
      <div className="mt-3">
        <div className="flex items-end gap-1 border-b border-border">
          {TABS.map((tab) => (
            <div key={tab} className="px-3 py-2.5">
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>

      {/* About section */}
      <section className="py-6 md:py-8 space-y-2">
        <Skeleton className="h-4 w-full max-w-3xl" />
        <Skeleton className="h-4 w-[85%] max-w-3xl" />
        <Skeleton className="h-4 w-[60%] max-w-3xl" />
      </section>

      {/* Nav grid — mirrors ManageNavGrid */}
      <div className="pb-2">
        <Skeleton className="h-7 w-72 max-w-full" />
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {NAV_CARDS.map((card) => (
            <div
              key={card}
              className="flex flex-col gap-3 h-full p-4 rounded-2xl bg-muted/50"
            >
              {/* Icon row */}
              <div className="flex items-center justify-between">
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="size-6 rounded-md" />
              </div>
              {/* Text */}
              <div className="space-y-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}
