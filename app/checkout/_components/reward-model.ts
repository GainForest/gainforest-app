/**
 * Shared, framework-free model for donation reward cards.
 *
 * Cards are views of verified project-funding receipts: one receipt earns one
 * card. This module keeps checkout presentation and the receipt-backed gallery
 * on the same shape without treating a browser action as card issuance.
 */

export type RewardLine = {
  kind: "donation" | "tip";
  title: string;
  orgName: string;
  amountUsd: number;
  image?: string | null;
  /** Public funding receipt that proves this contribution. */
  receiptUri?: string | null;
  /** The receipt is publicly attributed and strongly linked to a project. */
  cardEligible?: boolean;
  /** Settled payment represented by the receipt. */
  txHash?: string | null;
  /** Receipt timestamp, when available. */
  occurredAt?: string | null;
};

export type TierKey = "seedling" | "sapling" | "grove" | "canopy" | "oldGrowth";

export type Tier = {
  key: TierKey;
  /** Minimum total contribution (USD) to reach this tier. */
  min: number;
  /** Bold foil gradient — the card's colour identity. */
  foil: string;
  /** Glow accent behind the card. */
  glow: string;
};

/** Tiers climb with generosity; the top band stays a genuine rarity. */
export const TIERS: Tier[] = [
  { key: "seedling", min: 0, foil: "#34d399, #059669", glow: "#10b981" },
  { key: "sapling", min: 25, foil: "#2dd4bf, #0e7490", glow: "#14b8a6" },
  { key: "grove", min: 75, foil: "#818cf8, #6366f1, #a855f7", glow: "#7c6cf0" },
  { key: "canopy", min: 200, foil: "#fbbf24, #f97316, #ec4899", glow: "#f4813f" },
  { key: "oldGrowth", min: 750, foil: "#fde047, #f472b6, #22d3ee, #4ade80, #fde047", glow: "#f0abfc" },
];

export function tierForAmount(amountUsd: number): Tier {
  let match = TIERS[0];
  for (const tier of TIERS) if (amountUsd >= tier.min) match = tier;
  return match;
}

/** One collectible in a checkout's reward set. */
export type RewardCard = {
  /** Deterministic identity derived from the funding receipt/payment. */
  id: string;
  /** Kept explicit so the visual model cannot silently mix card types. */
  variant: "project";
  /** Donation lines represented on this card (one for a project, all for the total). */
  lines: RewardLine[];
  /** Amount shown on the card, in USD. */
  totalUsd: number;
};

/**
 * Build the reward set for a completed checkout. A settled transfer alone is
 * not enough: the line must carry a successfully written project funding
 * receipt. Tips and unbacked summary cards never become collectibles.
 */
export function buildRewardCards(lines: RewardLine[]): RewardCard[] {
  return lines.flatMap((line) => {
    if (
      line.kind !== "donation" ||
      line.cardEligible !== true ||
      typeof line.receiptUri !== "string" ||
      line.receiptUri.length === 0
    ) return [];
    return [{
      id: line.receiptUri,
      variant: "project" as const,
      lines: [line],
      totalUsd: line.amountUsd,
    }];
  });
}
