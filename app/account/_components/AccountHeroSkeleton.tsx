import { Skeleton } from "@/components/ui/skeleton";

/**
 * Loading placeholder that mirrors the card-style account hero shared by
 * {@link AccountHero} and {@link EditableHero}: a cover band, an overlapping
 * round avatar, the name + bio block, and the wrapping row of detail pills.
 * Keeping this in lockstep with those components avoids a layout jump when the
 * real hero hydrates.
 */
export function AccountHeroSkeleton() {
  return (
    <section className="overflow-hidden rounded-3xl border border-border/60 bg-card">
      {/* Cover band */}
      <div className="relative h-32 sm:h-40 md:h-44">
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </div>

      {/* Identity */}
      <div className="relative z-10 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="-mt-12 flex flex-col gap-4 md:flex-row md:items-end md:gap-5">
          <Skeleton className="size-24 shrink-0 rounded-full ring-4 ring-card" />
          <div className="min-w-0 max-w-2xl space-y-2.5 md:flex-1 md:pb-1">
            <Skeleton className="h-9 w-56 max-w-full md:h-10" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        </div>

        {/* Detail pills */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </div>
    </section>
  );
}

/** Loading placeholder for {@link AccountTabBar} — icon + label tabs. */
export function AccountTabsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="mt-3">
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-hidden">
        <div className="flex min-w-max items-end gap-1 border-b border-border">
          {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="flex items-center gap-1.5 px-3 py-2.5">
              <Skeleton className="size-3.5 rounded-sm" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A single folder-tile skeleton mirroring {@link OverviewFolders}'s `Folder`. */
function OverviewFolderSkeleton() {
  return (
    <div className="relative pt-7">
      <div className="absolute left-0 top-[12px] z-20 h-[19px] w-[42%] rounded-t-lg border border-b-0 border-border/60 bg-card" />
      <div className="relative z-10 flex min-h-[86px] flex-col justify-end rounded-[18px] rounded-tl-none border border-border/60 bg-card p-3.5">
        <Skeleton className="h-7 w-10" />
        <Skeleton className="mt-1.5 h-3.5 w-16" />
      </div>
    </div>
  );
}

/** Loading placeholder for the {@link OverviewFolders} tile grid. */
export function OverviewFoldersSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <OverviewFolderSkeleton key={index} />
      ))}
    </div>
  );
}

/**
 * Loading placeholder for the default account overview tab: the folder-tile
 * grid followed by the share-profile card. Shared by the account section's
 * full-shell loading and the per-tab page loading so the two transitions line
 * up without a jump.
 */
export function AccountOverviewContentSkeleton() {
  return (
    <div className="space-y-5 py-2">
      <OverviewFoldersSkeleton />
      <section className="rounded-2xl border border-border bg-card/80 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
        <Skeleton className="mt-3 h-9 w-36 rounded-full sm:mt-0" />
      </section>
    </div>
  );
}
