"use client";

/** Receipt-backed "My Cards" gallery. Data is resolved by the authenticated
 * server route; this component only renders production states and fixtures. */

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangleIcon, ArrowUpRightIcon, Share2Icon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AuthButton } from "@/app/_components/AuthFlow";
import type { EarnedCard } from "@/app/_components/rewards/earned-card";
import { DonationRewardCard } from "@/app/checkout/_components/DonationRewardCard";
import { tierForAmount, type Tier } from "@/app/checkout/_components/reward-model";
import { Button } from "@/components/ui/button";

type CardsStatus = "ready" | "signedOut" | "unavailable";
type SortOrder = "newest" | "oldest";

type TierFilter = "all" | Tier["key"];

export function MyCardsView({
  cards,
  status = "ready",
  partial = false,
}: {
  cards: EarnedCard[];
  status?: CardsStatus;
  partial?: boolean;
}) {
  const t = useTranslations("cart.myCards");
  const reduceMotion = useReducedMotion();
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  const cardsByTier = useMemo(() => cards.reduce<Record<Tier["key"], number>>(
    (counts, card) => {
      counts[tierForAmount(card.totalUsd).key] += 1;
      return counts;
    },
    { seedling: 0, sapling: 0, grove: 0, canopy: 0, oldGrowth: 0 },
  ), [cards]);
  const visibleCards = useMemo(() => cards
    .filter((card) => tierFilter === "all" || tierForAmount(card.totalUsd).key === tierFilter)
    .toSorted((a, b) => {
      const aTime = a.earnedAt ? Date.parse(a.earnedAt) : 0;
      const bTime = b.earnedAt ? Date.parse(b.earnedAt) : 0;
      return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
    }), [cards, sortOrder, tierFilter]);
  const shareCard = async (card: EarnedCard) => {
    const href = card.projectHref ?? card.personHref ?? "/cards";
    const url = new URL(href, window.location.origin).toString();
    const shareData = { title: t("shareCard"), text: t("shareCardText"), url };

    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
    await navigator.clipboard?.writeText(url);
  };

  const filters: Array<{ key: TierFilter; count: number; label: string }> = [
    { key: "all", count: cards.length, label: t("filterAll", { count: cards.length }) },
    ...(["seedling", "sapling", "grove", "canopy", "oldGrowth"] as const)
      .filter((tier) => cardsByTier[tier] > 0)
      .map((tier) => ({
        key: tier,
        count: cardsByTier[tier],
        label: t("filterTier", { tier: t(`tiers.${tier}`), count: cardsByTier[tier] }),
      })),
  ];

  return (
    <div className="min-h-full px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-7xl">
        <div>
          <h1 className="font-instrument text-4xl italic leading-none text-foreground sm:text-5xl">{t("title")}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">{t("description")}</p>
        </div>

        {partial ? (
          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <p>{t("partialBody")}</p>
          </div>
        ) : null}

        {status === "signedOut" ? (
          <div className="mt-12 flex flex-col items-center gap-4 rounded-[2rem] border border-dashed border-border-soft bg-surface/60 px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <SparklesIcon className="size-7" aria-hidden />
            </span>
            <p className="font-instrument text-2xl italic text-foreground">{t("signedOutTitle")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("signedOutBody")}</p>
            <AuthButton session={{ isLoggedIn: false }} />
          </div>
        ) : status === "unavailable" ? (
          <div className="mt-12 flex flex-col items-center gap-4 rounded-[2rem] border border-dashed border-border-soft bg-surface/60 px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-600">
              <AlertTriangleIcon className="size-7" aria-hidden />
            </span>
            <p className="font-instrument text-2xl italic text-foreground">{t("unavailableTitle")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("unavailableBody")}</p>
            <Button asChild variant="outline" className="mt-1 shadow-none">
              <Link href="/cards">{t("tryAgain")}</Link>
            </Button>
          </div>
        ) : cards.length === 0 ? (
          <div className="mt-12 flex flex-col items-center gap-4 rounded-[2rem] border border-dashed border-border-soft bg-surface/60 px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <SparklesIcon className="size-7" aria-hidden />
            </span>
            <p className="font-instrument text-2xl italic text-foreground">{t("emptyTitle")}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{t("emptyBody")}</p>
            <Button asChild className="mt-1 shadow-none">
              <Link href="/projects">{t("browseProjects")}</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-8 border-b border-border-soft pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("filterLabel")}>
                  {filters.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      role="tab"
                      aria-selected={tierFilter === filter.key}
                      onClick={() => setTierFilter(filter.key)}
                      className={tierFilter === filter.key
                        ? "rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground"
                        : "rounded-full px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
                <label className="sr-only" htmlFor="cards-sort">{t("sortLabel")}</label>
                <select
                  id="cards-sort"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value as SortOrder)}
                  className="h-10 rounded-xl border border-border bg-background px-3 text-sm text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="newest">{t("newestFirst")}</option>
                  <option value="oldest">{t("oldestFirst")}</option>
                </select>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,15.75rem),1fr))] justify-items-center gap-x-6 gap-y-8">
            {visibleCards.map((card, i) => {
              const viewHref = card.projectHref ?? card.personHref ?? card.paymentHref ?? "/cards";
              return (
                <motion.article
                  key={card.id}
                  initial={reduceMotion ? false : { opacity: 0, rotateY: -60, scale: 0.7, y: 30 }}
                  whileInView={{ opacity: 1, rotateY: 0, scale: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 15, delay: Math.min(i, 5) * 0.08 }}
                  style={{ transformStyle: "preserve-3d" }}
                  className="w-full max-w-[15.75rem]"
                >
                  <DonationRewardCard
                    lines={card.lines}
                    totalUsd={card.totalUsd}
                    variant={card.variant}
                    animateEntrance={false}
                    actions={(
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant="secondary" size="sm" onClick={() => void shareCard(card)}>
                          <Share2Icon aria-hidden />
                          {t("shareCard")}
                        </Button>
                        <Button asChild size="sm">
                          <Link
                            href={viewHref}
                            target={card.paymentHref === viewHref ? "_blank" : undefined}
                            rel={card.paymentHref === viewHref ? "noreferrer" : undefined}
                          >
                            {t("viewCard")}
                            <ArrowUpRightIcon aria-hidden />
                          </Link>
                        </Button>
                      </div>
                    )}
                  />
                </motion.article>
              );
            })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
