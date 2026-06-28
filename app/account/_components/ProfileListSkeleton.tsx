/**
 * Navigation skeleton for the profile list sub-pages (Followers / Following and
 * Posts / Replies / Likes). Matching the destination shape — a segmented toggle
 * over a list — keeps the content area from flashing the Overview folder grid
 * (the default `[did]/loading.tsx`) on the way in.
 */
export function ProfileListSkeleton({
  tabs = 2,
  variant = "people",
}: {
  tabs?: number;
  variant?: "people" | "activity";
}) {
  return (
    <section className="py-6">
      <div className="mb-5 inline-flex gap-1 rounded-full border border-border bg-card p-1">
        {Array.from({ length: tabs }).map((_, index) => (
          <span key={index} className="skeleton h-8 w-24 rounded-full" />
        ))}
      </div>
      <ul className="divide-y divide-border/60">
        {Array.from({ length: 6 }).map((_, index) =>
          variant === "people" ? (
            <li key={index} className="flex items-center gap-3 py-3">
              <span className="skeleton size-9 shrink-0 rounded-full" />
              <span className="skeleton h-4 w-40 max-w-[55%] rounded" />
              <span className="skeleton ml-auto h-8 w-[92px] shrink-0 rounded-full" />
            </li>
          ) : (
            <li key={index} className="space-y-2 py-3.5">
              <span className="skeleton block h-4 w-3/4 rounded" />
              <span className="skeleton block h-3 w-1/3 rounded" />
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
