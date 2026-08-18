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
