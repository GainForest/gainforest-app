export type BioblitzWinnerPrize = "most-observations" | "best-picture";

/** A single account in one round of the internal BioBlitz dashboard. */
export type BioblitzAdminRegistrant = {
  did: string;
  displayName: string | null;
  avatarUrl: string | null;
  registeredAt: string | null;
  /** Eligible photo observations in the round before a weekly count exclusion. */
  observationCount: number;
  wins: BioblitzWinnerPrize[];
  /** Exports are omitted when an older award did not preserve its winning image. */
  availablePackages: BioblitzWinnerPrize[];
};

/** Serializable, round-scoped payload used by the admin dashboard endpoint. */
export type BioblitzAdminRoundData = {
  roundId: number;
  registrants: BioblitzAdminRegistrant[];
};
