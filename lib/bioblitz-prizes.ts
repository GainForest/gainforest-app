export type BioblitzPrize = "most-observations" | "best-picture";

/** Cash prizes awarded in each BioBlitz round, in USD. */
export const BIOBLITZ_PRIZES = {
  /** Collector with the highest points score in the round (1 pt per plant
   *  photo, 2 per animal photo, +0.5 when the species is labeled). */
  mostObservations: 40,
  /** Judged best biodiversity photo of the round. */
  bestPicture: 10,
} as const;
