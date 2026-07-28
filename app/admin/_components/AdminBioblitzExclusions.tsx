"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { InfoIcon, Loader2Icon, PlusIcon, Trash2Icon, UserRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OwnerFilterButton } from "@/app/_components/OwnerFilter";
import { accountPath } from "@/app/account/_lib/account-route";
import type { BioblitzRound } from "@/app/_lib/bioblitz";
import type { BioblitzExclusionAdminRow } from "@/app/_lib/bioblitz-exclusions";

type ApiErrorCode =
  | "not_signed_in"
  | "forbidden"
  | "invalid_request"
  | "account_not_found"
  | "round_finalized"
  | "save_failed"
  | "delete_failed";

function AccountAvatar({ row }: { row: BioblitzExclusionAdminRow }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
      {row.avatarUrl ? (
        <Image
          src={row.avatarUrl}
          alt=""
          width={40}
          height={40}
          unoptimized
          className="size-full object-cover"
        />
      ) : (
        <UserRoundIcon className="size-5 text-muted-foreground" />
      )}
    </span>
  );
}

export function AdminBioblitzExclusions({
  initial,
  finalizedRoundIds,
  rounds,
  defaultRoundId,
  canManage,
}: {
  initial: BioblitzExclusionAdminRow[] | null;
  finalizedRoundIds: number[];
  rounds: BioblitzRound[];
  defaultRoundId: number;
  canManage: boolean;
}) {
  const t = useTranslations("common.adminBioblitzExclusions");
  const locale = useLocale();
  const [exclusions, setExclusions] = useState(initial ?? []);
  const [selectedDid, setSelectedDid] = useState<string | null>(null);
  const [selectedRoundId, setSelectedRoundId] = useState(defaultRoundId);
  const [adding, setAdding] = useState(false);
  const [removingRkey, setRemovingRkey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roundById = useMemo(() => new Map(rounds.map((round) => [round.id, round])), [rounds]);
  const finalizedRounds = useMemo(() => new Set(finalizedRoundIds), [finalizedRoundIds]);
  const newestRounds = useMemo(() => [...rounds].sort((a, b) => b.id - a.id), [rounds]);
  const sortedExclusions = useMemo(
    () =>
      [...exclusions].sort(
        (a, b) =>
          b.roundId - a.roundId ||
          (a.displayName ?? "").localeCompare(b.displayName ?? "", locale, { sensitivity: "base" }),
      ),
    [exclusions, locale],
  );

  if (initial === null) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-2xl bg-muted/40 px-3.5 py-3 text-sm text-muted-foreground">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <p className="leading-5">{t("effect")}</p>
        </div>
        <p role="alert" className="rounded-2xl border border-border/70 px-3.5 py-3 text-sm text-muted-foreground">
          {t("unavailable")}
        </p>
      </div>
    );
  }

  function dateRange(round: BioblitzRound): string {
    const formatter = new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
    return `${formatter.format(new Date(round.start))} – ${formatter.format(new Date(round.end))}`;
  }

  function roundLabel(roundId: number): string {
    const round = roundById.get(roundId);
    return round
      ? `${t("roundLabel", { round: round.id })} · ${dateRange(round)}`
      : t("roundLabel", { round: roundId });
  }

  function errorMessage(code: string | null, fallback: "add" | "remove"): string {
    switch (code as ApiErrorCode | null) {
      case "not_signed_in":
        return t("errors.notSignedIn");
      case "forbidden":
        return t("errors.forbidden");
      case "invalid_request":
        return t("errors.invalidRound");
      case "account_not_found":
        return t("errors.accountNotFound");
      case "round_finalized":
        return t("errors.finalized");
      case "delete_failed":
        return t("errors.remove");
      case "save_failed":
        return t("errors.add");
      default:
        return fallback === "add" ? t("errors.add") : t("errors.remove");
    }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !selectedDid || adding) return;
    setAdding(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/bioblitz-exclusions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subjectDid: selectedDid, roundId: selectedRoundId }),
        cache: "no-store",
      });
      const data = (await response.json().catch(() => null)) as
        | { exclusion?: BioblitzExclusionAdminRow; error?: string }
        | null;
      if (!response.ok || !data?.exclusion) {
        throw new Error(errorMessage(data?.error ?? null, "add"));
      }
      const added = data.exclusion;
      setExclusions((previous) => [
        added,
        ...previous.filter(
          (entry) => entry.subjectDid !== added.subjectDid || entry.roundId !== added.roundId,
        ),
      ]);
      setSelectedDid(null);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function remove(rkey: string) {
    if (!canManage || removingRkey) return;
    setRemovingRkey(rkey);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/bioblitz-exclusions/${encodeURIComponent(rkey)}`,
        { method: "DELETE", cache: "no-store" },
      );
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(errorMessage(data?.error ?? null, "remove"));
      setExclusions((previous) => previous.filter((entry) => entry.rkey !== rkey));
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setRemovingRkey(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-2xl bg-muted/40 px-3.5 py-3 text-sm text-muted-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        <p className="leading-5">{t("effect")}</p>
      </div>

      {canManage ? (
        <form onSubmit={add} className="grid gap-3 rounded-2xl border border-border/70 p-3.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t("accountLabel")}</span>
            <OwnerFilterButton
              ownerDid={selectedDid}
              onChange={setSelectedDid}
              className="w-full justify-between"
              labels={{
                button: t("chooseAccount"),
                ariaLabel: t("accountPickerAria"),
                searchPlaceholder: t("searchPlaceholder"),
                hint: t("searchHint"),
                noResults: t("noResults"),
                clear: t("clearSelection"),
              }}
            />
          </div>
          <label className="flex min-w-0 flex-col gap-1.5" htmlFor="bioblitz-exclusion-round">
            <span className="text-xs font-medium text-muted-foreground">{t("weekLabel")}</span>
            <select
              id="bioblitz-exclusion-round"
              value={selectedRoundId}
              onChange={(event) => setSelectedRoundId(Number(event.target.value))}
              className="h-10 min-w-0 rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {newestRounds.map((round) => {
                const finalized = finalizedRounds.has(round.id);
                return (
                  <option key={round.id} value={round.id} disabled={finalized}>
                    {roundLabel(round.id)}{finalized ? ` · ${t("finalized")}` : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <Button
            type="submit"
            disabled={adding || !selectedDid || finalizedRounds.has(selectedRoundId)}
            className="gap-1.5"
          >
            {adding ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
            {adding ? t("adding") : t("add")}
          </Button>
        </form>
      ) : (
        <p className="rounded-2xl border border-border/70 px-3.5 py-3 text-sm text-muted-foreground">
          {t("permissionNotice")}
        </p>
      )}

      {error ? (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {sortedExclusions.length === 0 ? (
        <div className="rounded-2xl bg-muted/40 p-8 text-center text-sm text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <ul className="divide-y divide-border/70">
          {sortedExclusions.map((row) => {
            const name = row.displayName || t("unnamed");
            return (
              <li key={row.rkey} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Link
                  href={accountPath(row.subjectDid)}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <AccountAvatar row={row} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium text-foreground">{name}</span>
                    <span className="truncate text-xs text-muted-foreground">{roundLabel(row.roundId)}</span>
                  </span>
                </Link>
                {finalizedRounds.has(row.roundId) ? (
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {t("finalized")}
                  </span>
                ) : canManage ? (
                  <button
                    type="button"
                    onClick={() => remove(row.rkey)}
                    disabled={Boolean(removingRkey)}
                    aria-label={t("removeLabel", { name })}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  >
                    {removingRkey === row.rkey ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <Trash2Icon className="size-4" />
                    )}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
