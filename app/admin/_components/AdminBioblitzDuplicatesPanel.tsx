"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MergeIcon,
  ScanSearchIcon,
  StarIcon,
  Undo2Icon,
  ZapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { accountPath } from "@/app/account/_lib/account-route";
import type {
  BioblitzDuplicateClusterView,
  BioblitzDuplicateReport,
} from "@/app/admin/_lib/bioblitz-duplicates";
import { cn } from "@/lib/utils";

const AUTO_MERGE_BUSY_KEY = "__auto__";

type MergeFilter = "all" | "unmerged" | "merged";

/** A steward's fine-grained tweaks to one suggested cluster, before merging. */
type ClusterAdjustment = {
  /** Star: the observation that should keep counting. */
  canonicalUri?: string;
  /** Toggles: observations excluded from the merge. */
  excludedUris?: string[];
};

/** The merge this cluster's controls would perform right now. */
type EffectiveSelection = {
  canonicalUri: string;
  /** URIs that would stop counting. */
  duplicateUris: string[];
  excluded: Set<string>;
  /** True when the active merge already matches this exact selection, which
   *  turns the action button into "undo". */
  matchesActiveMerge: boolean;
};

function effectiveSelection(
  cluster: BioblitzDuplicateClusterView,
  adjustment: ClusterAdjustment | undefined,
): EffectiveSelection {
  const memberUris = new Set(cluster.observations.map((observation) => observation.uri));
  const canonicalUri =
    adjustment?.canonicalUri && memberUris.has(adjustment.canonicalUri)
      ? adjustment.canonicalUri
      : cluster.canonicalUri;
  const excluded = new Set(
    (adjustment?.excludedUris ?? []).filter((uri) => memberUris.has(uri) && uri !== canonicalUri),
  );
  const duplicateUris = cluster.observations
    .filter((observation) => observation.uri !== canonicalUri && !excluded.has(observation.uri))
    .map((observation) => observation.uri);

  const currentlyMerged = new Set(
    cluster.observations.filter((observation) => observation.mergedAway).map((o) => o.uri),
  );
  const matchesActiveMerge =
    Boolean(cluster.merge) &&
    canonicalUri === cluster.canonicalUri &&
    duplicateUris.length === currentlyMerged.size &&
    duplicateUris.every((uri) => currentlyMerged.has(uri));

  return { canonicalUri, duplicateUris, excluded, matchesActiveMerge };
}

async function loadReport(roundId: number, signal: AbortSignal): Promise<BioblitzDuplicateReport> {
  const response = await fetch(`/api/admin/bioblitz/${roundId}/duplicates`, {
    cache: "no-store",
    signal,
  });
  const data = (await response.json().catch(() => null)) as
    | (BioblitzDuplicateReport & { error?: string })
    | null;
  if (!response.ok || !data || data.error) throw new Error(data?.error ?? "duplicates_load_failed");
  return data;
}

async function postMerge(
  cluster: BioblitzDuplicateClusterView,
  roundId: number,
  selection: EffectiveSelection,
): Promise<void> {
  const response = await fetch("/api/admin/bioblitz-merges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subjectDid: cluster.did,
      roundId,
      canonicalUri: selection.canonicalUri,
      duplicateUris: selection.duplicateUris,
    }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok || data?.error) throw new Error(data?.error ?? "save_failed");
}

