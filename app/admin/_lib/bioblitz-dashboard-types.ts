export type BioblitzWinnerPrize = "most-observations" | "best-picture";

/** Wallet connection status for prize payments. */
export type BioblitzWinnerWallet = {
  /** The EVM wallet address to send the prize to. */
  address: `0x${string}`;
  /** Whether this is a donation vault or linked wallet. */
  source: "vault" | "linked";
};

/** Prize payment status for a winner. */
export type BioblitzPrizePaymentStatus = {
  prize: BioblitzWinnerPrize;
  /** Whether the prize was already paid (funding receipt exists). */
  paid: boolean;
  /** Transaction hash if paid. */
  txHash?: string;
  /** When the payment was made. */
  paidAt?: string;
};

/** A single account in one round of the internal BioBlitz dashboard. */
export type BioblitzAdminRegistrant = {
  did: string;
  displayName: string | null;
  avatarUrl: string | null;
  registeredAt: string | null;
  /** Eligible photo observations in the round before a weekly count exclusion. */
  observationCount: number;
  /** Round score before a weekly count exclusion — 1 pt per plant photo,
   *  2 per animal photo, +0.5 per labeled species. */
  points: number;
  wins: BioblitzWinnerPrize[];
  /** Exports are omitted when an older award did not preserve its winning image. */
  availablePackages: BioblitzWinnerPrize[];
  /** Wallet info for winners (to enable prize payment). Null if no wallet connected. */
  wallet?: BioblitzWinnerWallet | null;
  /** Payment status for each prize this registrant won. */
  prizePayments?: BioblitzPrizePaymentStatus[];
};

/** Serializable, round-scoped payload used by the admin dashboard endpoint. */
export type BioblitzAdminRoundData = {
  roundId: number;
  /** Eligible observations after current round exclusions. */
  totalObservations: number;
  registrants: BioblitzAdminRegistrant[];
};

/** A lightweight count for one round in the moderator round rail. */
export type BioblitzAdminRoundCount = {
  roundId: number;
  /** null means the count could not be loaded safely. */
  totalObservations: number | null;
};
