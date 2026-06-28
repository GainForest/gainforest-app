import Container from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export function TreesManageSkeleton() {
  return (
    <Container className="pt-4 pb-8 space-y-6">
      {/* Header — mirrors the Trees client title row */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-80 max-w-[70vw]" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Toolbar: search + record count */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Skeleton className="h-10 w-full sm:max-w-sm lg:flex-1" />
        <Skeleton className="h-4 w-32 shrink-0" />
      </div>

      {/* Tree-group card grid — mirrors DatasetLandingSection */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <article key={index} className="flex h-full flex-col rounded-2xl border border-border bg-background p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-40 max-w-full" />
              </div>
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
            </div>
            <div className="mt-5 space-y-3">
              {Array.from({ length: 3 }).map((_, row) => (
                <div key={row} className="flex items-center gap-2">
                  <Skeleton className="size-4 shrink-0 rounded-sm" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between gap-2 border-t border-border/70 pt-4">
              <Skeleton className="h-8 w-32 rounded-full" />
            </div>
          </article>
        ))}
      </div>
    </Container>
  );
}
