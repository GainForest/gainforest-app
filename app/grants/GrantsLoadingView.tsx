import { Skeleton } from "@/components/ui/skeleton";

export function GrantsLoadingView() {
  return (
    <div className="-mt-14 pb-6 md:pb-8" aria-busy="true">
      <div className="min-h-[330px] bg-card">
        <div className="mx-auto max-w-6xl px-3 pb-12 pt-20 sm:px-5 lg:px-8">
          <Skeleton className="h-16 w-full max-w-2xl rounded-2xl" />
          <Skeleton className="mt-6 h-5 w-full max-w-xl rounded-full" />
          <Skeleton className="mt-3 h-5 w-2/3 max-w-lg rounded-full" />
        </div>
      </div>
      <div className="relative z-10 mx-auto max-w-6xl space-y-8 px-3 pt-6 sm:px-5 lg:px-8">
        {[0, 1].map((key) => (
          <article key={key} className="rounded-2xl bg-muted p-4 sm:p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-2xl bg-background" />
              <Skeleton className="h-9 w-56 max-w-[70%] rounded-full bg-background" />
            </div>
            <Skeleton className="mt-6 h-4 w-full rounded-full bg-background" />
            <Skeleton className="mt-3 h-4 w-4/5 rounded-full bg-background" />
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-24 rounded-2xl bg-background" />
              <Skeleton className="h-24 rounded-2xl bg-background" />
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
