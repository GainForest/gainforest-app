"use client";

import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { MyCardsView } from "@/app/cards/_components/MyCardsView";
import { buildRewardCards, type RewardLine } from "@/app/checkout/_components/reward-model";
import type { EarnedCard } from "@/app/_components/rewards/earned-card";
import { TestBadge } from "../../_components/TestBadge";

// Receipt-backed fixture data: one verified project receipt earns one card.
const MOCK_LINES: RewardLine[] = [
  { kind: "donation", title: "Cloud Forest Corridor", orgName: "Test Registry Org", amountUsd: 60, image: "/assets/media/images/landing/supporter-river.jpg", receiptUri: "at://did:plc:test/org.hypercerts.funding.receipt/1", cardEligible: true, txHash: `0x${"1".padStart(64, "0")}` },
  { kind: "donation", title: "Andes Cloudforest Watch", orgName: "Rainforest Trust", amountUsd: 40, image: null, receiptUri: "at://did:plc:test/org.hypercerts.funding.receipt/2", cardEligible: true, txHash: `0x${"2".padStart(64, "0")}` },
  { kind: "donation", title: "Mangrove Belt Restoration", orgName: "Ocean Guardians", amountUsd: 120, image: null, receiptUri: "at://did:plc:test/org.hypercerts.funding.receipt/3", cardEligible: true, txHash: `0x${"3".padStart(64, "0")}` },
  { kind: "tip", title: "GainForest tip", orgName: "GainForest", amountUsd: 12, image: null },
];

// A direct gift to another account (e.g. a prize payout) earns a person card.
const MOCK_PERSON_CARD: EarnedCard = {
  id: "at://did:plc:test/org.hypercerts.funding.receipt/4",
  variant: "person",
  totalUsd: 49,
  lines: [
    { kind: "donation", title: "Amara Okafor", orgName: "Bioblitz winner", amountUsd: 49, image: null, receiptUri: "at://did:plc:test/org.hypercerts.funding.receipt/4", cardEligible: true, txHash: `0x${"4".padStart(64, "0")}` },
  ],
  receiptUri: "at://did:plc:test/org.hypercerts.funding.receipt/4",
  earnedAt: new Date(Date.UTC(2024, 6, 8)).toISOString(),
  projectHref: null,
  personHref: "/leaderboard",
  paymentHref: null,
};

const MOCK_CARDS: EarnedCard[] = [
  ...buildRewardCards(MOCK_LINES).map((card, index) => ({
    ...card,
    receiptUri: card.lines[0]!.receiptUri!,
    earnedAt: new Date(Date.UTC(2024, 6, 4 + index)).toISOString(),
    projectHref: "/projects",
    paymentHref: null,
  })),
  MOCK_PERSON_CARD,
];

export function MyCardsExperienceClient() {
  const t = useTranslations("cart.testRegistry");

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-4 mt-4 flex h-10 items-center gap-3 rounded-xl bg-muted px-4 sm:mx-6">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <Link href="/_test" className="inline-flex items-center text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeftIcon className="size-4" aria-hidden />
            <span className="sr-only">{t("backToRegistry")}</span>
          </Link>
          <h1 className="text-sm font-medium text-foreground">{t("myCardsTitle")}</h1>
          <div className="ml-auto">
            <TestBadge label={t("testBadge")} description={t("parityBody")} />
          </div>
        </div>
      </div>
      <MyCardsView cards={MOCK_CARDS} />
    </main>
  );
}
