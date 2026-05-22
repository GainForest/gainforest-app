"use client";

import { Fragment } from "react";
import { BrushedText } from "../../_components/BrushedText";
import { useLocale } from "../../_components/LocaleProvider";
import { getResearchT } from "../_messages";

// "Eight years of open research, in the open." — editorial hero for
// the /research page. Mirrors the rhythm of <AboutHero /> but with a
// stat triplet on the right (peer-reviewed papers, open releases,
// years co-designing with frontline communities) instead of a live
// globe. The page already has a long carousel + ecosystem grid, so a
// quieter hero gives the rest of the page room to land.
//
// Numbers are intentionally hand-counted (not from an indexer feed):
// the page is a research index, not a live data dashboard. We'd
// rather under-count and bump the value when a new paper ships than
// pretend an upstream tracker exists.
export function ResearchHero() {
  const { locale } = useLocale();
  const t = getResearchT(locale);

  const before = t("research.hero.heading.before").trim();
  const italic = t("research.hero.heading.italic").trim();
  const after = t("research.hero.heading.after").trim();

  const kpis: ReadonlyArray<{ value: string; label: string }> = [
    {
      value: t("research.hero.kpi1.value"),
      label: t("research.hero.kpi1.label"),
    },
    {
      value: t("research.hero.kpi2.value"),
      label: t("research.hero.kpi2.label"),
    },
    {
      value: t("research.hero.kpi3.value"),
      label: t("research.hero.kpi3.label"),
    },
  ];

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1480px] grid-cols-12 gap-6 px-6 pt-12 pb-14 sm:px-10 lg:gap-12 lg:px-16 lg:pt-20 lg:pb-24">
        {/* LEFT: copy */}
        <div className="col-span-12 lg:col-span-7">
          <span className="font-instrument italic text-[13px] uppercase tracking-[0.22em] text-foreground/55">
            {t("research.eyebrow")}
          </span>
          <h1 className="mt-5 font-garamond text-[44px] sm:text-[60px] lg:text-[78px] font-normal leading-[1.04] tracking-[-0.015em] text-foreground">
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
            {t("research.hero.lede")}
          </p>
        </div>

        {/* RIGHT: stat triplet — three Garamond numbers stacked
            vertically, each with an italic Instrument Serif label
            beneath. Sits flush-right on desktop so the eye reads
            headline → numbers in a single sweep. */}
        <aside className="col-span-12 lg:col-span-5">
          <ul
            role="list"
            className="mt-4 flex flex-col divide-y divide-border-soft border-y border-border-soft lg:mt-2 lg:divide-y-0 lg:border-0"
          >
            {kpis.map((kpi, i) => (
              <li
                key={i}
                className="flex items-baseline gap-5 py-5 lg:py-6 lg:gap-7"
              >
                <span className="font-garamond text-[44px] sm:text-[52px] lg:text-[64px] font-normal leading-[0.95] tracking-[-0.015em] text-foreground">
                  {kpi.value}
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
