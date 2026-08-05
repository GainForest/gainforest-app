import "server-only";

import {
  bioblitzRounds,
  fetchBioblitzRoundRegistrants,
  fetchRoundCollectors,
  roundStatus,
  type BioblitzRound,
  type RoundCollector,
} from "@/app/_lib/bioblitz";
import { fetchIndexedCertifiedProfileCards } from "@/app/_lib/indexer";
import type {
  BioblitzAdminRegistrant,
  BioblitzAdminRoundData,
  BioblitzWinnerPrize,
} from "./bioblitz-dashboard-types";
import { loadBioblitzConfirmedWinners, type BioblitzConfirmedWinner } from "./bioblitz-confirmed-winners";

export class BioblitzAdminRoundNotFoundError extends Error {
  constructor() {
    super("round_not_found");
    this.name = "BioblitzAdminRoundNotFoundError";
  }
}

/** Only started/current rounds are meaningful to the internal dashboard. */
export function resolveBioblitzAdminRound(roundId: number, now = Date.now()): BioblitzRound {
  const round = bioblitzRounds(now, 0).find((candidate) => candidate.id === roundId);
  if (!round) throw new BioblitzAdminRoundNotFoundError();
  return round;
}

type Winner = {
  did: string;
  prize: BioblitzWinnerPrize;
  collector?: RoundCollector;
  displayName: string | null;
  observationCount?: number;
  packageAvailable: boolean;
};

/**
 * Build the compact participant roster for one round. Winner badges and
 * exports are based on confirmed steward decisions, never a later leaderboard
 * recalculation; weekly exclusions still determine the displayed counts.
 */
export async function loadBioblitzAdminRound(
  roundId: number,
  now = Date.now(),
  badgeRepoDid: string | null = null,
): Promise<BioblitzAdminRoundData> {
  const round = resolveBioblitzAdminRound(roundId, now);
  const ended = roundStatus(round, now) === "ended";
  const [confirmedWinners, registrants, board] = await Promise.all([
    ended
      ? loadBioblitzConfirmedWinners(round, badgeRepoDid)
      : Promise.resolve<Partial<Record<BioblitzWinnerPrize, BioblitzConfirmedWinner>>>({}),
    fetchBioblitzRoundRegistrants(round),
    fetchRoundCollectors(round, "round", undefined, "required", { includeExcluded: true }),
  ]);
  const rawCollectors = board.unfilteredCollectors ?? board.collectors;
  const collectorByDid = new Map(rawCollectors.map((collector) => [collector.did, collector]));

  const winners: Winner[] = [];
  for (const prize of ["most-observations", "best-picture"] as const) {
    const confirmed = confirmedWinners[prize];
    if (!confirmed) continue;
    const collector = collectorByDid.get(confirmed.did);
    winners.push({
      did: confirmed.did,
      prize,
      collector,
      displayName: collector?.displayName ?? null,
      observationCount: confirmed.count,
      packageAvailable: prize !== "best-picture" || Boolean(confirmed.winningObservationUri),
    });
  }

  const profileCards = await fetchIndexedCertifiedProfileCards(
    [...new Set(winners.map((winner) => winner.did))],
  ).catch(() => new Map<string, { displayName: string | null; avatarUrl: string | null }>());
  const rawCountByDid = new Map(rawCollectors.map((collector) => [collector.did, collector.count]));
  const rows = new Map<string, BioblitzAdminRegistrant>(
    registrants.map((registrant) => [
      registrant.did,
      {
        did: registrant.did,
        displayName: registrant.displayName,
        avatarUrl: registrant.avatarUrl,
        registeredAt: registrant.createdAt || null,
        observationCount: rawCountByDid.get(registrant.did) ?? 0,
        wins: [],
        availablePackages: [],
      },
    ]),
  );

  // Winner selection predates round-tag registration. Preserve visibility for
  // a legitimate winner even if historical registration data is incomplete.
  for (const winner of winners) {
    const profile = profileCards.get(winner.did);
    const existing = rows.get(winner.did);
    const next: BioblitzAdminRegistrant = existing ?? {
      did: winner.did,
      displayName: winner.displayName ?? profile?.displayName ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      registeredAt: null,
      observationCount: winner.observationCount ?? rawCountByDid.get(winner.did) ?? winner.collector?.count ?? 0,
      wins: [],
      availablePackages: [],
    };
    if (!next.displayName) next.displayName = winner.displayName ?? profile?.displayName ?? null;
    if (!next.avatarUrl) next.avatarUrl = profile?.avatarUrl ?? null;
    if (winner.observationCount !== undefined) next.observationCount = winner.observationCount;
    if (!next.wins.includes(winner.prize)) next.wins.push(winner.prize);
    if (winner.packageAvailable && !next.availablePackages.includes(winner.prize)) {
      next.availablePackages.push(winner.prize);
    }
    rows.set(winner.did, next);
  }

  return {
    roundId: round.id,
    registrants: [...rows.values()].sort((a, b) => {
      const winnerDifference = Number(b.wins.length > 0) - Number(a.wins.length > 0);
      if (winnerDifference) return winnerDifference;
      const observationDifference = b.observationCount - a.observationCount;
      if (observationDifference) return observationDifference;
      return (a.displayName ?? "").localeCompare(b.displayName ?? "", undefined, { sensitivity: "base" });
    }),
  };
}
