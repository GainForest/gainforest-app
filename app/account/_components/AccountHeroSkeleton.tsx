import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for the identity header shared by every tab. */
export function AccountProfileHeroSkeleton() {
  return (
    <section className="flex items-start gap-4 pt-1 sm:gap-5">
      <Skeleton className="size-14 shrink-0 rounded-2xl sm:size-[68px]" />
      <div className="min-w-0 flex-1 space-y-2.5">
        <Skeleton className="h-8 w-56 max-w-full sm:h-9" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="size-9 rounded-full" />
      </div>
    </section>
  );
}

/**
 * Loading placeholder that mirrors the full editable manage hero: a cover
 * band, an overlapping
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

/** Loading placeholder for {@link AccountTabBar} — plain text tabs. */
export function AccountTabsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mt-5">
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-hidden">
        <div className="flex min-w-max items-end gap-5 border-b border-border">
          {Array.from({ length: count }).map((_, index) => (
            <div key={index} className="pb-2.5 pt-1">
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
 * Loading placeholder for the account Overview: the record stream on the left
 * and the profile column on the right. Shared by the account section's
 * full-shell loading and the per-tab page loading so the two transitions line
 * up without a jump.
 */
export function AccountOverviewContentSkeleton() {
  return (
    <div className="mt-8 flex flex-col-reverse gap-10 lg:flex-row lg:gap-12">
      <div className="min-w-0 flex-1 space-y-5 border-t border-border/60 pt-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-1.5 sm:flex-row sm:gap-6">
            <Skeleton className="h-4 w-20 sm:shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      <aside className="space-y-6 lg:w-[20rem] lg:shrink-0 xl:w-[22rem]">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-5/6" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
      </aside>
    </div>
  );
}
