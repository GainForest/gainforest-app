/**
 * Shared, framework-free model for donation reward cards.
 *
 * A single donation checkout mints several collectibles: one card per
 * org/project that received a donation, plus one "overall" card summarising
 * the whole contribution. This module derives that set from the settled lines
 * the checkout already has, so the reward deck (post-checkout), the header
 * collect animation, and the "My Cards" gallery all agree on the same shape.
 */

export type RewardLine = {
  kind: "donation" | "tip";
  title: string;
  orgName: string;
  amountUsd: number;
  image?: string | null;
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
  /** Stable id within the set (also used as the persisted card id). */
  id: string;
  /** Per-project collectible, or the overall summary of the whole checkout. */
  variant: "project" | "total";
  /** Donation lines represented on this card (one for a project, all for the total). */
  lines: RewardLine[];
  /** Amount shown on the card, in USD. */
  totalUsd: number;
};

/**
 * Build the reward set for a completed checkout:
 * one card per settled donation line, plus a final "overall" card when more
 * than one project was supported. Tips fold into the overall total but never
 * mint their own card.
 */
export function buildRewardCards(lines: RewardLine[]): RewardCard[] {
  const donationLines = lines.filter((line) => line.kind === "donation");
  if (donationLines.length === 0) return [];

  const cards: RewardCard[] = donationLines.map((line, index) => ({
    id: `project-${index}`,
    variant: "project",
    lines: [line],
    totalUsd: line.amountUsd,
  }));

  // The overall card only earns its place once several projects were backed;
  // with a single project it would just duplicate the one project card.
  if (donationLines.length > 1) {
    const grandTotal = lines.reduce((total, line) => total + line.amountUsd, 0);
    cards.push({
      id: "overall",
      variant: "total",
      lines: donationLines,
      totalUsd: Math.round(grandTotal * 100) / 100,
    });
  }

  return cards;
}
