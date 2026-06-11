import { Skeleton } from "@/components/ui/skeleton";

export default function ManageProjectsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="mb-5 rounded-[1.75rem] bg-muted/30 p-6">
        <Skeleton className="mb-4 h-4 w-36 rounded-full" />
        <Skeleton className="h-10 w-full max-w-lg rounded-full" />
        <Skeleton className="mt-3 h-5 w-full max-w-xl rounded-full" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex gap-3 rounded-2xl px-1 py-3 sm:gap-4 sm:px-2 sm:py-4">
            <Skeleton className="h-24 w-24 shrink-0 rounded-xl sm:h-28 sm:w-36" />
            <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
              <div className="space-y-3">
                <Skeleton className="h-6 w-3/4 rounded-full" />
                <Skeleton className="h-4 w-full rounded-full" />
                <Skeleton className="h-4 w-2/3 rounded-full" />
              </div>
              <div className="mt-3 flex justify-between border-t border-border/60 pt-2">
                <Skeleton className="h-5 w-28 rounded-full" />
                <Skeleton className="h-8 w-24 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
