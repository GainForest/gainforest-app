"use client";

import { Fragment } from "react";
import { BrushedText } from "../../_components/BrushedText";
import { useLocale } from "../../_components/LocaleProvider";
import { getResearchT } from "../_messages";
import { PUBLICATIONS, WORKSHOP_PAPERS } from "../_data";

// Count of academic papers on this page. We compute it from the data
// arrays at render time so it can never drift behind reality —
// add a publication to PUBLICATIONS or WORKSHOP_PAPERS and the
// hero KPI ticks up automatically.
//
// Includes every PUBLICATIONS entry that's a paper / dataset /
// workshop (i.e. drops essays and invited talks, which aren't
// reviewed academic publications) plus every CCAI workshop entry.
// As of writing: 4 main-conference / journal papers + 6 CCAI
// workshop papers = 10. The hero kpi1.value in i18n is left empty
// because the live count below overrides it; the i18n label still
// names the venues so the locale block carries the human-facing
// translation.
const PAPER_KINDS = new Set(["paper", "dataset", "workshop"]);
const PAPERS_COUNT =
  PUBLICATIONS.filter((p) => PAPER_KINDS.has(p.kind)).length +
  WORKSHOP_PAPERS.length;

// "Open models for biodiversity." — editorial hero for the /research
// page. Mirrors the rhythm of <AboutHero /> AND <Hero /> on the
// landing: same Cormorant Garamond display sizes
// (`text-[44px] sm:text-[64px] lg:text-[88px]`) so all three pages
// read as one site when a visitor moves between them. Don't drift
// these sizes per-page — the design system holds the hero typography
// constant across routes by deliberate choice.
//
// Stat triplet on the right replaces the live globe / documentary
// photo used on the other heroes. KPI1 + KPI2 are hand-counted
// (peer-reviewed papers / open releases — both move slowly enough
// that an upstream tracker would be over-engineering). KPI3 is
// streamed live from Hyperindex: the `app.gainforest.dwc.occurrence`
// total, i.e. every Darwin Core biodiversity observation indexed
// across partner PDS instances. The page fetches that number
// server-side via `fetchOccurrenceCount()` and passes it down so
// this component stays a pure render.

// Locale codes for Intl.NumberFormat. The i18n locale codes are
// short ("en", "es", "pt", "sw", "id") so we map them to BCP 47
// region tags that produce the right thousands separators.
const INTL_LOCALES: Record<string, string> = {
  en: "en-US",
  es: "es-ES",
  pt: "pt-BR",
  sw: "sw-KE",
  id: "id-ID",
};

export function ResearchHero({
  occurrencesCount,
}: {
  /** Live total of `app.gainforest.dwc.occurrence` records on
   *  Hyperindex. Passed down by the server-rendered /research page;
   *  the page itself falls back to the most recent known value if
   *  the upstream is unreachable, so this is always a positive
   *  integer. */
  occurrencesCount: number;
}) {
  const { locale } = useLocale();
  const t = getResearchT(locale);

  const intlLocale = INTL_LOCALES[locale] ?? "en-US";
  const occurrencesFormatted = new Intl.NumberFormat(intlLocale).format(
    occurrencesCount,
  );

  const before = t("research.hero.heading.before").trim();
  const italic = t("research.hero.heading.italic").trim();
  const after = t("research.hero.heading.after").trim();

  const kpis: ReadonlyArray<{ value: string; label: string; live?: boolean }> = [
    {
      // Live count of academic papers on this page (carousel papers /
      // datasets / workshops + CCAI bibliography), computed above.
      value: String(PAPERS_COUNT),
      label: t("research.hero.kpi1.label"),
    },
    {
      value: t("research.hero.kpi2.value"),
      label: t("research.hero.kpi2.label"),
    },
    {
      value: occurrencesFormatted,
      label: t("research.hero.kpi3.label"),
      live: true,
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
          {/* Sizes locked to the landing / about hero — don't shrink
              per-page. */}
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
            {t("research.hero.lede")}
          </p>
        </div>

        {/* RIGHT: stat triplet. Garamond number + italic label per
            row; the third row carries a small LIVE pill since its
            value streams live from Hyperindex (matches the LIVE
            chip on AboutStats). Big numbers shrink slightly so a
            6-digit occurrence count doesn't overflow the column on
            narrow desktops. */}
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
                {kpi.live && (
                  <span
                    className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-brand-dark"
                    title="Streamed from the GainForest indexer"
                  >
                    <span
                      aria-hidden
                      className="inline-block h-1.5 w-1.5 rounded-full bg-brand animate-pulse"
                    />
                    {t("research.live.label")}
                  </span>
                )}
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
