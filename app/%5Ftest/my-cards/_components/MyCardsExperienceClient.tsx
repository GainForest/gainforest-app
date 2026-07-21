"use client";

import Link from "next/link";
import { ArrowLeftIcon, FlaskConicalIcon, ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { MyCardsView } from "@/app/cards/_components/MyCardsView";
import { buildRewardCards, type RewardLine } from "@/app/checkout/_components/reward-model";
import { collectedFromReward } from "@/app/_components/rewards/collected-cards";

// A settled multi-project checkout, replayed as a collection so the gallery
// shows real collectibles (one per project plus the overall summary card).
const MOCK_LINES: RewardLine[] = [
  { kind: "donation", title: "Cloud Forest Corridor", orgName: "Test Registry Org", amountUsd: 60, image: "/assets/media/images/landing/supporter-river.jpg" },
  { kind: "donation", title: "Andes Cloudforest Watch", orgName: "Rainforest Trust", amountUsd: 40, image: null },
  { kind: "donation", title: "Mangrove Belt Restoration", orgName: "Ocean Guardians", amountUsd: 120, image: null },
  { kind: "tip", title: "GainForest tip", orgName: "GainForest", amountUsd: 12, image: null },
];

// Static timestamps keep the fixture ids stable across renders.
const MOCK_COLLECTED = buildRewardCards(MOCK_LINES).map((card, index) =>
  collectedFromReward(card, 1_720_000_000_000 + index),
);

export function MyCardsExperienceClient() {
  const t = useTranslations("cart.testRegistry");

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/_test"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          {t("backToRegistry")}
        </Link>

        <div className="mt-6 max-w-3xl">
          <div className="flex items-center gap-2 text-primary">
            <FlaskConicalIcon className="size-5" aria-hidden />
            <span className="text-xs font-semibold uppercase tracking-[0.18em]">{t("scenarioLabel")}</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{t("myCardsTitle")}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{t("myCardsDescription")}</p>
        </div>

        <aside className="mt-7 rounded-3xl border border-primary/20 bg-primary/[0.06] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <ShieldCheckIcon className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">{t("parityTitle")}</h2>
              <p className="mt-1 text-sm leading-6 text-foreground/75">{t("parityBody")}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{t("indexingNote")}</p>
            </div>
          </div>
        </aside>

        <section className="mt-8 overflow-hidden rounded-[2rem] border border-border-soft bg-surface shadow-sm">
          <MyCardsView cards={MOCK_COLLECTED} />
        </section>
      </div>
    </main>
  );
}
