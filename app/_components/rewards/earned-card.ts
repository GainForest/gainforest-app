import type { RewardCard } from "@/app/checkout/_components/reward-model";

/** Receipt-backed card DTO passed from the authenticated server route to UI. */
export type EarnedCard = RewardCard & {
  receiptUri: string;
  earnedAt: string | null;
  projectHref: string | null;
  paymentHref: string | null;
};

export type EarnedCardsResult = {
  cards: EarnedCard[];
  /** A source failed, so the visible collection may be incomplete. */
  partial: boolean;
};
