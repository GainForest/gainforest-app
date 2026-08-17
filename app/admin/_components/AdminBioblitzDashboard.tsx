"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CheckIcon,
  DownloadIcon,
  EyeOffIcon,
  ExternalLinkIcon,
  Loader2Icon,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { accountPath } from "@/app/account/_lib/account-route";
import { bioblitzRoundUsesPoints, roundStatus, type BioblitzRound } from "@/app/_lib/bioblitz";
import type { BioblitzExclusionAdminRow } from "@/app/_lib/bioblitz-exclusions";
import type {
  BioblitzAdminRegistrant,
  BioblitzAdminRoundCount,
  BioblitzAdminRoundData,
  BioblitzWinnerPrize,
} from "@/app/admin/_lib/bioblitz-dashboard-types";
import { cn } from "@/lib/utils";

async function loadRound(roundId: number, signal: AbortSignal): Promise<BioblitzAdminRoundData> {
  const response = await fetch(`/api/admin/bioblitz/${roundId}`, { cache: "no-store", signal });
  const data = (await response.json().catch(() => null)) as BioblitzAdminRoundData & { error?: string } | null;
  if (!response.ok || !data || data.error) throw new Error(data?.error ?? "round_load_failed");
  return data;
}

async function loadRoundCounts(signal: AbortSignal): Promise<BioblitzAdminRoundCount[]> {
  const response = await fetch("/api/admin/bioblitz/round-counts", { cache: "no-store", signal });
  const data = (await response.json().catch(() => null)) as
    | { counts?: BioblitzAdminRoundCount[]; error?: string }
    | null;
  if (!response.ok || !data?.counts) throw new Error(data?.error ?? "round_counts_load_failed");
  return data.counts;
}

