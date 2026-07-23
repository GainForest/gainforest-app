import { Skeleton } from "@/components/ui/skeleton";

export function DashboardLoadingView() {
  return (
    <div
      className="mx-auto max-w-6xl space-y-10 px-6 pb-20 md:pb-28"
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: 4 }).map((_, sectionIndex) => (
        <section key={sectionIndex}>
          <Skeleton className="h-8 w-48 rounded-full" />
          <Skeleton className="mt-2 h-4 w-full max-w-md rounded-full" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((__, tileIndex) => (
              <div key={tileIndex} className="rounded-2xl bg-muted/60 p-4 sm:rounded-3xl sm:p-6">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-5 rounded-full" />
                  <Skeleton className="h-8 w-20 rounded-full" />
                </div>
                <Skeleton className="mt-3 h-4 w-3/4 rounded-full" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
