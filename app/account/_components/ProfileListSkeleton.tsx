import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ProfileSegment = {
  href: string;
  label: ReactNode;
  active: boolean;
  count?: ReactNode;
};

/** Keep page deduplication outside React state updaters so enrichment runs exactly once. */
export function takeFreshProfileItems<T>(
  page: T[],
  seen: Set<string>,
  keyOf: (item: T) => string,
): T[] {
  const fresh: T[] = [];
  for (const item of page) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(item);
  }
  return fresh;
}

/** Stable identity for paged profile views. Changing the account or view remounts the state machine. */
export function profileListIdentity(did: string, view: string): string {
  return `${did}:${view}`;
}

/** Shared muted segmented navigation for profile activity, connections, and gallery subviews. */
export function ProfileSegmentedNavigation({
  segments,
  ariaLabel,
  className,
}: {
  segments: ProfileSegment[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <nav aria-label={ariaLabel} className={cn("mb-5 inline-flex rounded-full bg-muted p-1", className)}>
      {segments.map((segment) => (
        <Link
          key={segment.href}
          href={segment.href}
          aria-current={segment.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none",
            segment.active
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {segment.label}
          {segment.count}
        </Link>
      ))}
    </nav>
  );
}

export function ProfileRowsSkeleton({ variant = "people" }: { variant?: "people" | "activity" }) {
  return (
    <ul className="divide-y divide-border/60" aria-hidden>
      {Array.from({ length: 6 }).map((_, index) =>
        variant === "people" ? (
          <li key={index} className="flex items-center gap-3 py-3">
            <span className="skeleton size-9 shrink-0 rounded-full" />
            <span className="skeleton h-4 w-40 max-w-[55%] rounded" />
            <span className="skeleton ml-auto h-9 w-[92px] shrink-0 rounded-full" />
          </li>
        ) : (
          <li key={index} className="space-y-2 py-4">
            <span className="skeleton block h-4 w-3/4 rounded" />
            <span className="skeleton block h-3 w-1/3 rounded" />
          </li>
        ),
      )}
    </ul>
  );
}

/** Route and in-view skeleton matching the shared segmented/list presentation. */
export function ProfileListSkeleton({
  tabs = 2,
  variant = "people",
}: {
  tabs?: number;
  variant?: "people" | "activity";
}) {
  return (
    <section className="py-6">
      <div className="mb-5 inline-flex gap-1 rounded-full bg-muted p-1" aria-hidden>
        {Array.from({ length: tabs }).map((_, index) => (
          <span key={index} className="skeleton h-9 w-24 rounded-full" />
        ))}
      </div>
      <ProfileRowsSkeleton variant={variant} />
    </section>
  );
}

export function GalleryContentSkeleton() {
  return (
    <section className="py-6" aria-hidden>
      <div className="mb-6 inline-flex gap-1 rounded-full bg-muted p-1">
        <span className="skeleton h-9 w-24 rounded-full" />
        <span className="skeleton h-9 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <span key={index} className="skeleton aspect-[4/3] rounded-xl" />
        ))}
      </div>
    </section>
  );
}

export function EndorsementsContentSkeleton() {
  return (
    <section className="py-6" aria-hidden>
      <span className="skeleton block h-7 w-52 rounded" />
      <span className="skeleton mt-3 block h-4 w-80 max-w-full rounded" />
      <div className="mt-6 divide-y divide-border/60">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 py-4">
            <span className="skeleton size-12 rounded-full" />
            <span className="skeleton h-5 w-48 rounded" />
          </div>
        ))}
      </div>
    </section>
  );
}