async function addExclusion(subjectDid: string, roundId: number): Promise<BioblitzExclusionAdminRow> {
  const response = await fetch("/api/admin/bioblitz-exclusions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subjectDid, roundId }),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as
    | { exclusion?: BioblitzExclusionAdminRow; error?: string }
    | null;
  if (!response.ok || !data?.exclusion) throw new Error(data?.error ?? "save_failed");
  return data.exclusion;
}

async function restoreExclusion(rkey: string): Promise<void> {
  const response = await fetch(`/api/admin/bioblitz-exclusions/${encodeURIComponent(rkey)}`, {
    method: "DELETE",
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error ?? "delete_failed");
}

async function requestWinnerPackage(roundId: number, prize: BioblitzWinnerPrize): Promise<void> {
  const response = await fetch(
    `/api/admin/bioblitz/${roundId}/winner-package?prize=${encodeURIComponent(prize)}`,
    { cache: "no-store" },
  );
  const data = response.ok ? null : ((await response.json().catch(() => null)) as { error?: string } | null);
  if (!response.ok) throw new Error(data?.error ?? "package_failed");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = attachmentFilename(response.headers.get("content-disposition")) ?? "bioblitz-winner.zip";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function AdminBioblitzDashboard({
  rounds,
  defaultRoundId,
  initialData,
  initialExclusions,
  canManage,
}: {
  rounds: BioblitzRound[];
  defaultRoundId: number;
  initialData: BioblitzAdminRoundData | null;
  /** null means the current exclusion state could not be read safely. */
  initialExclusions: BioblitzExclusionAdminRow[] | null;
  canManage: boolean;
}) {
  const t = useTranslations("common.adminBioblitzDashboard");
  const locale = useLocale();
  const visibleRounds = useMemo(() => [...rounds].sort((a, b) => b.id - a.id), [rounds]);
  const safeDefaultRoundId = visibleRounds.some((round) => round.id === defaultRoundId)
    ? defaultRoundId
    : visibleRounds[0]?.id ?? defaultRoundId;
  const [selectedRoundId, setSelectedRoundId] = useState(safeDefaultRoundId);
  const [roundData, setRoundData] = useState<BioblitzAdminRoundData | null>(
    initialData?.roundId === safeDefaultRoundId ? initialData : null,
  );
  const [roundObservationCounts, setRoundObservationCounts] = useState<Record<number, number>>(() =>
    initialData?.roundId === safeDefaultRoundId
      ? { [initialData.roundId]: initialData.totalObservations }
      : {},
  );
  const [exclusions, setExclusions] = useState(initialExclusions);
  const [openRegistrantDid, setOpenRegistrantDid] = useState<string | undefined>();
  const [loading, setLoading] = useState(initialData?.roundId !== safeDefaultRoundId);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const initialRoundIdRef = useRef(initialData?.roundId === safeDefaultRoundId ? safeDefaultRoundId : null);

  const selectedRound = visibleRounds.find((round) => round.id === selectedRoundId) ?? null;
  const selectedStatus = selectedRound ? roundStatus(selectedRound) : "ended";
  const canChangeCounting = canManage && exclusions !== null && selectedStatus !== "ended";
  const exclusionsByDid = useMemo(
    () => new Map((exclusions ?? []).filter((row) => row.roundId === selectedRoundId).map((row) => [row.subjectDid, row])),
    [exclusions, selectedRoundId],
  );

  useEffect(() => {
    if (initialRoundIdRef.current === selectedRoundId && refreshCount === 0) {
      initialRoundIdRef.current = null;
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadRound(selectedRoundId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setRoundData(data);
        setRoundObservationCounts((current) =>
          current[data.roundId] === data.totalObservations
            ? current
            : { ...current, [data.roundId]: data.totalObservations },
        );
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
  }, [refreshCount, selectedRoundId, t]);

  useEffect(() => {
    const controller = new AbortController();
    loadRoundCounts(controller.signal)
      .then((counts) => {
        if (controller.signal.aborted) return;
        setRoundObservationCounts((current) => {
          let changed = false;
          const next = { ...current };
          for (const count of counts) {
            // A freshly loaded roster is the authoritative, up-to-date count
            // after an ignore/restore action. This optional background request
            // only fills in round-rail values we do not already have.
            if (count.totalObservations === null || current[count.roundId] !== undefined) continue;
            next[count.roundId] = count.totalObservations;
            changed = true;
          }
          return changed ? next : current;
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  function selectRound(roundId: number) {
    if (roundId === selectedRoundId) return;
    setSelectedRoundId(roundId);
    setRoundData(null);
    setLoading(true);
    setError(null);
    setOpenRegistrantDid(undefined);
  }

  async function updateCounting(registrant: BioblitzAdminRegistrant) {
    if (!selectedRound || !canChangeCounting || busyKey) return;
    const exclusion = exclusionsByDid.get(registrant.did);
    const key = `${exclusion ? "restore" : "exclude"}:${registrant.did}`;
    setBusyKey(key);
    setError(null);
    try {
      if (exclusion) {
        await restoreExclusion(exclusion.rkey);
        setExclusions((current) => current?.filter((row) => row.rkey !== exclusion.rkey) ?? null);
      } else {
        const next = await addExclusion(registrant.did, selectedRound.id);
        setExclusions((current) => {
          if (!current) return null;
          return [next, ...current.filter((row) => row.subjectDid !== next.subjectDid || row.roundId !== next.roundId)];
        });
      }
      setRefreshCount((current) => current + 1);
    } catch (caught) {
      setError(errorMessage((caught as Error).message, t));
    } finally {
      setBusyKey(null);
    }
  }

  async function downloadWinnerPackage(prize: BioblitzWinnerPrize, did: string) {
    if (!selectedRound || !canManage || busyKey) return;
    const key = `download:${did}:${prize}`;
    setBusyKey(key);
    setError(null);
    try {
      await requestWinnerPackage(selectedRound.id, prize);
    } catch (caught) {
      setError(errorMessage((caught as Error).message, t));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start">
      <nav aria-label={t("roundsAria")} className="min-w-0 lg:sticky lg:top-4">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {visibleRounds.map((round) => {
            const selected = round.id === selectedRoundId;
            const status = roundStatus(round);
            const totalObservations = roundObservationCounts[round.id];
            return (
              <button
                key={round.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectRound(round.id)}
                className={cn(
                  "group flex min-w-32 shrink-0 flex-col rounded-2xl px-3 py-2.5 text-left transition-[background-color,color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-36 lg:min-w-0",
                  selected
                    ? "bg-primary/[0.09] text-primary"
                    : "text-foreground hover:bg-muted/70",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-[-0.01em]">{t("round", { round: round.id })}</span>
                  {status === "live" || status === "upcoming" ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <span className={cn("size-1.5 rounded-full", statusColor(status))} aria-hidden />
                      {t(`status.${status}`)}
                    </span>
                  ) : (
                    <span className="sr-only">{t(`status.${status}`)}</span>
                  )}
                </span>
                <span className="mt-1 flex min-w-0 items-center justify-between gap-2">
                  <span className={cn("truncate text-[11px] tabular-nums", selected ? "text-primary/80" : "text-muted-foreground")}>
                    {formatRoundDates(round, locale)}
                  </span>
                  {typeof totalObservations === "number" ? (
                    <span
                      aria-label={t("observations", { count: totalObservations })}
                      className={cn(
                        "shrink-0 text-sm tabular-nums",
                        selected ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {formatObservationCount(totalObservations, locale)}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <section className="min-w-0 overflow-hidden rounded-3xl border-[0.35rem] border-muted/80 bg-card shadow-none">
        {error ? (
          <p role="alert" className="border-b border-destructive/15 bg-destructive/[0.06] px-4 py-3 text-sm text-destructive sm:px-5">
            {error}
          </p>
        ) : null}

        {loading ? (
          <BioblitzRosterSkeleton label={t("loading")} />
        ) : !roundData ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("loadError")}</div>
        ) : roundData.registrants.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("empty")}</div>
        ) : (
          <Accordion
            type="single"
            collapsible
            value={openRegistrantDid}
            onValueChange={setOpenRegistrantDid}
            className="px-4 sm:px-5"
          >
            {roundData.registrants.map((registrant) => {
              const exclusion = exclusionsByDid.get(registrant.did) ?? null;
              const ignored = Boolean(exclusion);
              const name = registrant.displayName || t("unnamed");
              const mutationKey = `${ignored ? "restore" : "exclude"}:${registrant.did}`;
              return (
                <AccordionItem key={registrant.did} value={registrant.did} className="border-border/80 last:border-b-0">
                  <AccordionTrigger className="gap-3 px-0 py-3.5 text-left hover:no-underline [&>svg]:size-4 [&>svg]:text-foreground">
                    <RegistrantAvatar url={registrant.avatarUrl} name={name} />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="max-w-full truncate text-base font-medium tracking-[-0.01em] text-foreground">{name}</span>
                        {registrant.wins.map((prize) => (
                          <WinnerPill
                            key={prize}
                            prize={prize}
                            usesPoints={bioblitzRoundUsesPoints(selectedRoundId)}
                            t={t}
                          />
                        ))}
                        {ignored ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-transparent px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                            <EyeOffIcon className="size-3" aria-hidden />
                            {t("ignored")}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                        {bioblitzRoundUsesPoints(selectedRoundId) ? (
                          <>
                            <span>{t("points", { points: registrant.points })}</span>
                            <span aria-hidden>·</span>
                          </>
                        ) : null}
                        <span>{t("observations", { count: registrant.observationCount })}</span>
                        {ignored ? <span aria-hidden>·</span> : null}
                        {ignored ? <span>{t("notCounted")}</span> : null}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="px-0">
                    <div className="ml-[3.25rem] flex flex-wrap items-center gap-2 border-t border-border/80 pt-3">
                      <Link
                        href={accountPath(registrant.did)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ExternalLinkIcon className="size-3.5" aria-hidden />
                        {t("openProfile")}
                      </Link>
                      {registrant.registeredAt ? (
                        <span className="text-xs text-muted-foreground">{t("joined", { date: formatShortDate(registrant.registeredAt, locale) })}</span>
                      ) : null}
                      {registrant.wins.map((prize) => {
                        const key = `download:${registrant.did}:${prize}`;
                        const downloading = busyKey === key;
                        return canManage && registrant.availablePackages.includes(prize) ? (
                          <Button
                            key={prize}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 gap-1.5 rounded-full border-primary/20 bg-primary/[0.06] px-3 text-xs text-primary hover:bg-primary/10"
                            disabled={Boolean(busyKey)}
                            onClick={() => downloadWinnerPackage(prize, registrant.did)}
                          >
                            {downloading ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : <DownloadIcon className="size-3.5" aria-hidden />}
                            {t(
                              prize === "most-observations" && bioblitzRoundUsesPoints(selectedRoundId)
                                ? "download.highest-points"
                                : `download.${prize}`,
                            )}
                          </Button>
                        ) : null;
                      })}
                      {canChangeCounting ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className={cn(
                            "h-8 gap-1.5 rounded-full px-3 text-xs",
                            ignored ? "text-primary hover:bg-primary/[0.08] hover:text-primary" : "text-muted-foreground hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300",
                          )}
                          disabled={Boolean(busyKey)}
                          onClick={() => updateCounting(registrant)}
                        >
                          {busyKey === mutationKey ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : ignored ? <CheckIcon className="size-3.5" aria-hidden /> : <EyeOffIcon className="size-3.5" aria-hidden />}
                          {ignored ? t("countAgain") : t("ignore")}
                        </Button>
                      ) : null}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </section>
    </div>
  );
}

function RegistrantAvatar({ url, name }: { url: string | null; name: string }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-primary">
      {url ? (
        <Image src={url} alt="" width={40} height={40} unoptimized className="size-full object-cover" />
      ) : (
        initialsForName(name)
      )}
    </span>
  );
}

function initialsForName(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase();
  return initials || "?";
}

function WinnerPill({
  prize,
  usesPoints,
  t,
}: {
  prize: BioblitzWinnerPrize;
  /** The board prize is named after the rule its round was played under. */
  usesPoints: boolean;
  t: ReturnType<typeof useTranslations<"common.adminBioblitzDashboard">>;
}) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
      {t(prize === "most-observations" && usesPoints ? "prize.highest-points" : `prize.${prize}`)}
    </span>
  );
}

function BioblitzRosterSkeleton({ label }: { label: string }) {
  return (
    <div aria-label={label} aria-busy="true" className="px-4 sm:px-5">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 border-b border-border/80 py-3.5 last:border-b-0">
          <span className="size-10 animate-pulse rounded-full bg-muted" />
          <span className="min-w-0 flex-1 space-y-2">
            <span className="block h-3.5 w-32 animate-pulse rounded-full bg-muted" />
            <span className="block h-3 w-20 animate-pulse rounded-full bg-muted/80" />
          </span>
        </div>
      ))}
    </div>
  );
}

function formatRoundDates(round: BioblitzRound, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" });
  return `${formatter.format(new Date(round.start))} – ${formatter.format(new Date(round.end))}`;
}

function formatShortDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatObservationCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

function statusColor(status: "upcoming" | "live" | "ended"): string {
  if (status === "live") return "bg-emerald-500";
  if (status === "upcoming") return "bg-sky-500";
  return "bg-muted-foreground/40";
}

function attachmentFilename(value: string | null): string | null {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value ?? "")?.[1];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function errorMessage(
  code: string,
  t: ReturnType<typeof useTranslations<"common.adminBioblitzDashboard">>,
): string {
  switch (code) {
    case "not_signed_in":
      return t("errors.notSignedIn");
    case "forbidden":
      return t("errors.forbidden");
    case "round_finalized":
      return t("errors.finalized");
    case "round_not_found":
      return t("errors.roundNotFound");
    case "winner_not_found":
      return t("errors.winnerNotFound");
    case "delete_failed":
      return t("errors.restore");
    case "save_failed":
      return t("errors.ignore");
    case "package_failed":
      return t("errors.download");
    default:
      return t("errors.load");
  }
}
