import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { fetchAuthSession } from "@/app/_lib/auth-server";
import { fetchBumicertsByDid } from "@/app/_lib/indexer";
import { TimelineMotion } from "@/app/account/_components/TimelineMotion";
import { getAccountRouteData } from "@/app/account/_lib/account-route";

export const metadata: Metadata = {
  title: "Evidence Timeline — Bumicerts",
  description: "View your public evidence timeline.",
  robots: { index: false, follow: false },
};

export default async function ManageTimelinePage() {
  const session = await fetchAuthSession();
  if (!session.isLoggedIn) return null;

  const account = await getAccountRouteData(session.did, session.did);
  if (account.kind !== "organization") notFound();

  const entries = await fetchBumicertsByDid(session.did, 1000).then((page) => page.records).catch(() => []);
  const linkedWindow = entries.length ? formatLinkedWindow(entries.map((entry) => entry.createdAt)) : null;

  return (
    <TimelineMotion>
      <div className="space-y-4 py-6">
          <div className="rounded-2xl border border-border/50 bg-background p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl tracking-tight text-foreground">Linked evidence</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {entries.length} linked items{linkedWindow ? ` · ${linkedWindow}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Evidence attached to this organization appears here.</p>
              </div>
              {linkedWindow ? <p className="text-xs text-muted-foreground">{linkedWindow}</p> : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {["all", "image", "document", "link"].map((filter, index) => (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={index === 0}
                  className={index === 0
                    ? "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors border-primary bg-primary text-primary-foreground"
                    : "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground"}
                >
                  {filter[0]!.toUpperCase() + filter.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {entries.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">
              No timeline evidence yet.
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {entries.slice(0, 25).map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-sm font-medium text-foreground">{entry.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{entry.shortDescription ?? "Bumicert story activity"}</p>
                  </div>
                ))}
              </div>
              {entries.length > 25 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">Page 1 of {Math.ceil(entries.length / 25)}</p>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled aria-label="Previous page" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40">
                      <ChevronLeftIcon className="h-4 w-4" />
                    </button>
                    <button type="button" aria-label="Next page" className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40">
                      <ChevronRightIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
      </div>
    </TimelineMotion>
  );
}

function formatLinkedWindow(values: string[]): string | null {
  const dates = values.map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
  if (!dates.length) return null;
  const first = dates.reduce((current, next) => next.getTime() < current.getTime() ? next : current);
  const last = dates.reduce((current, next) => next.getTime() > current.getTime() ? next : current);
  const format = (date: Date) => date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return first.getUTCFullYear() === last.getUTCFullYear() && first.getUTCMonth() === last.getUTCMonth()
    ? format(first)
    : `${format(first)} – ${format(last)}`;
}
