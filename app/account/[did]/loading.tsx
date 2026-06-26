import { BumicertCardSkeleton } from "@/components/bumicert/BumicertCard";
import { Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <div className="space-y-5 py-2">
      {/* Overview stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-border bg-card/80 p-4">
            <Skeleton className="size-9 rounded-xl" />
            <Skeleton className="mt-3 h-7 w-12" />
            <Skeleton className="mt-2 h-3.5 w-16" />
          </div>
        ))}
      </div>

      {/* Content grid */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] items-stretch gap-5">
        {Array.from({ length: 6 }).map((_, index) => (
          <BumicertCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
