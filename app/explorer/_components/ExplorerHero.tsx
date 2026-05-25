"use client";

import { Fragment } from "react";
import { BrushedText } from "../../_components/BrushedText";
import { useLocale } from "../../_components/LocaleProvider";
import { getExplorerT } from "../_messages";

// "Browse the living data commons." ; editorial hero for /explorer.
//
// Mirrors the rhythm of <AboutHero /> + <ResearchHero /> + the
// landing <Hero /> so all four pages read as one site when a visitor
// moves between them. Same Cormorant Garamond display sizes
// (`text-[44px] sm:text-[64px] lg:text-[88px]`); same Instrument
// Serif italic emphasis word; same brushed cubic curve under one
// marked word.
//
// Two KPIs in the right column, both sourced live:
//   1. Bumicerts total ; hyperlabel's high-quality count.
//   2. Darwin Core observations total ; appGainforestDwcOccurrence
//      `totalCount` from Hyperindex.
//
// A third "communities" stat used to live here, but it depended on
// walking the indexer feed which is now done in the browser inside
// <SpecimenWall />. The wall renders its own communities count
// once its client-side walk completes ; keeping it out of the hero
// avoids a number that has to update post-mount in the headline.

const INTL_LOCALES: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  pt: "pt-BR",
  sw: "sw-KE",
  id: "id-ID",
};

export function ExplorerHero({
  bumicertsTotal,
  occurrencesTotal,
}: {
  bumicertsTotal: number;
  occurrencesTotal: number;
}) {
  const { locale } = useLocale();
  const t = getExplorerT(locale);
  const fmt = new Intl.NumberFormat(INTL_LOCALES[locale] ?? "en-US");

  const before = t("explorer.hero.heading.before").trim();
  const italic = t("explorer.hero.heading.italic").trim();
  const after = t("explorer.hero.heading.after").trim();

  const kpis: ReadonlyArray<{ value: string; label: string }> = [
    { value: fmt.format(bumicertsTotal), label: t("explorer.hero.kpi1.label") },
    { value: fmt.format(occurrencesTotal), label: t("explorer.hero.kpi2.label") },
  ];

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-12 gap-6 px-6 pt-12 pb-14 sm:px-10 lg:gap-12 lg:px-16 lg:pt-20 lg:pb-24">
        {/* LEFT: copy */}
        <div className="col-span-12 lg:col-span-7">
          <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
            {t("explorer.eyebrow")}
          </span>
          <h1 className="mt-5 font-garamond text-[44px] sm:text-[64px] lg:text-[88px] font-normal leading-[1.04] tracking-[-0.015em] text-foreground">
            {before && (
              <Fragment>
                <BrushedText text={before} />{" "}
              </Fragment>
            )}
            <span className="font-instrument italic font-normal">
              {italic}
            </span>
            {after && (after === "." ? after : <span> {after}</span>)}
          </h1>
          <p className="mt-6 max-w-[560px] text-[16px] lg:text-[18.5px] leading-[1.55] text-foreground/80">
            {t("explorer.hero.lede")}
          </p>
        </div>

        {/* RIGHT: live stat triplet. Each row carries a small LIVE
            pill because all three numbers stream from the indexer at
            request time. Matches AboutStats / ResearchHero. */}
        <aside className="col-span-12 lg:col-span-5">
          <ul
            role="list"
            className="mt-4 flex flex-col divide-y divide-border-soft border-y border-border-soft lg:mt-2 lg:divide-y-0 lg:border-0"
          >
            {kpis.map((kpi, i) => (
              <li
                key={i}
                className="flex flex-wrap items-baseline gap-x-5 gap-y-2 py-5 lg:py-6 lg:gap-x-7"
              >
                <span className="font-garamond text-[40px] sm:text-[48px] lg:text-[56px] font-normal leading-[0.95] tracking-[-0.015em] text-foreground">
                  {kpi.value}
                </span>
                <span
                  className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-brand-dark"
                  title="Streamed from the GainForest indexer"
                >
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full bg-brand animate-pulse"
                  />
                  {t("explorer.live.label")}
                </span>
                <span className="font-instrument italic text-[14.5px] leading-[1.35] text-foreground/65 lg:text-[16px]">
                  {kpi.label}
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
