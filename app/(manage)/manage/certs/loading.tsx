import { BumicertCardSkeleton } from "@/components/bumicert/BumicertCard";
import { Skeleton } from "@/components/ui/skeleton";

export default function ManageBumicertsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6">
      <div className="space-y-4">
        <section className="relative overflow-hidden rounded-[1.6rem] border border-border/80 bg-card shadow-sm">
          <div className="relative flex min-h-[6rem] flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-8 lg:px-9">
            <div className="w-full space-y-2 sm:max-w-[30rem]">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-[85%]" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <Skeleton className="h-9 w-40 shrink-0 self-start rounded-md sm:self-auto" />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <BumicertCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
