import "server-only";

import type { BioblitzRound, RoundWinner } from "@/app/_lib/bioblitz";
import { bioblitzBadgeKey, recognitionKeyFromTitle } from "@/app/_lib/recognition-badges";
import { fetchInternalBadgeDataStrict, type InternalBadgeData } from "@/app/internal/badges/_lib/badge-records";
import type { BioblitzWinnerPrize } from "./bioblitz-dashboard-types";

export type BioblitzConfirmedWinner = {
  did: string;
  count?: number;
  /** The exact winning image when it was saved at award time. */
  winningObservationUri?: string | null;
};

export class BioblitzWinnerConflictError extends Error {
  constructor() {
    super("winner_conflict");
    this.name = "BioblitzWinnerConflictError";
  }
}

const prizeConfig = {
  "most-observations": { badgePrize: "most-images" },
  "best-picture": { badgePrize: "best-picture" },
} as const;

/**
 * Read winners from durable steward decisions, rather than recalculating a
 * historical leaderboard. A configured round decision and its issued
 * recognition badge must agree; a disagreement is deliberately fail-closed.
 */
export async function loadBioblitzConfirmedWinners(
  round: BioblitzRound,
  badgeRepoDid: string | null | undefined,
): Promise<Partial<Record<BioblitzWinnerPrize, BioblitzConfirmedWinner>>> {
  const data = badgeRepoDid ? await fetchInternalBadgeDataStrict(badgeRepoDid, { includeAwards: true }) : null;
  const winners: Partial<Record<BioblitzWinnerPrize, BioblitzConfirmedWinner>> = {};

  for (const prize of ["most-observations", "best-picture"] as const) {
    const configured = configuredWinner(round, prize);
    const awarded = data ? awardedWinner(data, round.id, prize) : null;

    if (configured === null) {
      if (awarded) throw new BioblitzWinnerConflictError();
      continue;
    }
    if (!configured) {
      if (awarded) winners[prize] = awarded;
      continue;
    }
    if (awarded && awarded.did !== configured.did) throw new BioblitzWinnerConflictError();
    winners[prize] = {
      did: configured.did,
      count: configured.count ?? awarded?.count,
      winningObservationUri: configured.winningObservationUri ?? awarded?.winningObservationUri ?? null,
    };
  }

  return winners;
}

function configuredWinner(
  round: BioblitzRound,
  prize: BioblitzWinnerPrize,
): RoundWinner | null | undefined {
  return prize === "most-observations" ? round.mostObservations : round.bestPicture;
}

function awardedWinner(
  data: InternalBadgeData,
  roundId: number,
  prize: BioblitzWinnerPrize,
): BioblitzConfirmedWinner | null {
  const config = prizeConfig[prize];
  const expectedKey = bioblitzBadgeKey(config.badgePrize, roundId);
  const keyByDefinitionUri = new Map(
    data.definitions.map((definition) => [definition.uri, recognitionKeyFromTitle(definition.title)]),
  );
  const matching = data.awards.filter(
    (award) => keyByDefinitionUri.get(award.badge.uri) === expectedKey && award.subjectDid,
  );
  const recipients = new Set(matching.map((award) => award.subjectDid!));
  if (recipients.size > 1) throw new BioblitzWinnerConflictError();
  const award = matching[0] ?? null;
  if (!award?.subjectDid) return null;

  return {
    did: award.subjectDid,
    winningObservationUri: prize === "best-picture" ? winningObservationUri(award.url, award.subjectDid) : null,
  };
}

function winningObservationUri(value: string | null, did: string): string | null {
  if (!value) return null;
  const prefix = `at://${did}/app.gainforest.dwc.occurrence/`;
  return value.startsWith(prefix) ? value : null;
}
