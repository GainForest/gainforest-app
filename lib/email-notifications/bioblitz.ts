import "server-only";

import type { NotificationConfig } from "./config";
import type { Clock, NotificationEnqueueRepository, UserEmailReader } from "./types";

export type BioblitzPrize = "most-observations" | "best-picture";
export interface BioblitzWinnerInput {
  readonly roundId: number;
  readonly roundLabel: string;
  readonly prize: BioblitzPrize;
  readonly winnerDid: string;
  readonly createdAt: string;
}

interface Dependencies {
  readonly config: NotificationConfig;
  readonly clock: Pick<Clock, "now">;
  readonly repository: NotificationEnqueueRepository;
  readonly userEmailReader: UserEmailReader;
}

export type BioblitzEnqueueOutcome =
  | { readonly kind: "disabled" }
  | {
    readonly kind: "enqueued";
    readonly outboxId: string;
    readonly status: "waiting_recipient" | "queued" | "processing" | "sent" | "suppressed" | "dead";
    readonly duplicate: boolean;
    readonly recipientStatus: "ready" | "missing_email" | "lookup_failed";
  };

function invalid(field: string): never {
  throw new Error(`BioBlitz notification input has an invalid ${field}. Use the committed badge award values.`);
}

export async function enqueueBioblitzWinner(input: BioblitzWinnerInput, dependencies: Dependencies): Promise<BioblitzEnqueueOutcome> {
  if (dependencies.config.emailDisabled) return { kind: "disabled" };
  if (!Number.isInteger(input.roundId) || input.roundId < 1) invalid("roundId");
  const roundLabel = input.roundLabel.trim();
  if (!roundLabel || roundLabel.length > 100) invalid("roundLabel");
  if (input.prize !== "most-observations" && input.prize !== "best-picture") invalid("prize");
  if (!/^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/.test(input.winnerDid) || input.winnerDid.length > 256) invalid("winnerDid");
  const createdAt = new Date(input.createdAt);
  if (input.createdAt.length > 64 || Number.isNaN(createdAt.getTime())) invalid("createdAt");

  const lookup = await dependencies.userEmailReader.lookup(input.winnerDid);
  const recipientStatus = lookup.kind === "ready" ? "ready" : lookup.kind === "missing" ? "missing_email" : "lookup_failed";
  const result = await dependencies.repository.enqueue({
    eventKey: `bioblitz:${input.roundId}:${input.prize}:${input.winnerDid}`,
    eventType: "bioblitz_winner",
    payload: {
      createdAt: createdAt.toISOString(),
      prize: input.prize,
      roundId: input.roundId,
      roundLabel,
      winnerDid: input.winnerDid,
    },
    sourceId: `bioblitz:${input.roundId}:${input.prize}`,
    recipientDid: input.winnerDid,
    recipientEmail: null,
    templateKey: "bioblitz-winner",
    locale: null,
    providerIdempotencyKey: null,
    nextAttemptAt: dependencies.clock.now(),
  });
  return { kind: "enqueued", ...result, recipientStatus };
}
