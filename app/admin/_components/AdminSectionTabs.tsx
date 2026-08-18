"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AdminOnlyIndicator } from "@/app/_components/AdminOnlyIndicator";
import { cn } from "@/lib/utils";

export type AdminSectionTab = {
  id: string;
  label: string;
  /** Rendered on the server (a React element, not a component) so this stays
   *  passable across the server/client boundary. */
  icon: ReactNode;
  /** Optional so panels that load their own data lazily (e.g. wallet
   *  connections) can omit a badge rather than show a wrong count. */
  count?: number;
  content: ReactNode;
};

/**
 * The pill bar at the top of every admin page: one button per panel on that
 * page, so switching views is a click instead of a scroll. The active pill is
 * mirrored into the URL (?tab=…) so a view stays linkable and survives a
 * refresh — the same contract the old single-page /admin tab bar had.
 *
 * Each page's panels are already rendered server-side and handed over as
 * `content`; this only chooses which one is on screen.
 */
export function AdminSectionTabs({
  tabs,
  initialTab,
  ariaLabel,
}: {
  tabs: AdminSectionTab[];
  /** Usually the `?tab=` search param; ignored when it isn't on this page. */
  initialTab?: string;
  ariaLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const fallback = tabs[0]?.id ?? "";
  const [tab, setTab] = useState<string>(
    initialTab && tabs.some((entry) => entry.id === initialTab) ? initialTab : fallback,
  );

  function selectTab(next: string) {
    setTab(next);
    router.replace(`${pathname}?tab=${next}`, { scroll: false });
  }

  const active = tabs.find((entry) => entry.id === tab) ?? tabs[0];

  return (
    <section>
      {tabs.length > 1 ? (
        <div
          role="tablist"
          aria-label={ariaLabel}
          className="mb-5 flex gap-1.5 overflow-x-auto rounded-full border border-border bg-muted/40 p-1.5"
        >
          {tabs.map((entry) => {
            const isActive = entry.id === active?.id;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectTab(entry.id)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
                )}
              >
                {entry.icon}
                {entry.label}
                <AdminOnlyIndicator />
                {entry.count !== undefined ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      isActive ? "bg-primary-foreground/20" : "bg-muted",
                    )}
                  >
                    {entry.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {active?.content}
    </section>
  );
}
