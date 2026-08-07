export type BioblitzPrize = "most-observations" | "best-picture";

/** Cash prizes awarded in each BioBlitz round, in USD. */
export const BIOBLITZ_PRIZES = {
  /** Collector with the most valid observations in the round. */
  mostObservations: 40,
  /** Judged best biodiversity photo of the round. */
  bestPicture: 10,
} as const;
