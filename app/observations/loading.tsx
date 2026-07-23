import { Skeleton } from "@/components/ui/skeleton";

export default function ObservationsLoading() {
  return (
    <main className="min-h-screen bg-background pb-20" aria-busy="true" aria-live="polite">
      <section className="-mt-14 min-h-[360px] overflow-hidden border-b border-border/60 bg-muted/60">
        <div className="mx-auto flex min-h-[360px] max-w-6xl items-end px-6 pb-12 pt-28 lg:px-8">
          <div className="w-full max-w-2xl space-y-4">
            <Skeleton className="h-14 w-full max-w-xl" />
            <Skeleton className="h-5 w-full max-w-lg rounded-full" />
            <Skeleton className="h-5 w-2/3 max-w-md rounded-full" />
          </div>
        </div>
      </section>
      <section className="relative z-10 mx-auto -mt-5 max-w-6xl px-6 lg:px-8">
        <div className="flex items-center gap-2 rounded-full border border-border bg-background/90 p-2 shadow-sm backdrop-blur">
          <Skeleton className="h-10 min-w-0 flex-1 rounded-full" />
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <Skeleton className="size-10 shrink-0 rounded-full" />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 18 }).map((_, index) => (
            <Skeleton key={index} className="aspect-square rounded-lg" />
          ))}
        </div>
      </section>
    </main>
  );
}
