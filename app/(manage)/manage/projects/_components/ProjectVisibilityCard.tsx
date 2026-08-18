"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheckIcon, BinocularsIcon, GlobeIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { manageApiHref, type ManageTarget } from "@/lib/links";

/** What the server can tell us about this account: whether it currently shows
 *  on the explore pages, and whether that can be changed from here. */
export type ProjectVisibilityStatus = { available: boolean; published: boolean };

/** The two calls this card makes. The `/_test` registry passes fixtures so the
 *  real card can be previewed without touching the live publishing service;
 *  production leaves it undefined and the card talks to the server itself. */
export type ProjectVisibilityAdapter = {
  loadStatus: () => Promise<ProjectVisibilityStatus | null>;
  /** Resolves once the account is listed; rejects with the message to show. */
  publish: () => Promise<void>;
};

/**
 * Where this account's projects can be seen.
 *
 * Two different things used to be conflated here. A saved project is public
 * the moment it exists: its page opens for anyone with the link, it shows on
 * the account's own page and in search, and it goes into the sitemap. What the
 * button actually changes is narrower — the browse/explore lists only show
 * accounts holding a featured badge (see `app/_lib/publish-org.ts`), so a new
 * account is missing from them until an owner/admin adds itself.
 *
 * So the card states the always-true part first and never claims the button
 * decides it, and it always shows which of the two listing states the account
 * is in without anyone pressing anything. When the listing action isn't a real
 * choice (not configured, or the viewer is a plain member), the button is left
 * out rather than rendered dead.
 */
export function ProjectVisibilityCard({
  target,
  adapter,
}: {
  target: ManageTarget;
  /** Must be stable across renders (module constant or memo) — the status
   *  lookup re-runs whenever it changes. */
  adapter?: ProjectVisibilityAdapter;
}) {
  const t = useTranslations("marketplace.manageProjects.publish");
  // `state` is only about whether the listing status could be read at all;
  // `listed` is the status itself, and `available` whether it can be changed
  // from here. Keeping them apart means an account still learns where it
  // stands on a server that can't perform the change.
  const [state, setState] = useState<"loading" | "ready" | "unknown">("loading");
  const [listed, setListed] = useState(false);
  const [available, setAvailable] = useState(false);
  const [justListed, setJustListed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Listing exposes the whole organization on the explore pages — owner/admin only.
  const allowed = target.kind !== "group" || target.role === "owner" || target.role === "admin";

  useEffect(() => {
    let cancelled = false;
    const load = adapter
      ? adapter.loadStatus()
      : fetch(manageApiHref("/api/manage/publish", target), { cache: "no-store" }).then((response) =>
          response.ok ? (response.json() as Promise<ProjectVisibilityStatus>) : null,
        );
    load
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setState("unknown");
          return;
        }
        setListed(Boolean(data.published));
        setAvailable(Boolean(data.available));
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("unknown");
      });
    return () => {
      cancelled = true;
    };
  }, [target, adapter]);

  const publish = async () => {
    if (!allowed || publishing) return;
    setPublishing(true);
    setError(null);
    try {
      if (adapter) {
        await adapter.publish();
      } else {
        const response = await fetch(manageApiHref("/api/manage/publish", target), { method: "POST", cache: "no-store" });
        const data = (await response.json().catch(() => null)) as { published?: boolean; error?: string } | null;
        if (!response.ok || !data?.published) throw new Error(data?.error || t("error"));
      }
      setListed(true);
      setJustListed(true);
    } catch (caught) {
      setError((caught as Error).message || t("error"));
    } finally {
      setPublishing(false);
    }
  };

  // Nothing is claimed until the listing status is known.
  if (state === "loading") return null;

  const known = state === "ready";
  const canAct = known && allowed && available && !listed;

  return (
    <div className={cn("rounded-2xl border px-4 py-3", listed ? "border-primary/25 bg-primary/5" : "border-border bg-background/70")}>
      <div className="flex min-w-0 items-start gap-3">
        <GlobeIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{t("alwaysPublicTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("alwaysPublicBody")}</p>
        </div>
      </div>

      {known ? (
        <div
          className="mt-3 flex flex-col gap-3 border-t border-border/60 pt-3 sm:flex-row sm:items-center sm:justify-between"
          role="status"
          aria-live="polite"
        >
          <div className="flex min-w-0 items-start gap-3">
            {listed ? (
              <BadgeCheckIcon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            ) : (
              <BinocularsIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{listed ? t("listedTitle") : t("unlistedTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {justListed ? t("justListedBody") : listed ? t("listedBody") : t("unlistedBody")}
              </p>
            </div>
          </div>
          {canAct ? (
            <Button type="button" onClick={() => void publish()} disabled={publishing} className="shrink-0">
              {publishing ? <Loader2Icon className="animate-spin" /> : <GlobeIcon />}
              {publishing ? t("publishing") : t("action")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {!known ? <p className="mt-2 text-xs text-muted-foreground">{t("statusUnknown")}</p> : null}
      {known && !listed && !allowed ? <p className="mt-2 text-xs text-muted-foreground">{t("memberBlocked")}</p> : null}
      {known && !listed && allowed && !available ? (
        <p className="mt-2 text-xs text-muted-foreground">{t("unavailable")}</p>
      ) : null}
      {error ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
          <TriangleAlertIcon className="h-3.5 w-3.5" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
