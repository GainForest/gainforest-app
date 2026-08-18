import Container from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";

export function SitesSkeleton() {
  return (
    <Container className="pt-4 pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-8 w-28 rounded-full" />
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="rounded-xl border border-border overflow-hidden bg-background"
          >
            {/* Card header */}
            <div className="flex items-center justify-between gap-2 px-3 h-10 border-b border-border">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
            {/* Card body */}
            <div className="px-3 py-2.5 flex flex-col gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
