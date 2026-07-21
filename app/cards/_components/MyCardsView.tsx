"use client";

/**
 * "My Cards" — the gallery of collectibles a donor has vacuumed into their
 * account from post-checkout reward decks. Presentational: it renders whatever
 * collected cards it is handed, so the real route can wire it to the persisted
 * store while `/_test` feeds it fixtures.
 */

import { motion, useReducedMotion } from "framer-motion";
import { SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { DonationRewardCard } from "@/app/checkout/_components/DonationRewardCard";
import { useCollectedCards, type CollectedCard } from "@/app/_components/rewards/collected-cards";

export function MyCardsView({ cards, loading = false }: { cards: CollectedCard[]; loading?: boolean }) {
  const t = useTranslations("cart.myCards");
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-full px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-2 text-primary">
          <SparklesIcon className="size-5" aria-hidden />
          <span className="text-xs font-semibold uppercase tracking-[0.18em]">{t("eyebrow")}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">{t("title")}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{t("description")}</p>
          </div>
          {cards.length > 0 ? (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              {t("count", { count: cards.length })}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <div key={key} className="mx-auto aspect-[63/88] w-[21rem] max-w-full animate-pulse rounded-[1.7rem] bg-muted" />
            ))}
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
          <div className="mt-10 grid justify-items-center gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card, i) => (
              <motion.div
                key={card.id}
                initial={reduceMotion ? false : { opacity: 0, rotateY: -60, scale: 0.7, y: 30 }}
                whileInView={{ opacity: 1, rotateY: 0, scale: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 15, delay: Math.min(i, 5) * 0.08 }}
                style={{ transformStyle: "preserve-3d" }}
              >
                <DonationRewardCard
                  lines={card.lines}
                  totalUsd={card.totalUsd}
                  animateEntrance={false}
                  overall={card.variant === "total"}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Store-connected `/cards` view: reads the donor's persisted collection. */
export function MyCardsStoreView({ did }: { did: string | null }) {
  const { cards, hydrated } = useCollectedCards(did);
  return <MyCardsView cards={cards} loading={!hydrated} />;
}
