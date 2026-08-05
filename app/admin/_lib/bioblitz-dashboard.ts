import "server-only";

import {
  bioblitzRounds,
  fetchBioblitzRoundRegistrants,
  fetchRoundCollectors,
  roundStatus,
  type BioblitzRound,
  type RoundCollector,
} from "@/app/_lib/bioblitz";
import {
  effectiveBioblitzExclusionRecords,
  fetchBioblitzExclusionsStrict,
} from "@/app/_lib/bioblitz-exclusions";
import { fetchIndexedCertifiedProfileCards } from "@/app/_lib/indexer";
import type {
  BioblitzAdminRegistrant,
  BioblitzAdminRoundCount,
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

/**
 * Load accurate eligible-observation totals for the compact round rail.
 * A failed source deliberately produces no number rather than a misleading
 * zero, and every round is fetched in parallel so this optional enhancement
 * never serializes the main roster load.
 */
export async function loadBioblitzAdminRoundCounts(
  rounds: readonly BioblitzRound[],
): Promise<BioblitzAdminRoundCount[]> {
  return Promise.all(
    rounds.map(async (round) => {
      try {
        const board = await fetchRoundCollectors(round, "round", undefined, "required");
        return { roundId: round.id, totalObservations: board.totalObservations };
      } catch {
        return { roundId: round.id, totalObservations: null };
      }
    }),
  );
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
  const [confirmedWinners, registrants, board, exclusionRecords] = await Promise.all([
    ended
      ? loadBioblitzConfirmedWinners(round, badgeRepoDid)
      : Promise.resolve<Partial<Record<BioblitzWinnerPrize, BioblitzConfirmedWinner>>>({}),
    fetchBioblitzRoundRegistrants(round),
    fetchRoundCollectors(round, "round", undefined, "required", { includeExcluded: true }),
    fetchBioblitzExclusionsStrict(),
  ]);
  const rawCollectors = board.unfilteredCollectors ?? board.collectors;
  const collectorByDid = new Map(rawCollectors.map((collector) => [collector.did, collector]));
  const activeRoundExclusions = effectiveBioblitzExclusionRecords(exclusionRecords).filter(
    (exclusion) => exclusion.roundId === round.id,
  );

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

  const profileDids = [...new Set([
    ...winners.map((winner) => winner.did),
    ...activeRoundExclusions.map((exclusion) => exclusion.subjectDid),
  ])];
  const profileCards = profileDids.length === 0
    ? new Map<string, { displayName: string | null; avatarUrl: string | null }>()
    : await fetchIndexedCertifiedProfileCards(profileDids).catch(
      () => new Map<string, { displayName: string | null; avatarUrl: string | null }>(),
    );
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

  // Keep every actively ignored account visible and reversible even when it
  // never published a round-registration post (or that old post is gone).
  // Its raw tally remains available for a moderator to review before restoring.
  for (const exclusion of activeRoundExclusions) {
    const collector = collectorByDid.get(exclusion.subjectDid);
    const profile = profileCards.get(exclusion.subjectDid);
    const existing = rows.get(exclusion.subjectDid);
    if (existing) {
      if (!existing.displayName) {
        existing.displayName = collector?.displayName ?? profile?.displayName ?? null;
      }
      if (!existing.avatarUrl) existing.avatarUrl = profile?.avatarUrl ?? null;
      if (collector) existing.observationCount = collector.count;
      continue;
    }
    rows.set(exclusion.subjectDid, {
      did: exclusion.subjectDid,
      displayName: collector?.displayName ?? profile?.displayName ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      registeredAt: null,
      observationCount: collector?.count ?? 0,
      wins: [],
      availablePackages: [],
    });
  }

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
    totalObservations: board.totalObservations,
    registrants: [...rows.values()].sort((a, b) => {
      const winnerDifference = Number(b.wins.length > 0) - Number(a.wins.length > 0);
      if (winnerDifference) return winnerDifference;
      const observationDifference = b.observationCount - a.observationCount;
      if (observationDifference) return observationDifference;
      return (a.displayName ?? "").localeCompare(b.displayName ?? "", undefined, { sensitivity: "base" });
    }),
  };
}
