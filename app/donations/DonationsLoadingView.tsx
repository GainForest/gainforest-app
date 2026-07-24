import { Skeleton } from "@/components/ui/skeleton";

export function DonationsLoadingView() {
  return (
    <div className="-mt-14 pb-6 md:pb-8" aria-busy="true">
      <div className="min-h-[330px] bg-card">
        <div className="mx-auto max-w-6xl px-3 pb-12 pt-20 sm:px-5 lg:px-8">
          <Skeleton className="h-16 w-full max-w-2xl rounded-2xl" />
          <Skeleton className="mt-6 h-5 w-full max-w-xl rounded-full" />
          <Skeleton className="mt-3 h-5 w-2/3 max-w-lg rounded-full" />
        </div>
      </div>
      <div className="relative z-10 mx-auto max-w-6xl space-y-6 px-3 pt-6 sm:space-y-8 sm:px-5 lg:px-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-2xl bg-muted p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-5 rounded-full bg-background" />
                <Skeleton className="h-8 w-24 rounded-full bg-background" />
              </div>
              <Skeleton className="mt-3 h-4 w-3/4 rounded-full bg-background" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl bg-muted p-4 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-7 w-48 rounded-full bg-background" />
            <Skeleton className="h-9 w-52 rounded-full bg-background" />
          </div>
          <Skeleton className="mt-6 h-60 rounded-2xl bg-background" />
        </div>
        <div className="divide-y divide-border-soft rounded-2xl bg-muted px-4 sm:px-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 py-4">
              <Skeleton className="size-9 rounded-full bg-background" />
              <Skeleton className="h-4 flex-1 rounded-full bg-background" />
              <Skeleton className="h-4 w-20 rounded-full bg-background" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
