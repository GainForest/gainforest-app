import { Skeleton } from "@/components/ui/skeleton";
import Container from "@/components/ui/container";

export function AudioSkeleton() {
  return (
    <Container className="pt-4 pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-32 rounded-full" />
      </div>
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 flex-1 max-w-xs rounded-md" />
        <Skeleton className="h-9 w-24 rounded-md" />
        <Skeleton className="h-9 w-20 rounded-lg" />
      </div>
      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </Container>
  );
}
