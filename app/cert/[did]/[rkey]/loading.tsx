import { Skeleton } from "@/components/ui/skeleton";

export default function BumicertDetailLoading() {
  return (
    <main className="min-h-screen bg-background pb-20">
      <section className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-8">
        {/* Overview sidebar */}
        <aside className="min-w-0">
          <div className="space-y-4 lg:sticky lg:top-28">
            {/* Owner row */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            </div>

            {/* Cover image */}
            <Skeleton className="aspect-[4/3] w-full rounded-3xl" />

            <div className="h-px w-full bg-border" />

            {/* About organization */}
            <div className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        </aside>

        {/* Overview panel */}
        <div className="min-w-0">
          <article className="space-y-6 py-1">
            {/* Title */}
            <div className="space-y-3">
              <Skeleton className="h-10 w-full max-w-md md:h-12" />
              <Skeleton className="h-10 w-2/3 max-w-sm md:h-12" />
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2.5">
              <Skeleton className="h-7 w-24 rounded-full" />
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>

            {/* Description */}
            <div className="space-y-3">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-[92%]" />
              <Skeleton className="h-5 w-3/4" />
            </div>

            {/* Observations gallery */}
            <div className="space-y-4 border-t border-border pt-6">
              <Skeleton className="h-4 w-40" />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="aspect-square w-full rounded-2xl" />
                ))}
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
