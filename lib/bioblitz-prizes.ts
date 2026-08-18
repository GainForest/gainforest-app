export type BioblitzPrize = "most-observations" | "best-picture";

/**
 * The first round scored by points (1 pt per plant photo, 2 per animal photo,
 * +0.5 when the species is labeled). Earlier rounds keep their original
 * "most observations" format everywhere — board ranking, prize copy, badges,
 * winner emails, and admin exports.
 */
export const BIOBLITZ_POINTS_FROM_ROUND = 8;

/** True when a round is ranked by points rather than raw observation count. */
export function bioblitzRoundUsesPoints(roundId: number): boolean {
  return roundId >= BIOBLITZ_POINTS_FROM_ROUND;
}

/** Cash prizes awarded in each BioBlitz round, in USD. */
export const BIOBLITZ_PRIZES = {
  /** Collector with the winning score: highest points from round
   *  BIOBLITZ_POINTS_FROM_ROUND onward, most valid observations before it. */
  mostObservations: 40,
  /** Judged best biodiversity photo of the round. */
  bestPicture: 10,
} as const;

/** Prize amount in USD for a specific prize type. */
export function bioblitzPrizeAmountUsd(prize: BioblitzPrize): number {
  return prize === "best-picture" ? BIOBLITZ_PRIZES.bestPicture : BIOBLITZ_PRIZES.mostObservations;
}

/**
 * The message prefix used for bioblitz prize receipts. Any funding receipt
 * whose notes start with this prefix is recognized as a bioblitz prize payment.
 */
const BIOBLITZ_RECEIPT_PREFIX = "BioBlitz Round";

/**
 * Generate the deterministic message for a bioblitz prize funding receipt.
 * The message format allows us to identify receipts as bioblitz prize payments.
 */
export function bioblitzPrizeReceiptMessage(
  roundId: number,
  prize: BioblitzPrize,
  roundUsesPoints: boolean,
): string {
  const prizeLabel = prize === "best-picture"
    ? "Best Picture"
    : roundUsesPoints ? "Highest Points" : "Most Observations";
  return `${BIOBLITZ_RECEIPT_PREFIX} ${roundId} — ${prizeLabel} winner prize`;
}

/**
 * Parse a funding receipt notes field to extract bioblitz prize info.
 * Returns null if the notes don't match the expected format.
 */
export function parseBioblitzPrizeReceipt(notes: string | null | undefined): {
  roundId: number;
  prize: BioblitzPrize;
} | null {
  if (!notes?.startsWith(BIOBLITZ_RECEIPT_PREFIX)) return null;
  // Match: "BioBlitz Round 12 — Best Picture winner prize" or
  //        "BioBlitz Round 12 — Most Observations winner prize" or
  //        "BioBlitz Round 12 — Highest Points winner prize"
  const match = notes.match(
    /^BioBlitz Round (\d+) — (Best Picture|Most Observations|Highest Points) winner prize$/,
  );
  if (!match) return null;
  const roundId = Number(match[1]);
  if (!Number.isInteger(roundId) || roundId <= 0) return null;
  const prizeText = match[2];
  const prize: BioblitzPrize = prizeText === "Best Picture" ? "best-picture" : "most-observations";
  return { roundId, prize };
}
