"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BadgeCheckIcon, Loader2Icon, MedalIcon } from "lucide-react";
import { AdminOnlyIndicator } from "../_components/AdminOnlyIndicator";

/**
 * Moderator-only "Award winner badges" control shown per finished round in the
 * Past winners list on /bioblitz. Whether the viewer is a moderator — and which
 * rounds already have their badges — comes from one GET to the admin endpoint;
 * everyone else silently renders nothing. Awarding recomputes the winners
 * server-side, so this button only carries the round id.
 */

export type RoundAwardState = { id: number; mostImages: boolean; bestPicture: boolean };

type AwardHook = {
  /** Null until (and unless) the viewer is confirmed as a moderator. */
  state: Map<number, RoundAwardState> | null;
  busyRound: number | null;
  error: string | null;
  award: (roundId: number) => void;
};

export function useBioblitzAwardState(): AwardHook {
  const [state, setState] = useState<Map<number, RoundAwardState> | null>(null);
  const [busyRound, setBusyRound] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch("/api/internal/bioblitz-awards", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = (await response.json().catch(() => null)) as { rounds?: RoundAwardState[] } | null;
        return Array.isArray(data?.rounds) ? data.rounds : null;
      })
      .then((rounds) => {
        if (active && rounds) setState(new Map(rounds.map((round) => [round.id, round])));
      })
      .catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const award = useCallback((roundId: number) => {
    setBusyRound(roundId);
    setError(null);
    fetch("/api/internal/bioblitz-awards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as (RoundAwardState & { error?: string }) | null;
        if (!response.ok || !data || data.error) throw new Error(data?.error);
        setState((current) => {
          const next = new Map(current ?? []);
          next.set(roundId, { id: roundId, mostImages: data.mostImages, bestPicture: data.bestPicture });
          return next;
        });
      })
      .catch(() => setError("failed"))
      .finally(() => setBusyRound((current) => (current === roundId ? null : current)));
  }, []);

  return { state, busyRound, error, award };
}

export function RoundAwardControl({
  roundId,
  hook,
  hasWinners,
}: {
  roundId: number;
  hook: AwardHook;
  /** Whether the round has at least one resolved winner to award. */
  hasWinners: boolean;
}) {
  const t = useTranslations("marketplace.bioblitz.winners.award");
  const roundState = hook.state?.get(roundId);
  if (!roundState) return null;

  const fullyAwarded = roundState.mostImages && roundState.bestPicture;
  if (fullyAwarded) {
    return (
      <span className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-primary">
        <BadgeCheckIcon className="size-3.5" aria-hidden />
        {t("done")}
      </span>
    );
  }
  if (!hasWinners) return null;

  const busy = hook.busyRound === roundId;
  const partiallyAwarded = roundState.mostImages || roundState.bestPicture;
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => hook.award(roundId)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-60"
      >
        {busy ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> : <MedalIcon className="size-3.5" aria-hidden />}
        {partiallyAwarded ? t("actionMissing") : t("action")}
        <AdminOnlyIndicator />
      </button>
      {hook.error && !busy ? (
        <span aria-live="polite" className="text-[11px] text-destructive">
          {t("error")}
        </span>
      ) : null}
    </span>
  );
}
