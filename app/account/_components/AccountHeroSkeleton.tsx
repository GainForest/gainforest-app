import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder matching the quiet account hero surface. */
export function AccountHeroSkeleton() {
  return (
    <section className="overflow-hidden rounded-3xl bg-muted/40" aria-hidden>
      <div className="relative h-32 sm:h-40 md:h-44">
        <Skeleton className="absolute inset-0 rounded-none" />
        <div className="absolute right-3 top-3 z-10"><Skeleton className="h-9 w-24 rounded-full" /></div>
      </div>
      <div className="relative z-10 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="-mt-12 flex flex-col gap-4 md:flex-row md:items-end md:gap-5">
          <Skeleton className="size-24 shrink-0 rounded-full ring-4 ring-background" />
          <div className="min-w-0 max-w-2xl space-y-2.5 md:flex-1 md:pb-1">
            <Skeleton className="h-9 w-56 max-w-full md:h-10" />
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-3.5 w-44 max-w-full" />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-9 rounded-full" />
        </div>
      </div>
    </section>
  );
}

/** Loading placeholder for the account tab bar without changing its order. */
export function AccountTabsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mt-3" aria-hidden>
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

export function OverviewFoldersSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex min-h-20 items-center gap-3 rounded-2xl bg-muted/65 px-4 py-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-3.5 w-10" /></div>
        </div>
      ))}
    </div>
  );
}

/** Loading placeholder for the default account overview content. */
export function AccountOverviewContentSkeleton() {
  return (
    <div className="space-y-5 py-2" aria-hidden>
      <OverviewFoldersSkeleton />
      <section className="rounded-2xl bg-muted p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3.5 w-64 max-w-full" />
        </div>
        <Skeleton className="mt-3 h-9 w-36 rounded-full sm:mt-0" />
      </section>
    </div>
  );
}
