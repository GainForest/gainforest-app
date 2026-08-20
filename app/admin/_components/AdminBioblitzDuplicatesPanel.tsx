"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  MergeIcon,
  ScanSearchIcon,
  Undo2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { accountPath } from "@/app/account/_lib/account-route";
import type {
  BioblitzDuplicateClusterView,
  BioblitzDuplicateReport,
} from "@/app/admin/_lib/bioblitz-duplicates";
import { cn } from "@/lib/utils";

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

async function mergeCluster(cluster: BioblitzDuplicateClusterView, roundId: number): Promise<void> {
  const response = await fetch("/api/admin/bioblitz-merges", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subjectDid: cluster.did,
      roundId,
      canonicalUri: cluster.canonicalUri,
      duplicateUris: cluster.observations
        .filter((observation) => observation.uri !== cluster.canonicalUri)
        .map((observation) => observation.uri),
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

/**
 * Automatic duplicate detection for one BioBlitz round: clusters of a
 * collector's near-identical submissions, each with a one-click merge that
 * keeps a single observation counting and removes the rest from the round's
 * points — plus an undo that restores individual counting.
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
  const [busyClusterId, setBusyClusterId] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadReport(roundId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setReport(data);
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

  async function updateCluster(cluster: BioblitzDuplicateClusterView) {
    if (!canMutate || busyClusterId) return;
    setBusyClusterId(cluster.id);
    setError(null);
    try {
      if (cluster.merge && !cluster.hasUnmergedMembers) {
        await undoMerge(cluster.merge.rkey);
      } else {
        await mergeCluster(cluster, roundId);
      }
      setRefreshCount((current) => current + 1);
      onMutated();
    } catch (caught) {
      setError(errorMessage((caught as Error).message, t));
    } finally {
      setBusyClusterId(null);
    }
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
          <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
            <span className="text-xs tabular-nums text-muted-foreground">
              {t("scanned", { count: report.scannedObservations })}
            </span>
            {report.suspectedExtraPoints > 0 ? (
              <span className="text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                {t("extraPoints", { points: formatPoints(report.suspectedExtraPoints, locale) })}
              </span>
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
        <div className="space-y-3 p-4 sm:p-5">
          {report.clusters.map((cluster) => (
            <DuplicateClusterCard
              key={cluster.id}
              cluster={cluster}
              locale={locale}
              busy={busyClusterId === cluster.id}
              anyBusy={Boolean(busyClusterId)}
              canMutate={canMutate}
              onAction={() => updateCluster(cluster)}
              t={t}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DuplicateClusterCard({
  cluster,
  locale,
  busy,
  anyBusy,
  canMutate,
  onAction,
  t,
}: {
  cluster: BioblitzDuplicateClusterView;
  locale: string;
  busy: boolean;
  anyBusy: boolean;
  canMutate: boolean;
  onAction: () => void;
  t: ReturnType<typeof useTranslations<"common.adminBioblitzDashboard.duplicates">>;
}) {
  const merged = Boolean(cluster.merge) && !cluster.hasUnmergedMembers;
  const pointsDelta = Math.round((cluster.pointsBefore - cluster.pointsAfter) * 2) / 2;
  const name = cluster.displayName || t("unnamed");
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
            {merged
              ? t("mergedPoints", { points: formatPoints(cluster.pointsAfter, locale) })
              : t("pointsImpact", {
                  before: formatPoints(cluster.pointsBefore, locale),
                  after: formatPoints(cluster.pointsAfter, locale),
                })}
          </span>
          {canMutate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "h-8 gap-1.5 rounded-full px-3 text-xs",
                merged
                  ? "border-border bg-background text-foreground hover:bg-muted"
                  : "border-primary/20 bg-primary/[0.06] text-primary hover:bg-primary/10",
              )}
              disabled={anyBusy}
              onClick={onAction}
            >
              {busy ? (
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
              ) : merged ? (
                <Undo2Icon className="size-3.5" aria-hidden />
              ) : (
                <MergeIcon className="size-3.5" aria-hidden />
              )}
              {merged ? t("undo") : t("merge", { count: cluster.observations.length - 1 })}
            </Button>
          ) : merged ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
              <CopyIcon className="size-3" aria-hidden />
              {t("merged")}
            </span>
          ) : null}
        </div>
      </div>

      <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label={t("observationsAria")}>
        {cluster.observations.map((observation) => {
          const canonical = observation.uri === cluster.canonicalUri;
          const label =
            observation.vernacularName || observation.scientificName || observation.associatedMedia || observation.rkey;
          return (
            <li key={observation.uri} className="w-24 shrink-0">
              <figure
                className={cn(
                  "relative overflow-hidden rounded-xl border",
                  canonical ? "border-primary ring-2 ring-primary/40" : "border-border/80",
                  merged && !canonical ? "opacity-45 saturate-50" : null,
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
                {canonical ? (
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
