import { Skeleton } from "@/components/ui/skeleton";

export function GrantsLoadingView() {
  return (
    <div className="-mt-14 pb-20 md:pb-28" aria-busy="true">
      <div className="min-h-[330px] bg-card px-8 pt-[86px] sm:px-10">
        <div className="mx-auto max-w-6xl">
          <Skeleton className="h-16 w-full max-w-2xl rounded-2xl" />
          <Skeleton className="mt-7 h-5 w-full max-w-xl rounded-full" />
          <Skeleton className="mt-3 h-5 w-2/3 max-w-lg rounded-full" />
        </div>
      </div>
      <div className="relative z-10 mx-auto -mt-8 max-w-6xl space-y-6 px-6 pt-6">
        {[0, 1].map((key) => (
          <article key={key} className="rounded-2xl bg-muted p-6 sm:p-8">
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
