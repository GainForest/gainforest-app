"use client";

/** Receipt-backed "My Cards" gallery. Data is resolved by the authenticated
 * server route; this component only renders production states and fixtures. */

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangleIcon, BadgeCheckIcon, ExternalLinkIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { AuthButton } from "@/app/_components/AuthFlow";
import type { EarnedCard } from "@/app/_components/rewards/earned-card";
import { DonationRewardCard } from "@/app/checkout/_components/DonationRewardCard";
import { Button } from "@/components/ui/button";
import { DisplayHeading } from "@/components/ui/typography";

type CardsStatus = "ready" | "signedOut" | "unavailable";

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
  const format = useFormatter();
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-full px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <DisplayHeading as="h1" className="text-4xl text-foreground sm:text-6xl">{t("title")}</DisplayHeading>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{t("description")}</p>
          </div>
          {cards.length > 0 ? (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
              {t("count", { count: cards.length })}
            </span>
          ) : null}
        </div>

        {partial ? (
          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <p>{t("partialBody")}</p>
          </div>
        ) : null}

        {status === "signedOut" ? (
          <div className="mt-12 flex flex-col items-center gap-4 rounded-3xl bg-muted px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <SparklesIcon className="size-7" aria-hidden />
            </span>
            <h2 className="font-instrument text-2xl italic text-foreground">{t("signedOutTitle")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t("signedOutBody")}</p>
            <AuthButton session={{ isLoggedIn: false }} />
          </div>
        ) : status === "unavailable" ? (
          <div className="mt-12 flex flex-col items-center gap-4 rounded-3xl bg-muted px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-amber-500/10 text-amber-600">
              <AlertTriangleIcon className="size-7" aria-hidden />
            </span>
            <h2 className="font-instrument text-2xl italic text-foreground">{t("unavailableTitle")}</h2>
            <p className="max-w-md text-sm text-muted-foreground">{t("unavailableBody")}</p>
            <Button asChild variant="outline" className="mt-1 shadow-none">
              <Link href="/cards">{t("tryAgain")}</Link>
            </Button>
          </div>
        ) : cards.length === 0 ? (
          <div className="mt-12 flex flex-col items-center gap-4 rounded-3xl bg-muted px-6 py-16 text-center">
            <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <SparklesIcon className="size-7" aria-hidden />
            </span>
            <h2 className="font-instrument text-2xl italic text-foreground">{t("emptyTitle")}</h2>
            <p className="max-w-sm text-sm text-muted-foreground">{t("emptyBody")}</p>
            <Button asChild className="mt-1 shadow-none">
              <Link href="/projects">{t("browseProjects")}</Link>
            </Button>
          </div>
        ) : (
          <div className="mt-10 grid justify-items-center gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card, i) => {
              const earnedAt = card.earnedAt ? new Date(card.earnedAt) : null;
              const earnedLabel = earnedAt && !Number.isNaN(earnedAt.getTime())
                ? format.dateTime(earnedAt, { dateStyle: "medium" })
                : null;
              return (
                <motion.article
                  key={card.id}
                  initial={reduceMotion ? false : { opacity: 0, rotateY: -60, scale: 0.7, y: 30 }}
                  whileInView={{ opacity: 1, rotateY: 0, scale: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 90, damping: 15, delay: Math.min(i, 5) * 0.08 }}
                  style={{ transformStyle: "preserve-3d" }}
                  className="w-[21rem] max-w-full"
                >
                  <DonationRewardCard
                    lines={card.lines}
                    totalUsd={card.totalUsd}
                    animateEntrance={false}
                  />
                  <div className="mt-3 rounded-2xl bg-muted px-4 py-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
                        <BadgeCheckIcon className="size-4" aria-hidden />
                        {t("verifiedDonation")}
                      </span>
                      {earnedLabel ? <span className="text-muted-foreground">{earnedLabel}</span> : null}
                    </div>
                    {card.projectHref || card.paymentHref ? (
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 border-t border-border-soft pt-2">
                        {card.projectHref ? (
                          <Link href={card.projectHref} className="font-medium text-foreground hover:text-primary">
                            {t("viewProject")}
                          </Link>
                        ) : null}
                        {card.paymentHref ? (
                          <Link
                            href={card.paymentHref}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                          >
                            {t("viewPayment")}
                            <ExternalLinkIcon className="size-3" aria-hidden />
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