async function undoMerge(rkey: string): Promise<void> {
  const response = await fetch(`/api/admin/bioblitz-merges/${encodeURIComponent(rkey)}`, {
    method: "DELETE",
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error ?? "delete_failed");
}

async function postAutoMerge(roundId: number): Promise<{ merged: number; failed: number }> {
  const response = await fetch("/api/admin/bioblitz-merges/auto", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roundId }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as
    | { merged?: number; failed?: number; error?: string }
    | null;
  if (!response.ok || !data || data.error) throw new Error(data?.error ?? "save_failed");
  return { merged: data.merged ?? 0, failed: data.failed ?? 0 };
}

/**
 * Automatic duplicate detection for one BioBlitz round: clusters of a
 * collector's near-identical submissions, each with fine-grained merge
 * controls — star the observation to keep, toggle members in or out — plus a
 * one-click auto-merge for provably identical files and a merged/unmerged
 * filter so mistakes are easy to find and undo.
 */
export function AdminBioblitzDuplicatesPanel({
  roundId,
  canManage,
  roundEnded,
  onMutated,
}: {
  roundId: number;
  canManage: boolean;
  /** Ended rounds are frozen: clusters stay visible but cannot change. */
  roundEnded: boolean;
  /** Called after a successful merge/undo so the roster can refresh. */
  onMutated: () => void;
}) {
  const t = useTranslations("common.adminBioblitzDashboard.duplicates");
  const locale = useLocale();
  const [report, setReport] = useState<BioblitzDuplicateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [filter, setFilter] = useState<MergeFilter>("all");
  const [adjustments, setAdjustments] = useState<Record<string, ClusterAdjustment>>({});

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadReport(roundId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setReport(data);
        // A fresh report re-derives every default; stale tweaks would point at
        // moved canonicals, so they reset alongside.
        setAdjustments({});
      })
      .catch((caught) => {
        if (!controller.signal.aborted && (caught as Error).name !== "AbortError") {
          setError(errorMessage((caught as Error).message, t));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [refreshCount, roundId, t]);

  const canMutate = canManage && !roundEnded;
  const counts = useMemo(() => {
    const clusters = report?.clusters ?? [];
    const merged = clusters.filter((cluster) => cluster.merge).length;
    return { all: clusters.length, merged, unmerged: clusters.length - merged };
  }, [report]);
  const visibleClusters = useMemo(() => {
    const clusters = report?.clusters ?? [];
    if (filter === "merged") return clusters.filter((cluster) => cluster.merge);
    if (filter === "unmerged") return clusters.filter((cluster) => !cluster.merge);
    return clusters;
  }, [filter, report]);

  function adjustCluster(clusterId: string, update: (current: ClusterAdjustment) => ClusterAdjustment) {
    setAdjustments((current) => ({ ...current, [clusterId]: update(current[clusterId] ?? {}) }));
  }

  async function runAction(key: string, action: () => Promise<string | null>) {
    if (!canMutate || busyKey) return;
    setBusyKey(key);
    setError(null);
    try {
      const warning = await action();
      setRefreshCount((current) => current + 1);
      onMutated();
      if (warning) setError(warning);
    } catch (caught) {
      setError(errorMessage((caught as Error).message, t));
    } finally {
      setBusyKey(null);
    }
  }

  function applyCluster(cluster: BioblitzDuplicateClusterView, selection: EffectiveSelection) {
    void runAction(cluster.id, async () => {
      if (selection.matchesActiveMerge && cluster.merge) {
        await undoMerge(cluster.merge.rkey);
      } else {
        await postMerge(cluster, roundId, selection);
      }
      return null;
    });
  }

  function autoMergeAll() {
    void runAction(AUTO_MERGE_BUSY_KEY, async () => {
      const result = await postAutoMerge(roundId);
      return result.failed > 0 ? t("errors.autoMergePartial") : null;
    });
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-3xl border-[0.35rem] border-muted/80 bg-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-border/80 px-4 py-3 sm:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ScanSearchIcon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-[-0.01em] text-foreground">{t("title")}</h3>
          <p className="text-xs text-muted-foreground">{t("description")}</p>
        </div>
        {report ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="flex flex-col items-end gap-0.5 text-end">
              <span className="text-xs tabular-nums text-muted-foreground">
                {t("scanned", { count: report.scannedObservations })}
              </span>
              {report.suspectedExtraPoints > 0 ? (
                <span className="text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                  {t("extraPoints", { points: formatPoints(report.suspectedExtraPoints, locale) })}
                </span>
              ) : null}
            </div>
            {canMutate && report.autoMergeableGroups > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 rounded-full border-primary/20 bg-primary/[0.06] px-3 text-xs text-primary hover:bg-primary/10"
                disabled={Boolean(busyKey)}
                onClick={autoMergeAll}
              >
                {busyKey === AUTO_MERGE_BUSY_KEY ? (
                  <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <ZapIcon className="size-3.5" aria-hidden />
                )}
                {t("autoMerge", { count: report.autoMergeableGroups })}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className="border-b border-destructive/15 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive sm:px-5">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div aria-busy="true" className="space-y-3 p-4 sm:p-5">
          {Array.from({ length: 2 }, (_, index) => (
            <div key={index} className="space-y-3 rounded-2xl border border-border/80 p-3">
              <span className="block h-4 w-48 animate-pulse rounded-full bg-muted" />
              <div className="flex gap-2">
                {Array.from({ length: 5 }, (_, thumb) => (
                  <span key={thumb} className="size-20 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : !report || report.clusters.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="p-4 sm:p-5">
          <div role="group" aria-label={t("filter.aria")} className="mb-3 flex flex-wrap gap-1.5">
            {(["all", "unmerged", "merged"] as const).map((value) => {
              const active = filter === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary/[0.09] text-primary"
                      : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  {t(`filter.${value}`)}
                  <span className="tabular-nums opacity-70">{counts[value]}</span>
                </button>
              );
            })}
          </div>

          {visibleClusters.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("emptyFiltered")}</p>
          ) : (
            <div className="space-y-3">
              {visibleClusters.map((cluster) => (
                <DuplicateClusterCard
                  key={cluster.id}
                  cluster={cluster}
                  selection={effectiveSelection(cluster, adjustments[cluster.id])}
                  locale={locale}
                  busy={busyKey === cluster.id}
                  anyBusy={Boolean(busyKey)}
                  canMutate={canMutate}
                  onApply={applyCluster}
                  onPickCanonical={(uri) =>
                    adjustCluster(cluster.id, (current) => ({
                      canonicalUri: uri,
                      excludedUris: (current.excludedUris ?? []).filter((entry) => entry !== uri),
                    }))
                  }
                  onToggleMember={(uri) =>
                    adjustCluster(cluster.id, (current) => {
                      const excluded = new Set(current.excludedUris ?? []);
                      if (excluded.has(uri)) excluded.delete(uri);
                      else excluded.add(uri);
                      return { ...current, excludedUris: [...excluded] };
                    })
                  }
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function DuplicateClusterCard({
  cluster,
  selection,
  locale,
  busy,
  anyBusy,
  canMutate,
  onApply,
  onPickCanonical,
  onToggleMember,
  t,
}: {
  cluster: BioblitzDuplicateClusterView;
  selection: EffectiveSelection;
  locale: string;
  busy: boolean;
  anyBusy: boolean;
  canMutate: boolean;
  onApply: (cluster: BioblitzDuplicateClusterView, selection: EffectiveSelection) => void;
  onPickCanonical: (uri: string) => void;
  onToggleMember: (uri: string) => void;
  t: ReturnType<typeof useTranslations<"common.adminBioblitzDashboard.duplicates">>;
}) {
  const merged = Boolean(cluster.merge);
  const undoMode = selection.matchesActiveMerge && merged;
  const name = cluster.displayName || t("unnamed");
  const canonicalPoints =
    cluster.observations.find((observation) => observation.uri === selection.canonicalUri)?.points ?? 0;
  const selectedPoints =
    Math.round(
      (canonicalPoints +
        cluster.observations
          .filter((observation) => selection.duplicateUris.includes(observation.uri))
          .reduce((sum, observation) => sum + observation.points, 0)) *
        2,
    ) / 2;

  return (
    <article
      className={cn(
        "rounded-2xl border p-3",
        merged ? "border-emerald-500/25 bg-emerald-500/[0.04]" : "border-amber-500/25 bg-amber-500/[0.04]",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-primary">
          {cluster.avatarUrl ? (
            <Image src={cluster.avatarUrl} alt="" width={32} height={32} unoptimized className="size-full object-cover" />
          ) : (
            name.slice(0, 1).toUpperCase()
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={accountPath(cluster.did)}
              className="inline-flex max-w-full items-center gap-1 truncate text-sm font-medium text-foreground hover:underline"
            >
              {name}
              <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("cluster", { count: cluster.observations.length })}
            </span>
            {merged ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                <CopyIcon className="size-3" aria-hidden />
                {t("merged")}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {cluster.signals.map((signal) => (
              <span
                key={signal}
                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {t(`signal.${signal}`)}
              </span>
            ))}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={cn(
              "text-xs font-semibold tabular-nums",
              merged ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300",
            )}
          >
            {undoMode
              ? t("mergedPoints", { points: formatPoints(cluster.pointsAfter, locale) })
              : t("pointsImpact", {
                  before: formatPoints(selectedPoints, locale),
                  after: formatPoints(canonicalPoints, locale),
                })}
          </span>
          {canMutate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-8 gap-1.5 rounded-full px-3 text-xs",
                undoMode
                  ? "border-border bg-background text-foreground hover:bg-muted"
                  : "border-primary/20 bg-primary/[0.06] text-primary hover:bg-primary/10",
              )}
              disabled={anyBusy || (!undoMode && selection.duplicateUris.length === 0)}
              onClick={() => onApply(cluster, selection)}
            >
              {busy ? (
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
              ) : undoMode ? (
                <Undo2Icon className="size-3.5" aria-hidden />
              ) : (
                <MergeIcon className="size-3.5" aria-hidden />
              )}
              {undoMode ? t("undo") : t("merge", { count: selection.duplicateUris.length })}
            </Button>
          ) : null}
        </div>
      </div>

      <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={t("observationsAria")}>
        {cluster.observations.map((observation) => {
          const isCanonical = observation.uri === selection.canonicalUri;
          const isExcluded = selection.excluded.has(observation.uri);
          const label =
            observation.vernacularName || observation.scientificName || observation.associatedMedia || observation.rkey;
          return (
            <li key={observation.uri} className="w-24 shrink-0">
              <figure
                className={cn(
                  "relative overflow-hidden rounded-xl border",
                  isCanonical ? "border-primary ring-2 ring-primary/40" : "border-border/80",
                  isExcluded && !isCanonical ? "border-dashed" : null,
                  observation.mergedAway ? "opacity-45 saturate-50" : null,
                )}
              >
                <span className="block aspect-square bg-muted">
                  {observation.imageUrl ? (
                    // PDS hosts are resolved dynamically, so a native image
                    // avoids a fixed next/image host allowlist.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={observation.imageUrl} alt={label ?? ""} loading="lazy" className="size-full object-cover" />
                  ) : null}
                </span>
                {canMutate ? (
                  <>
                    <button
                      type="button"
                      aria-pressed={isCanonical}
                      aria-label={t("keepAria")}
                      title={t("keepAria")}
                      onClick={() => onPickCanonical(observation.uri)}
                      className={cn(
                        "absolute start-1 top-1 flex size-5 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isCanonical
                          ? "bg-primary text-primary-foreground"
                          : "bg-background/80 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <StarIcon className={cn("size-3", isCanonical ? "fill-current" : null)} aria-hidden />
                    </button>
                    {!isCanonical ? (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={!isExcluded}
                        aria-label={t("includeAria")}
                        title={t("includeAria")}
                        onClick={() => onToggleMember(observation.uri)}
                        className={cn(
                          "absolute end-1 top-1 flex size-5 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isExcluded
                            ? "border-muted-foreground/50 bg-background/80 text-transparent"
                            : "border-transparent bg-amber-500 text-white",
                        )}
                      >
                        <CheckIcon className="size-3" aria-hidden />
                      </button>
                    ) : null}
                  </>
                ) : null}
                {isCanonical ? (
                  <figcaption className="absolute inset-x-0 bottom-0 bg-primary/90 px-1 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                    {t("keeps")}
                  </figcaption>
                ) : null}
              </figure>
              <p className="mt-1 truncate text-[10px] text-muted-foreground" title={label ?? undefined}>
                {label}
              </p>
              <p className="text-[10px] tabular-nums text-muted-foreground">
                {formatTime(observation.createdAt, locale)} · {t("pts", { points: formatPoints(observation.points, locale) })}
              </p>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function formatPoints(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

function formatTime(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function errorMessage(
  code: string,
  t: ReturnType<typeof useTranslations<"common.adminBioblitzDashboard.duplicates">>,
): string {
  switch (code) {
    case "not_signed_in":
      return t("errors.notSignedIn");
    case "forbidden":
      return t("errors.forbidden");
    case "round_finalized":
      return t("errors.finalized");
    case "save_failed":
    case "invalid_request":
      return t("errors.merge");
    case "delete_failed":
      return t("errors.undo");
    default:
      return t("errors.load");
  }
}
